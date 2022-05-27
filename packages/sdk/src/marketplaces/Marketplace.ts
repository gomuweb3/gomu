import type { GetOrdersParams, MakeOrderParams } from "../types";

export interface Marketplace<Order> {
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
