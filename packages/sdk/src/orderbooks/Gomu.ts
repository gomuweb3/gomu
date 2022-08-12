import fetch from "isomorphic-unfetch";

import { AnyAsset, Asset } from "../types";
import { filterEmpty } from "../utils";

import {
  GetOrdersParams,
  GetOrdersResponse,
  MakeOrderParams,
  MakeOrderResponse,
  OrderBook,
} from "./OrderBook";

export class GomuOrderBook<SignedOrder> implements OrderBook<SignedOrder> {
  private baseUrl: string = "https://commerce-api.gomu.co";

  async getOrders(
    getOrdersParams?: GetOrdersParams
  ): Promise<GetOrdersResponse<SignedOrder>> {
    let url = `${this.baseUrl}/orders`;

    if (getOrdersParams) {
      const params = new URLSearchParams(filterEmpty(getOrdersParams));
      url += `?${params.toString()}`;
    }

    const resp = await fetch(url);
    return resp.json();
  }

  async makeOrder(
    makeOrderParams: MakeOrderParams<SignedOrder>
  ): Promise<MakeOrderResponse<SignedOrder>> {
    const { makerAssets, takerAssets, ...params } = makeOrderParams;

    const body = JSON.stringify(
      {
        ...params,
        makerAssets: makerAssets.map(makeAnyAsset),
        takerAssets: takerAssets.map(makeAnyAsset),
      },
      (key, value) => (typeof value === "bigint" ? value.toString() : value)
    );

    const resp = await fetch(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return resp.json();
  }
}

function makeAnyAsset(asset: Asset): AnyAsset {
  if (asset.type === "ERC721") {
    return {
      contractAddress: asset.contractAddress,
      tokenId: asset.tokenId,
      type: asset.type,
      amount: BigInt(1),
    };
  }

  return asset;
}
