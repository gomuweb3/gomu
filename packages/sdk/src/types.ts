import type {
  MakeOrderResult as _LooksRareOrder,
  ContractReceipt as _LooksRareContractReceipt,
} from "./marketplaces/LooksRare";
import type {
  ContractReceipt,
  ContractTransaction,
} from "@ethersproject/contracts";
import type { PostOrderResponsePayload } from "@traderxyz/nft-swap-sdk/dist/sdk/v4/orderbook";
import type { OrderV2 as _OpenseaOrder } from "opensea-js/lib/orders/types";

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
  Looksrare = "looksrare",
}

interface Opensea {
  marketplaceName: MarketplaceName.Opensea;
}

interface Trader {
  marketplaceName: MarketplaceName.Trader;
}

interface Looksrare {
  marketplaceName: MarketplaceName.Looksrare;
}

export interface OpenseaOrder extends Opensea {
  marketplaceOrder: _OpenseaOrder;
}

export interface TraderOrder extends Trader {
  marketplaceOrder: PostOrderResponsePayload;
}

export interface LooksRareOrder extends Looksrare {
  marketplaceOrder: _LooksRareOrder;
}

export type Order = OpenseaOrder | TraderOrder | LooksRareOrder;

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

export interface LooksrareTakeOrderResponse extends Looksrare {
  marketplaceResponse: _LooksRareContractReceipt;
}

export type TakeOrderResponse =
  | OpenseaTakeOrderResponse
  | TraderTakeOrderResponse
  | LooksrareTakeOrderResponse;

export interface OpenseaCancelOrderResponse extends Opensea {
  marketplaceResponse: void;
}

export interface TraderCancelOrderResponse extends Trader {
  marketplaceResponse: ContractTransaction;
}

export interface LooksrareCancelOrderResponse extends Looksrare {
  marketplaceResponse: _LooksRareContractReceipt;
}

export type CancelOrderResponse =
  | OpenseaCancelOrderResponse
  | TraderCancelOrderResponse
  | LooksrareCancelOrderResponse;
