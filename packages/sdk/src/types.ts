import { SignedOrder } from "@traderxyz/nft-swap-sdk";

import { OrderBookOrder } from "./orderbooks/OrderBook";

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

/**
 * Asset should mark all fields that have no intersection across other asset types as optional.
 * For representing asset whose types we do not yet know how to classify like Opensea's `LegacyEnjin`
 * and `ENSShortNameAuction`.
 */
export interface UnknownAsset {
  contractAddress: string;
  tokenId?: string;
  type: "Unknown";
  amount?: bigint;
}

export type Asset = Erc20Asset | Erc721Asset | Erc1155Asset | UnknownAsset;

type Merge<X, Y> = {
  [K in keyof X | keyof Y]?:
    | (K extends keyof X ? X[K] : never)
    | (K extends keyof Y ? Y[K] : never);
};

/**
 * AnyAsset has all possible asset type fields.
 * Non-overlapping asset fields (e.g. amount) will be optional while the rest are
 * kept as non-optional (e.g. type, contractAddress).
 * Meant to be used as a convenient container type for when we do not need distinct asset types.
 * e.g. anyAsset: AnyAsset = erc721Asset, anyAsset: AnyAsset = erc1155Asset, etc.
 */
export type AnyAsset = Merge<
  Merge<Merge<Erc20Asset, Erc721Asset>, Erc1155Asset>,
  UnknownAsset
> &
  Asset;

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
  TraderV3 = "traderV3",
}

export interface NormalizedOrder<OriginalOrder> {
  id: string;
  makerAssets: Asset[];
  takerAssets: Asset[];
  maker: string;
  originalOrder: OriginalOrder;
}

export type OpenseaOrder = NormalizedOrder<OpenseaOriginalOrder>;

export type TraderOrder = NormalizedOrder<TraderOriginalOrder>;

export type LooksRareOrder = NormalizedOrder<LooksRareOriginalOrder>;

export type TraderV3Order = OrderBookOrder<SignedOrder>;

interface ResponseBase<N extends MarketplaceName> {
  marketplaceName: N;
}

interface ResponseData<N extends MarketplaceName, D> extends ResponseBase<N> {
  data: D;
}

interface ResponseError<N extends MarketplaceName> extends ResponseBase<N> {
  error: {
    message: string;
    cause: any;
  };
}

type Response<N extends MarketplaceName, D> = Merge<
  ResponseData<N, D>,
  ResponseError<N>
> &
  ResponseBase<N>;

export type OpenseaOrderResponse = Response<
  MarketplaceName.Opensea,
  OpenseaOrder
>;

export type TraderOrderResponse = Response<MarketplaceName.Trader, TraderOrder>;

export type LooksRareOrderResponse = Response<
  MarketplaceName.LooksRare,
  LooksRareOrder
>;

export type TraderV3OrderResponse = Response<
  MarketplaceName.TraderV3,
  TraderV3Order
>;

export type OrderResponse =
  | OpenseaOrderResponse
  | TraderOrderResponse
  | LooksRareOrderResponse
  | TraderV3OrderResponse;

export interface GetOrdersParams {
  maker?: string;
  makerAsset?: Asset;
  taker?: string;
  takerAsset?: Asset;
}

type OpenseaResponseData<D> = ResponseData<MarketplaceName.Opensea, D>;
type TraderResponseData<D> = ResponseData<MarketplaceName.Trader, D>;
type LooksRareResponseData<D> = ResponseData<MarketplaceName.LooksRare, D>;
type TraderV3ResponseData<D> = ResponseData<MarketplaceName.TraderV3, D>;

export type OpenseaTakeOrderResponse = OpenseaResponseData<string>;

export type TraderTakeOrderResponse = TraderResponseData<ContractReceipt>;

export type LooksRareTakeOrderResponse =
  LooksRareResponseData<_LooksRareContractReceipt>;

export type TraderV3TakeOrderResponse = TraderV3ResponseData<ContractReceipt>;

export type TakeOrderResponse =
  | OpenseaTakeOrderResponse
  | TraderTakeOrderResponse
  | LooksRareTakeOrderResponse
  | TraderV3TakeOrderResponse;

export type OpenseaCancelOrderResponse = OpenseaResponseData<void>;

export type TraderCancelOrderResponse = TraderResponseData<ContractTransaction>;

export type LooksRareCancelOrderResponse =
  LooksRareResponseData<_LooksRareContractReceipt>;

export type TraderV3CancelOrderResponse =
  TraderV3ResponseData<ContractTransaction>;

export type CancelOrderResponse =
  | OpenseaCancelOrderResponse
  | TraderCancelOrderResponse
  | LooksRareCancelOrderResponse
  | TraderV3CancelOrderResponse;
