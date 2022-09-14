import { Signer } from "@ethersproject/abstract-signer";
import { getAddress } from "@ethersproject/address";
import { ContractReceipt, ContractTransaction } from "@ethersproject/contracts";
import { BaseProvider } from "@ethersproject/providers";
import {
  convertAssetsToInternalFormat,
  encodeAssetData,
  encodeMultiAssetAssetData,
  getAmountFromAsset,
  NftSwapV3,
  SignedOrder,
  SupportedChainIdsV3,
  SwappableAsset,
} from "@traderxyz/nft-swap-sdk";

import { GomuOrderBook } from "../orderbooks/Gomu";
import {
  OrderBook,
  GetOrdersParams as OrderBookGetOrdersParams,
} from "../orderbooks/OrderBook";
import {
  AnyAsset,
  Asset,
  FeeAsset,
  GetOrdersParams,
  MakeOrderParams,
  TraderV3Order,
} from "../types";
import { filterEmpty } from "../utils";

import { Marketplace } from "./Marketplace";

export interface TraderV3Config {
  orderBook?: OrderBook<SignedOrder>;
}

export interface _TraderV3Config extends TraderV3Config {
  provider: BaseProvider;
  chainId: number;
  address: string;
  signer: Signer;
}

export const traderV3SupportedChainIds = Object.keys(SupportedChainIdsV3)
  .filter((key) => Number.isInteger(Number(key)))
  .map(Number);

export class TraderV3 implements Marketplace<TraderV3Order> {
  private readonly nftSwapSdk: NftSwapV3;
  private readonly chainId: number;
  private readonly address: string;
  private orderBook: OrderBook<SignedOrder>;

  constructor({
    provider,
    chainId,
    address,
    signer,
    orderBook,
  }: _TraderV3Config) {
    this.nftSwapSdk = new NftSwapV3(provider, signer, chainId);
    // We reset the gas buffer here instead of using init config because we cannot import the default gas multiples
    // from the lib as webpack projects will fail to compile the import.
    this.nftSwapSdk.gasBufferMultiples = {
      ...this.nftSwapSdk.gasBufferMultiples,
      [SupportedChainIdsV3.Mainnet]: 1.2,
    };
    this.chainId = chainId;
    this.address = address;
    this.orderBook = orderBook || new GomuOrderBook<SignedOrder>();

    this.approveAsset = this.approveAsset.bind(this);
  }

  static supportsChainId(chainId: number): boolean {
    return traderV3SupportedChainIds.includes(chainId);
  }

  async makeOrder({
    makerAssets: _makerAssets,
    takerAssets: _takerAssets,
    taker,
    expirationTime,
    makerFees,
    takerFees,
  }: MakeOrderParams): Promise<any> {
    const makerAssets = _makerAssets.map(getSwappableAssetV3);
    const takerAssets = _takerAssets.map(getSwappableAssetV3);

    await Promise.all(makerAssets.map(this.approveAsset));

    const feeConfig = getFeeConfig({ makerFees, takerFees });

    const order = this.nftSwapSdk.buildOrder(
      makerAssets,
      takerAssets,
      getAddress(this.address),
      {
        ...(taker && { takerAddress: getAddress(taker) }),
        expiration: expirationTime,
        ...feeConfig,
      }
    );

    const signedOrder = await this.nftSwapSdk.signOrder(order, this.address);

    return this.orderBook.makeOrder({
      chainId: this.chainId.toString(),
      maker: this.address,
      makerAssets: _makerAssets,
      takerAssets: _takerAssets,
      taker,
      originalOrder: signedOrder,
      makerFees,
      takerFees,
      expirationTime,
    });
  }

