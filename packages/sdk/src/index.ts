import { Signer } from "@ethersproject/abstract-signer";
import { Web3Provider } from "@ethersproject/providers";

import { Opensea, OpenseaConfig } from "./marketplaces/Opensea";
import { Trader, TraderConfig } from "./marketplaces/Trader";
import {
  Asset,
  CancelOrderResponse,
  Erc1155Asset,
  Erc20Asset,
  Erc721Asset,
  GetOrdersParams,
  GetOrdersResponse,
  MakeOrderParams,
  Order,
  TakeOrderResponse,
} from "./types";

export { Asset, Erc20Asset, Erc721Asset, Erc1155Asset };

export interface GomuConfig {
  provider: Web3Provider;
  openseaConfig?: OpenseaConfig;
  traderConfig?: TraderConfig;
}

interface _GomuConfig extends GomuConfig {
  chainId: number;
  address: string;
  signer: Signer;
}

interface Marketplaces {
  opensea?: Opensea;
  trader?: Trader;
}

export default class Gomu {
  readonly marketplaces: Marketplaces = {};

  static async new({
    provider,
    openseaConfig = {},
    traderConfig = {},
  }: GomuConfig): Promise<Gomu> {
    const signer = await provider.getSigner();
    const [address, chainId] = await Promise.all([
      signer.getAddress(),
      signer.getChainId(),
    ]);
    return new Gomu({
      provider,
      chainId,
      address,
      signer,
      openseaConfig,
      traderConfig,
    });
  }

  constructor({
    provider,
    chainId = 1,
    address,
    signer,
    openseaConfig,
    traderConfig,
  }: _GomuConfig) {
    if (Opensea.supportsChainId(chainId)) {
      this.marketplaces.opensea = new Opensea({
        ...openseaConfig,
        // @ts-ignore
        provider: provider.provider,
        chainId,
        address,
      });
    }

    if (Trader.supportsChainId(chainId)) {
      this.marketplaces.trader = new Trader({
        ...traderConfig,
        provider,
        chainId,
        address,
        signer,
      });
    }
  }

  async makeOrder(params: MakeOrderParams): Promise<Order[]> {
    // @ts-ignore
    return Promise.all(
      Object.entries(this.marketplaces)
        .filter(([_, marketplace]) => marketplace)
        .map(async ([marketplaceName, marketplace]) => ({
          marketplaceName,
          marketplaceOrder: await marketplace.makeOrder(params),
        }))
    );
  }

  async getOrders(params?: GetOrdersParams): Promise<GetOrdersResponse> {
    const orders = (
      await Promise.all(
        Object.entries(this.marketplaces)
          .filter(([_, marketplace]) => marketplace)
          .map(async ([marketplaceName, marketplace]) => {
            const orders = await marketplace.getOrders(params);
            return orders.map((marketplaceOrder: any) => ({
              marketplaceName,
              marketplaceOrder,
            }));
          })
      )
    ).flat();
    return {
      orders,
    };
  }

  async takeOrder(order: Order): Promise<TakeOrderResponse> {
    const { marketplaceName } = order;
    const marketplace = this.marketplaces[marketplaceName];
    if (!marketplace) {
      throw new Error(`unknown marketplace: ${marketplaceName} order`);
    }

    // @ts-ignore
    return {
      marketplaceName,
      // @ts-ignore
      marketplaceResponse: await marketplace.takeOrder(order.marketplaceOrder),
    };
  }

  async cancelOrder(order: Order): Promise<CancelOrderResponse> {
    const { marketplaceName } = order;
    const marketplace = this.marketplaces[marketplaceName];
    if (!marketplace) {
      throw new Error(`unknown marketplace: ${marketplaceName} order`);
    }

    // @ts-ignore
    return {
      marketplaceName,
      marketplaceResponse: await marketplace.cancelOrder(
        // @ts-ignore
        order.marketplaceOrder
      ),
    };
  }
}
