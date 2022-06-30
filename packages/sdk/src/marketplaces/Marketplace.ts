import type { Asset, GetOrdersParams, MakeOrderParams } from "../types";

export interface Marketplace<Order> {
  approveAsset(
    asset: Asset,
    overrides: { contractAddress?: string }
  ): Promise<void>;
  approveAsset(asset: Asset): Promise<void>;
  approveTakeOrderAsset(order: Order): Promise<void>;

  makeOrder({
    makerAssets,
    takerAssets,
    taker,
    expirationTime,
  }: MakeOrderParams): Promise<Order>;

  getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
  }: GetOrdersParams): Promise<any>;

  takeOrder(order: Order): Promise<any>;
  cancelOrder(order: Order): Promise<any>;
}
