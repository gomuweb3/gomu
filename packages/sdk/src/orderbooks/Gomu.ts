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

export interface GomuOrderBookConfig {
  apiKey?: string;
  apiBaseUrl?: string;
}

export class GomuOrderBook<SignedOrder> implements OrderBook<SignedOrder> {
  private readonly apiKey?: string;
  private readonly apiBaseUrl: string;

  constructor({
    apiKey,
    apiBaseUrl = "https://commerce-api.gomu.co",
  }: GomuOrderBookConfig = {}) {
    this.apiKey = apiKey;
    this.apiBaseUrl = apiBaseUrl;
  }

  async getOrders(
    getOrdersParams?: GetOrdersParams
  ): Promise<GetOrdersResponse<SignedOrder>> {
    let url = `${this.apiBaseUrl}/orders`;

    if (getOrdersParams) {
      const params = new URLSearchParams(filterEmpty(getOrdersParams));
      url += `?${params.toString()}`;
    }

    const resp = await fetch(url, {
      ...(this.apiKey && {
        headers: {
          "gomu-api-key": this.apiKey,
        },
      }),
    });
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

    const resp = await fetch(`${this.apiBaseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { "gomu-api-key": this.apiKey }),
      },
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
