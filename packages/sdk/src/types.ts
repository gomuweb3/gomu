import type {
  MakeOrderResult as LooksRareOriginalOrder,
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

export interface NormalizedAsset {
  contractAddress: string;
  tokenId?: string;
  type: string;
  amount: string;
}

export interface OrderData<OriginalOrder> {
  id: string;
  makerAssets: NormalizedAsset[];
  takerAssets: NormalizedAsset[];
  isSellOrder: boolean;
  originalOrder: OriginalOrder;
}

export type OpenseaOrderData = OrderData<OpenseaOriginalOrder>;

export type TraderOrderData = OrderData<TraderOriginalOrder>;

export type LooksRareOrderData = OrderData<LooksRareOriginalOrder>;

interface BaseOrder<Name, Data> {
  marketplaceName: Name;
  error?: string;
  data?: Data;
}

export type OpenseaOrder = BaseOrder<MarketplaceName.Opensea, OpenseaOrderData>;

export type TraderOrder = BaseOrder<MarketplaceName.Trader, TraderOrderData>;

export type LooksRareOrder = BaseOrder<
  MarketplaceName.LooksRare,
  LooksRareOrderData
>;

export type Order = OpenseaOrder | TraderOrder | LooksRareOrder;

export interface GetOrdersParams {
  maker?: string;
  makerAsset?: Asset;
  taker?: string;
  takerAsset?: Asset;
}

export interface GetOrdersResponse {
  orders: Order[];
}

interface BaseTakeOrderResponse<Name, Response> {
  marketplaceName: Name;
  marketplaceResponse: Response;
}

export type OpenseaTakeOrderResponse = BaseTakeOrderResponse<
  MarketplaceName.Opensea,
  string
>;

export type TraderTakeOrderResponse = BaseTakeOrderResponse<
  MarketplaceName.Trader,
  ContractReceipt
>;

export type LooksRareTakeOrderResponse = BaseTakeOrderResponse<
  MarketplaceName.LooksRare,
  _LooksRareContractReceipt
>;

export type TakeOrderResponse =
  | OpenseaTakeOrderResponse
  | TraderTakeOrderResponse
  | LooksRareTakeOrderResponse;

interface BaseCancelOrderResponse<Name, Response> {
  marketplaceName: Name;
  marketplaceResponse: Response;
}

export type OpenseaCancelOrderResponse = BaseCancelOrderResponse<
  MarketplaceName.Opensea,
  void
>;

export type TraderCancelOrderResponse = BaseCancelOrderResponse<
  MarketplaceName.Trader,
  ContractTransaction
>;

export type LooksRareCancelOrderResponse = BaseCancelOrderResponse<
  MarketplaceName.LooksRare,
  _LooksRareContractReceipt
>;

export type CancelOrderResponse =
  | OpenseaCancelOrderResponse
  | TraderCancelOrderResponse
  | LooksRareCancelOrderResponse;
