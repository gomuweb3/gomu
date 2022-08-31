import type { Asset, GetOrdersParams, MakeOrderParams } from "../types";

export interface Marketplace<OrderData> {
  approveAsset(
    asset: Asset,
    overrides?: { contractAddress?: string }
  ): Promise<void>;

  makeOrder({
    makerAssets,
    takerAssets,
    taker,
    expirationTime,
  }: MakeOrderParams): Promise<OrderData>;

  getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
  }: GetOrdersParams): Promise<any>;

  takeOrder(order: OrderData): Promise<any>;
  cancelOrder(order: OrderData): Promise<any>;
}
