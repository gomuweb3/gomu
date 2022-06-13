import { Signer } from "@ethersproject/abstract-signer";
import { BaseProvider } from "@ethersproject/providers";
import { NftSwapV4 } from "@traderxyz/nft-swap-sdk";

import {
  assertAssetsIsNotBundled,
  assertAssetsIsNotEmpty,
  assertAssetsIsNotErc20AndErc20,
  assertAssetsIsNotErc721Erc1155AndErc721Erc115,
} from "./validators";

import type {
  TraderOriginalOrder,
  Asset,
  GetOrdersParams,
  MakeOrderParams,
  NormalizedOrder,
} from "../types";
import type { Marketplace } from "./Marketplace";
import type {
  ContractReceipt,
  ContractTransaction,
} from "@ethersproject/contracts";
import type { SwappableAssetV4 } from "@traderxyz/nft-swap-sdk";
import type { SearchOrdersParams } from "@traderxyz/nft-swap-sdk/dist/sdk/v4/orderbook";

export interface TraderConfig {
  gasLimit?: number;
}

export interface _TraderConfig extends TraderConfig {
  provider: BaseProvider;
  chainId: number;
  address: string;
  signer: Signer;
}

export class Trader implements Marketplace<TraderOriginalOrder> {
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
    return [1, 3].includes(chainId);
  }

  async makeOrder({
    makerAssets,
    takerAssets,
    taker,
    expirationTime,
  }: MakeOrderParams): Promise<TraderOriginalOrder> {
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
    return this.nftSwapSdk.postOrder(signedOrder, this.chainId.toString());
  }

  async getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
  }: GetOrdersParams = {}): Promise<TraderOriginalOrder[]> {
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
    return resp.orders;
  }

  async takeOrder(order: TraderOriginalOrder): Promise<ContractReceipt> {
    const signedOrder = order.order;

    let takerAsset: SwappableAssetV4;
    if (order.sellOrBuyNft === "buy") {
      takerAsset = {
        tokenAddress: order.nftToken,
        tokenId: order.nftTokenId,
        type: order.nftType as "ERC721" | "ERC1155",
        amount: order.nftTokenAmount,
      };
    } else if (order.sellOrBuyNft === "sell") {
      takerAsset = {
        tokenAddress: order.erc20Token,
        type: "ERC20",
        amount: order.erc20TokenAmount,
      };
    } else {
      throw new Error(`unknown side: ${order.sellOrBuyNft}`);
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

  async cancelOrder(order: TraderOriginalOrder): Promise<ContractTransaction> {
    return this.nftSwapSdk.cancelOrder(
      order.order.nonce,
      order.nftType as "ERC721" | "ERC1155"
    );
  }

  getNormalizedOrder(order: TraderOriginalOrder): NormalizedOrder {
    return {
      id: order.order.nonce,
      asset: {
        contractAddress: order.nftToken,
        tokenId: order.nftTokenId,
        type: order.nftType,
        amount: order.nftTokenAmount,
      },
      erc20Asset: {
        contractAddress: order.erc20Token,
        amount: order.erc20TokenAmount,
      },
    };
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
