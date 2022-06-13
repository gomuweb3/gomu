import type {
  ContractReceipt,
  ContractTransaction,
} from "@ethersproject/contracts";
import type { PostOrderResponsePayload } from "@traderxyz/nft-swap-sdk/dist/sdk/v4/orderbook";
import type { Order as _OpenseaOrder } from "opensea-js/lib/types";

export type OpenseaOriginalOrder = _OpenseaOrder;
export type TraderOriginalOrder = PostOrderResponsePayload;

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

  /** Selected marketplaces */
  marketplaces?: `${MarketplaceName}`[];
}

export type MakeSellOrderParams = Omit<
  MakeOrderParams,
  "makerAssets" | "takerAssets"
> & {
  assets: Asset[];
  erc20Asset: Omit<Erc20Asset, "type">;
};

export type MakeBuyOrderParams = MakeSellOrderParams;

export enum MarketplaceName {
  Opensea = "opensea",
  Trader = "trader",
}

interface Opensea {
  marketplaceName: MarketplaceName.Opensea;
}

interface Trader {
  marketplaceName: MarketplaceName.Trader;
}

export interface NormalizedOrder {
  id: string;
  asset: {
    contractAddress: string;
    tokenId: string;
    type: string;
    amount: string;
  };
  erc20Asset: {
    contractAddress: string;
    amount: string;
  };
}

export interface OpenseaOrder extends Opensea {
  marketplaceOrder: OpenseaOriginalOrder;
  normalizedOrder: NormalizedOrder;
}

export interface TraderOrder extends Trader {
  marketplaceOrder: TraderOriginalOrder;
  normalizedOrder: NormalizedOrder;
}

export type Order = OpenseaOrder | TraderOrder;

interface MakeOrderError {
  marketplaceName: MarketplaceName;
  error: string;
}

export type MakeOrderResponse = Order | MakeOrderError;

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
