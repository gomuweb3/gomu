import { ContractReceipt, ContractTransaction } from "@ethersproject/contracts";
import { PostOrderResponsePayload } from "@traderxyz/nft-swap-sdk/dist/sdk/v4/orderbook";
import { Order as _OpenseaOrder } from "opensea-js/lib/types";

export interface Asset {
  /** The asset's contract address */
  tokenAddress: string;

  /** The asset's token ID, optional if ERC-20 */
  tokenId?: string;

  type: "ERC20" | "ERC721" | "ERC1155";

  amount: bigint;
}

export interface MakeOrderOptions {
  taker?: string;
}

interface Opensea {
  marketplaceName: "opensea";
}

interface TraderXyz {
  marketplaceName: "traderxyz";
}

export interface OpenseaOrder extends Opensea {
  marketplaceOrder: _OpenseaOrder;
}

export interface TraderXyzOrder extends TraderXyz {
  marketplaceOrder: PostOrderResponsePayload;
}

export type Order = OpenseaOrder | TraderXyzOrder;

export interface GetOrdersOptions {
  maker?: string;
  makerAsset?: Asset;
  taker?: string;
  takerAsset?: Asset;
}

export interface GetOrdersResponse {
  orders: Order[];
}

export interface OpenseaTakeOrderResponse extends Opensea {
  marketplaceResponse: string;
}

export interface TraderXyzTakeOrderResponse extends TraderXyz {
  marketplaceResponse: ContractReceipt;
}

export type TakeOrderResponse =
  | OpenseaTakeOrderResponse
  | TraderXyzTakeOrderResponse;

export interface OpenseaCancelOrderResponse extends Opensea {
  marketplaceResponse: void;
}

export interface TraderXyzCancelOrderResponse extends TraderXyz {
  marketplaceResponse: ContractTransaction;
}

export type CancelOrderResponse =
  | OpenseaCancelOrderResponse
  | TraderXyzCancelOrderResponse;
