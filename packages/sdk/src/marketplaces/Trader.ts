import { Signer } from "@ethersproject/abstract-signer";
import { BaseProvider } from "@ethersproject/providers";
import { NftSwapV4, SupportedChainIdsV4 } from "@traderxyz/nft-swap-sdk";

import {
  assertAssetsIsNotBundled,
  assertAssetsIsNotEmpty,
  assertAssetsIsNotErc20AndErc20,
  assertAssetsIsNotErc721Erc1155AndErc721Erc115,
} from "./validators";

import type {
  Asset,
  GetOrdersParams,
  MakeOrderParams,
  TraderOrder,
} from "../types";
import type { Marketplace } from "./Marketplace";
import type {
  ContractReceipt,
  ContractTransaction,
} from "@ethersproject/contracts";
import type { SwappableAssetV4 } from "@traderxyz/nft-swap-sdk";
import type {
  SearchOrdersParams,
  PostOrderResponsePayload as TraderOriginalOrder,
} from "@traderxyz/nft-swap-sdk/dist/sdk/v4/orderbook";

export interface TraderConfig {
  gasLimit?: number;
}

export interface _TraderConfig extends TraderConfig {
  provider: BaseProvider;
  chainId: number;
  address: string;
  signer: Signer;
}

export const traderSupportedChainIds = Object.keys(SupportedChainIdsV4)
  .filter((key) => Number.isInteger(Number(key)))
  .map(Number);

export class Trader implements Marketplace<TraderOrder> {
  private readonly nftSwapSdk: NftSwapV4;
  private readonly chainId: number;
  private readonly address: string;
  private readonly gasLimit: number;

  constructor({
    provider,
    chainId,
    address,
    signer,
    gasLimit = 2000000,
  }: _TraderConfig) {
    this.nftSwapSdk = new NftSwapV4(provider, signer, chainId);
    this.chainId = chainId;
    this.address = address;
    this.gasLimit = gasLimit;
  }

  static supportsChainId(chainId: number): boolean {
    return traderSupportedChainIds.includes(chainId);
  }

  async makeOrder({
    makerAssets,
    takerAssets,
    taker,
    expirationTime,
  }: MakeOrderParams): Promise<TraderOrder> {
    assertAssetsIsNotEmpty(makerAssets, "maker");
    assertAssetsIsNotEmpty(takerAssets, "taker");
    assertAssetsIsNotBundled(makerAssets);
    assertAssetsIsNotBundled(takerAssets);

    let makerAsset: Asset | SwappableAssetV4 = makerAssets[0];
    let takerAsset: Asset | SwappableAssetV4 = takerAssets[0];
    assertAssetsIsNotErc20AndErc20(makerAsset, takerAsset);
    assertAssetsIsNotErc721Erc1155AndErc721Erc115(makerAsset, takerAsset);

    makerAsset = getSwappableAssetV4(makerAsset);
    takerAsset = getSwappableAssetV4(takerAsset);

    await this.approveAsset(makerAsset);

    const order = this.nftSwapSdk.buildOrder(
      // @ts-ignore
      makerAsset,
      takerAsset,
      this.address,
      {
        taker,
        expiry: expirationTime,
      }
    );
    const signedOrder = await this.nftSwapSdk.signOrder(order);

    const postedOrder = await this.nftSwapSdk.postOrder(
      signedOrder,
      this.chainId.toString()
    );

    return normalizeOrder(postedOrder);
  }

  async getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
  }: GetOrdersParams = {}): Promise<TraderOrder[]> {
    let filters: Partial<SearchOrdersParams> = {};

    if (makerAsset) {
      filters = addAssetFilters(filters, makerAsset);
    }

    if (maker) {
      filters.maker = maker;
    }

    if (takerAsset) {
      filters = addAssetFilters(filters, takerAsset);
    }

    if (taker) {
      filters.taker = taker;
    }

    const resp = await this.nftSwapSdk.getOrders(filters);
    return resp.orders.map(normalizeOrder);
  }

  async takeOrder({ originalOrder }: TraderOrder): Promise<ContractReceipt> {
    const signedOrder = originalOrder.order;

    let takerAsset: SwappableAssetV4;
    if (originalOrder.sellOrBuyNft === "buy") {
      takerAsset = {
        tokenAddress: originalOrder.nftToken,
        tokenId: originalOrder.nftTokenId,
        type: originalOrder.nftType as "ERC721" | "ERC1155",
        amount: originalOrder.nftTokenAmount,
      };
    } else if (originalOrder.sellOrBuyNft === "sell") {
      takerAsset = {
        tokenAddress: originalOrder.erc20Token,
        type: "ERC20",
        amount: originalOrder.erc20TokenAmount,
      };
    } else {
      throw new Error(`unknown side: ${originalOrder.sellOrBuyNft}`);
    }

    await this.approveAsset(takerAsset);

    const fillTx = await this.nftSwapSdk.fillSignedOrder(
      signedOrder,
      undefined,
      {
        gasLimit: this.gasLimit,
      }
    );
    return fillTx.wait();
  }

  async cancelOrder({
    originalOrder,
  }: TraderOrder): Promise<ContractTransaction> {
    return this.nftSwapSdk.cancelOrder(
      originalOrder.order.nonce,
      originalOrder.nftType as "ERC721" | "ERC1155"
    );
  }

  private async approveAsset(asset: SwappableAssetV4): Promise<void> {
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

function addAssetFilters(
  filters: Partial<SearchOrdersParams>,
  asset: Asset
): Partial<SearchOrdersParams> {
  const newFilters = { ...filters };
  const { contractAddress, type } = asset;

  switch (type) {
    case "ERC20":
      newFilters.erc20Token = contractAddress;
      break;
    case "ERC721":
      newFilters.nftToken = contractAddress;
      break;
    case "ERC1155":
      newFilters.nftToken = contractAddress;
      newFilters.nftTokenId = asset.tokenId;
      break;
    default:
      throw new Error(`unknown asset type: ${type}`);
  }

  return newFilters;
}

function getSwappableAssetV4(asset: Asset): SwappableAssetV4 {
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

function normalizeOrder(order: TraderOriginalOrder): TraderOrder {
  const isSellOrder = order.sellOrBuyNft === ORDER_SIDE_SELL;

  const nftAsset = determineNftAsset(order);

  const erc20Asset = {
    contractAddress: order.erc20Token,
    type: "ERC20",
    amount: BigInt(order.erc20TokenAmount),
  } as const;

  return {
    id: order.order.nonce,
    makerAssets: isSellOrder ? [nftAsset] : [erc20Asset],
    takerAssets: isSellOrder ? [erc20Asset] : [nftAsset],
    maker: order.order.maker,
    originalOrder: order,
  };
}

function determineNftAsset(order: TraderOriginalOrder): Asset {
  if (order.nftType === "ERC721") {
    return {
      type: order.nftType,
      contractAddress: order.nftToken,
      tokenId: order.nftTokenId,
    };
  }

  if (order.nftType === "ERC1155") {
    return {
      type: order.nftType,
      contractAddress: order.nftToken,
      tokenId: order.nftTokenId,
      amount: BigInt(order.nftTokenAmount),
    };
  }

  return {
    type: "Unknown",
    contractAddress: order.nftToken,
    tokenId: order.nftTokenId,
    amount: BigInt(order.nftTokenAmount),
  };
}

const ORDER_SIDE_SELL: TraderOriginalOrder["sellOrBuyNft"] = "sell";
