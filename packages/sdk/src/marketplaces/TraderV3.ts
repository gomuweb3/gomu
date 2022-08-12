import { Signer } from "@ethersproject/abstract-signer";
import { ContractReceipt, ContractTransaction } from "@ethersproject/contracts";
import { BaseProvider } from "@ethersproject/providers";
import {
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
  GetOrdersParams,
  MakeOrderParams,
  TraderV3Order,
} from "../types";

import { Marketplace } from "./Marketplace";

export interface TraderV3Config {
  gasLimit?: number;
}

export interface _TraderV3Config extends TraderV3Config {
  provider: BaseProvider;
  chainId: number;
  address: string;
  signer: Signer;
  orderBook?: OrderBook<SignedOrder>;
}

export const traderV3SupportedChainIds = Object.keys(SupportedChainIdsV3)
  .filter((key) => Number.isInteger(Number(key)))
  .map(Number);

export class TraderV3 implements Marketplace<TraderV3Order> {
  private readonly nftSwapSdk: NftSwapV3;
  private readonly chainId: number;
  private readonly address: string;
  private readonly gasLimit: number;
  private orderBook: OrderBook<SignedOrder>;

  constructor({
    provider,
    chainId,
    address,
    signer,
    gasLimit = 2000000,
    orderBook = new GomuOrderBook<SignedOrder>(),
  }: _TraderV3Config) {
    this.nftSwapSdk = new NftSwapV3(provider, signer, chainId);
    this.chainId = chainId;
    this.address = address;
    this.gasLimit = gasLimit;
    this.orderBook = orderBook;

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
  }: MakeOrderParams): Promise<any> {
    const makerAssets = _makerAssets.map(getSwappableAssetV3);
    const takerAssets = _takerAssets.map(getSwappableAssetV3);

    await Promise.all(makerAssets.map(this.approveAsset));

    const order = this.nftSwapSdk.buildOrder(
      makerAssets,
      takerAssets,
      this.address,
      {
        takerAddress: taker,
        expiration: expirationTime,
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
    });
  }

  async getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
  }: GetOrdersParams): Promise<any> {
    const { contractAddress: makerContractAddress, tokenId: makerTokenId } =
      (makerAsset as AnyAsset) ?? {};
    const { contractAddress: takerContractAddress, tokenId: takerTokenId } =
      (takerAsset as AnyAsset) ?? {};

    const params: OrderBookGetOrdersParams = Object.fromEntries(
      Object.entries({
        chainId: this.chainId.toString(),
        maker,
        makerContractAddress,
        makerTokenId,
        taker,
        takerContractAddress,
        takerTokenId,
      }).filter(([_, v]) => v)
    );

    const { data } = await this.orderBook.getOrders(params);
    return data;
  }

  async takeOrder(order: TraderV3Order): Promise<ContractReceipt> {
    const { originalOrder: signedOrder } = order;

    const takerAssets: SwappableAsset[] =
      order.takerAssets.map(getSwappableAssetV3);

    await Promise.all(takerAssets.map(this.approveAsset));

    const fillTx = await this.nftSwapSdk.fillSignedOrder(
      signedOrder,
      undefined,
      {
        gasLimit: this.gasLimit,
      }
    );
    return fillTx.wait();
  }

  cancelOrder(order: TraderV3Order): Promise<ContractTransaction> {
    return this.nftSwapSdk.cancelOrder(order.originalOrder);
  }

  private async approveAsset(asset: SwappableAsset): Promise<void> {
    const approvalStatus = await this.nftSwapSdk.loadApprovalStatus(
      asset,
      this.address
    );

    if (!approvalStatus.contractApproved) {
      const approvalTx = await this.nftSwapSdk.approveTokenOrNftByAsset(
        asset,
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
