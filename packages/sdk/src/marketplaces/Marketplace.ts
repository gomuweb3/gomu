import { Asset, GetOrdersOptions, MakeOrderOptions } from "../types";

export interface Marketplace<Order> {
  makeOrder(
    makerAsset: Asset,
    takerAsset: Asset,
    { taker }: MakeOrderOptions
  ): Promise<Order>;
  getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
  }: GetOrdersOptions): Promise<any>;
  takeOrder(order: Order): Promise<any>;
  cancelOrder(order: Order): Promise<any>;
}
