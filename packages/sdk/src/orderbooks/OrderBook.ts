import { NormalizedOrder } from "../types";

import { GomuOrderBook } from "./Gomu";

export interface OrderBookOrder<SignedOrder>
  extends NormalizedOrder<SignedOrder> {
  chainId: string;
  taker?: string;
}

export interface MakeOrderParams<SignedOrder>
  extends Omit<OrderBookOrder<SignedOrder>, "id"> {}

export interface MakeOrderResponse<SignedOrder> {
  data: OrderBookOrder<SignedOrder>;
}

export interface GetOrdersParams {
  chainId?: string;
  maker?: string;
  makerContractAddress?: string;
  makerTokenId?: string;
  taker?: string;
  takerContractAddress?: string;
  takerTokenId?: string;
}

export interface GetOrdersResponse<SignedOrder> {
  data: OrderBookOrder<SignedOrder>[];
}

export interface OrderBook<SignedOrder> {
  makeOrder(
    makeOrderParams: MakeOrderParams<SignedOrder>
  ): Promise<MakeOrderResponse<SignedOrder>>;

  getOrders(
    getOrdersParams: GetOrdersParams
  ): Promise<GetOrdersResponse<SignedOrder>>;
}
