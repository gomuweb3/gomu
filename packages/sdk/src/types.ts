import type {
  LooksRareOriginalOrder,
  ContractReceipt as _LooksRareContractReceipt,
} from "./marketplaces/LooksRare";
import type {
  ContractReceipt,
  ContractTransaction,
} from "@ethersproject/contracts";
import type { PostOrderResponsePayload as TraderOriginalOrder } from "@traderxyz/nft-swap-sdk/dist/sdk/v4/orderbook";
import type { OrderV2 as OpenseaOriginalOrder } from "opensea-js/lib/orders/types";

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
  LooksRare = "looksrare",
}

interface ErrorObj {
  message?: string;
}

interface ErrorBase {
  error?: ErrorObj;
}

interface OpenseaBase extends ErrorBase {
  marketplaceName: MarketplaceName.Opensea;
}

interface TraderBase extends ErrorBase {
  marketplaceName: MarketplaceName.Trader;
}

interface LooksRareBase extends ErrorBase {
  marketplaceName: MarketplaceName.LooksRare;
}

export interface NormalizedAsset {
  contractAddress: string;
  tokenId?: string;
  type?: string;
  amount: bigint;
}

export interface NormalizedOrder<OriginalOrder> {
  id: string;
  makerAssets: NormalizedAsset[];
  takerAssets: NormalizedAsset[];
  isSellOrder: boolean;
  originalOrder: OriginalOrder;
}

export type OpenseaNormalizedOrder = NormalizedOrder<OpenseaOriginalOrder>;

export type TraderNormalizedOrder = NormalizedOrder<TraderOriginalOrder>;

export type LooksRareNormalizedOrder = NormalizedOrder<LooksRareOriginalOrder>;

export interface OpenseaOrderResponse extends OpenseaBase {
  data?: OpenseaNormalizedOrder;
}

export interface TraderOrderResponse extends TraderBase {
  data?: TraderNormalizedOrder;
}

export interface LooksRareOrderResponse extends LooksRareBase {
  data?: LooksRareNormalizedOrder;
}

export type OrderResponse =
  | OpenseaOrderResponse
  | TraderOrderResponse
  | LooksRareOrderResponse;

export interface GetOrdersParams {
  maker?: string;
  makerAsset?: Asset;
  taker?: string;
  takerAsset?: Asset;
}

export interface GetOrdersResponse {
  orders: OrderResponse[];
}

export interface OpenseaTakeOrderResponse extends OpenseaBase {
  marketplaceResponse: string;
}

export interface TraderTakeOrderResponse extends TraderBase {
  marketplaceResponse: ContractReceipt;
}

export interface LooksRareTakeOrderResponse extends LooksRareBase {
  marketplaceResponse: _LooksRareContractReceipt;
}

export type TakeOrderResponse =
  | OpenseaTakeOrderResponse
  | TraderTakeOrderResponse
  | LooksRareTakeOrderResponse;

export interface OpenseaCancelOrderResponse extends OpenseaBase {
  marketplaceResponse: void;
}

export interface TraderCancelOrderResponse extends TraderBase {
  marketplaceResponse: ContractTransaction;
}

export interface LooksRareCancelOrderResponse extends LooksRareBase {
  marketplaceResponse: _LooksRareContractReceipt;
}

export type CancelOrderResponse =
  | OpenseaCancelOrderResponse
  | TraderCancelOrderResponse
  | LooksRareCancelOrderResponse;
