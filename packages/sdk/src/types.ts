import type {
  LooksRareOrder,
  ContractReceipt as _LooksRareContractReceipt,
} from "./marketplaces/LooksRare";
import type {
  ContractReceipt as TraderContractReceipt,
  ContractTransaction as TraderContractTransaction,
} from "@ethersproject/contracts";
import type { PostOrderResponsePayload as TraderOrder } from "@traderxyz/nft-swap-sdk/dist/sdk/v4/orderbook";
import type { OrderV2 as OpenseaOrder } from "opensea-js/lib/orders/types";

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
}

export interface NormalizedAsset {
  contractAddress: string;
  tokenId?: string;
  type?: string;
  amount: bigint;
}

export interface NormalizedOrder<OriginalOrder> {
  id: string;
  makerAssets: Asset[];
  takerAssets: Asset[];
  maker: string;
  originalOrder: OriginalOrder;
}

export type OpenseaNormalizedOrder = NormalizedOrder<OpenseaOrder>;

export type TraderNormalizedOrder = NormalizedOrder<TraderOrder>;

export type LooksRareNormalizedOrder = NormalizedOrder<LooksRareOrder>;

interface ResponseData<N, D> {
  marketplaceName: N;
  data: D;
}

type Response<N, D> =
  | ResponseData<N, D>
  | {
      marketplaceName: N;
      error: {
        message?: string;
      };
    };

export type OpenseaOrderResponse = Response<
  MarketplaceName.Opensea,
  OpenseaNormalizedOrder
>;

export type TraderOrderResponse = Response<
  MarketplaceName.Trader,
  TraderNormalizedOrder
>;

export type LooksRareOrderResponse = Response<
  MarketplaceName.LooksRare,
  LooksRareNormalizedOrder
>;

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

type OpenseaResponseData<D> = ResponseData<MarketplaceName.Opensea, D>;
type TraderResponseData<D> = ResponseData<MarketplaceName.Trader, D>;
type LooksRareResponseData<D> = ResponseData<MarketplaceName.LooksRare, D>;

export type OpenseaTakeOrderResponse = OpenseaResponseData<string>;

export type TraderTakeOrderResponse = TraderResponseData<TraderContractReceipt>;

export type LooksRareTakeOrderResponse =
  LooksRareResponseData<_LooksRareContractReceipt>;

export type TakeOrderResponse =
  | OpenseaTakeOrderResponse
  | TraderTakeOrderResponse
  | LooksRareTakeOrderResponse;

export type OpenseaCancelOrderResponse = OpenseaResponseData<void>;

export type TraderCancelOrderResponse =
  TraderResponseData<TraderContractTransaction>;

export type LooksRareCancelOrderResponse =
  LooksRareResponseData<_LooksRareContractReceipt>;

export type CancelOrderResponse =
  | OpenseaCancelOrderResponse
  | TraderCancelOrderResponse
  | LooksRareCancelOrderResponse;
