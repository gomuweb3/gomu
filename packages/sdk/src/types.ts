import { ContractReceipt, ContractTransaction } from "@ethersproject/contracts";
import { PostOrderResponsePayload } from "@traderxyz/nft-swap-sdk/dist/sdk/v4/orderbook";
import { Order as _OpenseaOrder } from "opensea-js/lib/types";

export interface Erc20Asset {
  contractAddress: string;
  type: "ERC20";
  amount: bigint;
}

export interface Erc721Asset {
  contractAddress: string;
  tokenId: string;
  type: "ERC721";
}

export interface Erc1155Asset {
  contractAddress: string;
  tokenId: string;
  type: "ERC1155";
  amount: bigint;
}

export type Asset = Erc20Asset | Erc721Asset | Erc1155Asset;

export interface MakeOrderParams {
  /** Assets the user has */
  makerAssets: Asset[];

  /** Assets the user want */
  takerAssets: Asset[];

  /** If specified, only this address can take the order */
  taker?: string;

  /** Expiration time for the order */
  expirationTime?: Date;
}

export interface MakeOrderParamsSimplified {
  assets: Asset[];
  amount: bigint;
  paymentTokenAddress: string;
  taker?: string;
  expirationTime?: Date;
}

interface Opensea {
  marketplaceName: "opensea";
}

interface Trader {
  marketplaceName: "trader";
}

export interface OpenseaOrder extends Opensea {
  marketplaceOrder: _OpenseaOrder;
}

export interface TraderOrder extends Trader {
  marketplaceOrder: PostOrderResponsePayload;
}

export type Order = OpenseaOrder | TraderOrder;

export interface GetOrdersParams {
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

export interface TraderTakeOrderResponse extends Trader {
  marketplaceResponse: ContractReceipt;
}

export type TakeOrderResponse =
  | OpenseaTakeOrderResponse
  | TraderTakeOrderResponse;

export interface OpenseaCancelOrderResponse extends Opensea {
  marketplaceResponse: void;
}

export interface TraderCancelOrderResponse extends Trader {
  marketplaceResponse: ContractTransaction;
}

export type CancelOrderResponse =
  | OpenseaCancelOrderResponse
  | TraderCancelOrderResponse;