  async getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
    status,
  }: GetOrdersParams): Promise<any> {
    const { contractAddress: makerContractAddress, tokenId: makerTokenId } =
      (makerAsset as AnyAsset) ?? {};
    const { contractAddress: takerContractAddress, tokenId: takerTokenId } =
      (takerAsset as AnyAsset) ?? {};

    const params: OrderBookGetOrdersParams = filterEmpty({
      chainId: this.chainId.toString(),
      maker,
      makerContractAddress,
      makerTokenId,
      taker,
      takerContractAddress,
      takerTokenId,
      status,
    });

    const { data } = await this.orderBook.getOrders(params);
    return data;
  }

  async takeOrder(order: TraderV3Order): Promise<ContractReceipt> {
    const { originalOrder: signedOrder } = order;

    await Promise.all(order.takerAssets.map(this.approveAsset));

    const fillTx = await this.nftSwapSdk.fillSignedOrder(signedOrder);
    return fillTx.wait();
  }

  cancelOrder(order: TraderV3Order): Promise<ContractTransaction> {
    return this.nftSwapSdk.cancelOrder(order.originalOrder);
  }

  async approveAsset(asset: Asset | SwappableAsset): Promise<void> {
    const swappableAsset =
      "tokenAddress" in asset ? asset : getSwappableAssetV3(asset);

    const approvalStatus = await this.nftSwapSdk.loadApprovalStatus(
      swappableAsset,
      this.address
    );

    if (!approvalStatus.contractApproved) {
      const approvalTx = await this.nftSwapSdk.approveTokenOrNftByAsset(
        swappableAsset,
        this.address
      );
      await approvalTx.wait();
    }
  }
}

function getSwappableAssetV3(asset: Asset): SwappableAsset {
  const { contractAddress, type } = asset;
  switch (type) {
    case "ERC20":
      return {
        tokenAddress: contractAddress,
        type,
        amount: asset.amount.toString(),
      };
    case "ERC721":
      return {
        tokenAddress: contractAddress,
        tokenId: asset.tokenId,
        type,
      };
    case "ERC1155":
      return {
        tokenAddress: contractAddress,
        tokenId: asset.tokenId,
        type,
        amount: asset.amount.toString(),
      };
    default:
      throw new Error(`unknown asset type: ${type}`);
  }
}

function getFeeConfig({
  makerFees = [],
  takerFees = [],
}: {
  makerFees?: FeeAsset[];
  takerFees?: FeeAsset[];
}): {
  feeRecipientAddress?: string;
  makerFeeAssetData?: string;
  takerFeeAssetData?: string;
  makerFee?: string;
  takerFee?: string;
} {
  const recipientAddresses = [
    ...new Set(
      makerFees
        .map(byRecipientAddress)
        .concat(takerFees.map(byRecipientAddress))
    ),
  ];
  if (recipientAddresses.length > 1) {
    throw new Error("cannot have more than 1 recipient address");
  }

  let feeRecipientAddress: string | undefined;
  if (recipientAddresses.length === 1) {
    feeRecipientAddress = recipientAddresses[0];
  }

  const { amount: makerFee, data: makerFeeAssetData } =
    getFeeData(makerFees.map(getSwappableAssetV3)) || {};
  const { amount: takerFee, data: takerFeeAssetData } =
    getFeeData(takerFees.map(getSwappableAssetV3)) || {};

  return {
    feeRecipientAddress,
    makerFeeAssetData,
    takerFeeAssetData,
    makerFee,
    takerFee,
  };
}

function byRecipientAddress(asset: FeeAsset): string {
  return asset.recipientAddress;
}

function getFeeData(_assets: SwappableAsset[]): {
  amount: string;
  data: string;
} | null {
  if (!_assets.length) {
    return null;
  }

  const assets = convertAssetsToInternalFormat(_assets);
  if (assets.length === 1) {
    const asset = assets[0];
    return {
      amount: getAmountFromAsset(asset),
      data: encodeAssetData(asset, false),
    };
  }

  const amounts = assets.map((asset) => getAmountFromAsset(asset));
  const datas = assets.map((asset) => encodeAssetData(asset, true));
  return {
    amount: "1", // Needs to be 1 for multiasset wrapper amount (actual amounts are nested)
    data: encodeMultiAssetAssetData(amounts, datas),
  };
}
