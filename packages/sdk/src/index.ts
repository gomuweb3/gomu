import { Signer } from "@ethersproject/abstract-signer";
import { Web3Provider } from "@ethersproject/providers";

import { Opensea } from "./marketplaces/Opensea";
import { Trader } from "./marketplaces/Trader";

import type { OpenseaConfig } from "./marketplaces/Opensea";
import type { TraderConfig } from "./marketplaces/Trader";
import type {
  Asset,
  CancelOrderResponse,
  Erc1155Asset,
  Erc20Asset,
  Erc721Asset,
  GetOrdersParams,
  GetOrdersResponse,
  MakeOrderParams,
  MakeSellOrderParams,
  MakeBuyOrderParams,
  MarketplaceName,
  Order,
  MakeOrderResponse,
  TakeOrderResponse,
} from "./types";

export type { Asset, Erc20Asset, Erc721Asset, Erc1155Asset };

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

export class Gomu {
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

  async makeOrder({
    marketplaces,
    ...params
  }: MakeOrderParams): Promise<MakeOrderResponse[]> {
    return Promise.all(
      Object.entries(this.marketplaces)
        .filter(([marketplaceName, marketplace]) => {
          if (
            marketplaces?.length &&
            !marketplaces.includes(marketplaceName as MarketplaceName)
          ) {
            return false;
          }

          return Boolean(marketplace);
        })
        .map(async ([marketplaceName, marketplace]) => {
          try {
            const marketplaceOrder = await marketplace.makeOrder(params);
            const normalizedOrder =
              marketplace.getNormalizedOrder(marketplaceOrder);

            return {
              marketplaceName: marketplaceName as MarketplaceName,
              marketplaceOrder,
              normalizedOrder,
            } as Order;
          } catch (err) {
            return {
              marketplaceName: marketplaceName as MarketplaceName,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        })
    );
  }

  async makeSellOrder({
    assets,
    erc20Asset: { contractAddress, amount },
    ...params
  }: MakeSellOrderParams): Promise<MakeOrderResponse[]> {
    return this.makeOrder({
      makerAssets: assets,
      takerAssets: [{ contractAddress, amount, type: "ERC20" }],
      ...params,
    });
  }

  async makeBuyOrder({
    assets,
    erc20Asset: { contractAddress, amount },
    ...params
  }: MakeBuyOrderParams): Promise<MakeOrderResponse[]> {
    return this.makeOrder({
      makerAssets: [{ contractAddress, amount, type: "ERC20" }],
      takerAssets: assets,
      ...params,
    });
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
              normalizedOrder: marketplace.getNormalizedOrder(marketplaceOrder),
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
