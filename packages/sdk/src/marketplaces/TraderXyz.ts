import { ContractReceipt, ContractTransaction } from "@ethersproject/contracts";
import { NftSwapV4, SwappableAssetV4 } from "@traderxyz/nft-swap-sdk";
import {
  PostOrderResponsePayload,
  SearchOrdersParams,
} from "@traderxyz/nft-swap-sdk/dist/sdk/v4/orderbook";

import { Asset, GetOrdersOptions, MakeOrderOptions } from "../types";

import { Marketplace } from "./Marketplace";

export class TraderXyz implements Marketplace<PostOrderResponsePayload> {
  private readonly chainId: number;
  private readonly nftSwapSdk: NftSwapV4;
  private readonly walletAddress: string;

  constructor(chainId: number, nftSwapSdk: NftSwapV4, walletAddress: string) {
    this.chainId = chainId;
    this.nftSwapSdk = nftSwapSdk;
    this.walletAddress = walletAddress;
  }

  async makeOrder(
    makerAsset: Asset,
    takerAsset: Asset,
    { taker }: MakeOrderOptions = {}
  ): Promise<PostOrderResponsePayload> {
    const nftSwapMakerAsset: SwappableAssetV4 = {
      tokenAddress: makerAsset.tokenAddress,
      // @ts-ignore
      tokenId: makerAsset.tokenId,
      type: makerAsset.type,
      amount: makerAsset.amount.toString(),
    };
    const nftSwapTakerAsset: SwappableAssetV4 = {
      tokenAddress: takerAsset.tokenAddress,
      // @ts-ignore
      tokenId: takerAsset.tokenId,
      type: takerAsset.type,
      amount: takerAsset.amount.toString(),
    };

    await this.approveAsset(nftSwapMakerAsset);

    const order = this.nftSwapSdk.buildOrder(
      // @ts-ignore
      nftSwapMakerAsset,
      nftSwapTakerAsset,
      this.walletAddress,
      {
        taker,
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
  }: GetOrdersOptions = {}): Promise<PostOrderResponsePayload[]> {
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

  async takeOrder(order: PostOrderResponsePayload): Promise<ContractReceipt> {
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
        gasLimit: "2000000",
      }
    );
    return fillTx.wait();
  }

  async cancelOrder(
    order: PostOrderResponsePayload
  ): Promise<ContractTransaction> {
    return this.nftSwapSdk.cancelOrder(
      order.order.nonce,
      order.nftType as "ERC721" | "ERC1155"
    );
  }

  private async approveAsset(asset: SwappableAssetV4): Promise<void> {
    const approvalStatus = await this.nftSwapSdk.loadApprovalStatus(
      asset,
      this.walletAddress
    );

    if (!approvalStatus.contractApproved) {
      const approvalTx = await this.nftSwapSdk.approveTokenOrNftByAsset(
        asset,
        this.walletAddress
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
  const { tokenAddress, tokenId, type } = asset;

  if (type === "ERC20") {
    newFilters.erc20Token = tokenAddress;
  } else if (type === "ERC721" || type === "ERC1155") {
    newFilters.nftType = type;
    newFilters.nftToken = tokenAddress;
    if (tokenId) {
      newFilters.nftTokenId = tokenId;
    }
  }

  return newFilters;
}
