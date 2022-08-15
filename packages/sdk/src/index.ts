import { Signer } from "@ethersproject/abstract-signer";
import { Web3Provider } from "@ethersproject/providers";

import {
  LooksRare,
  looksrareSupportedChainIds,
} from "./marketplaces/LooksRare";
import { Opensea, openseaSupportedChainIds } from "./marketplaces/Opensea";
import { Trader, traderSupportedChainIds } from "./marketplaces/Trader";
import {
  TraderV3,
  TraderV3Config,
  traderV3SupportedChainIds,
} from "./marketplaces/TraderV3";

import type { LooksRareConfig } from "./marketplaces/LooksRare";
import type { OpenseaConfig } from "./marketplaces/Opensea";
import type { TraderConfig } from "./marketplaces/Trader";
import type {
  Asset,
  AnyAsset,
  CancelOrderResponse,
  Erc1155Asset,
  Erc20Asset,
  Erc721Asset,
  GetOrdersParams,
  MakeOrderParams,
  MakeSellOrderParams,
  MakeBuyOrderParams,
  MarketplaceName,
  OrderResponse,
  TakeOrderResponse,
  OpenseaOrderResponse,
  TraderOrderResponse,
  LooksRareOrderResponse,
  TraderV3OrderResponse,
} from "./types";

export type {
  Asset,
  AnyAsset,
  Erc20Asset,
  Erc721Asset,
  Erc1155Asset,
  OpenseaOrderResponse,
  TraderOrderResponse,
  LooksRareOrderResponse,
  TraderV3OrderResponse,
};

export interface GomuConfig {
  provider: Web3Provider;
  openseaConfig?: OpenseaConfig;
  traderConfig?: TraderConfig;
  looksrareConfig?: LooksRareConfig;
  traderV3Config?: TraderV3Config;
}

interface _GomuConfig extends GomuConfig {
  chainId: number;
  address: string;
  signer: Signer;
}

interface Marketplaces {
  opensea?: Opensea;
  trader?: Trader;
  looksrare?: LooksRare;
  traderV3?: TraderV3;
}

export const SUPPORTED_CHAIN_IDS_BY_MARKETPLACE: Record<
  MarketplaceName,
  number[]
> = {
  looksrare: looksrareSupportedChainIds,
  opensea: openseaSupportedChainIds,
  trader: traderSupportedChainIds,
  traderV3: traderV3SupportedChainIds,
};

export class Gomu {
  readonly marketplaces: Marketplaces = {};

  static async new({
    provider,
    openseaConfig = {},
    traderConfig = {},
    looksrareConfig = {},
    traderV3Config = {},
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
      looksrareConfig,
      traderV3Config,
    });
  }

  constructor({
    provider,
    chainId = 1,
    address,
    signer,
    openseaConfig,
    traderConfig,
    looksrareConfig,
    traderV3Config,
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

    if (LooksRare.supportsChainId(chainId)) {
      this.marketplaces.looksrare = new LooksRare({
        ...looksrareConfig,
        chainId,
        address,
        signer,
      });
    }

    if (TraderV3.supportsChainId(chainId)) {
      this.marketplaces.traderV3 = new TraderV3({
        ...traderV3Config,
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
  }: MakeOrderParams): Promise<OrderResponse[]> {
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
            return {
              marketplaceName: marketplaceName as MarketplaceName,
              data: await marketplace.makeOrder(params),
            };
          } catch (err) {
            return {
              marketplaceName: marketplaceName as MarketplaceName,
              error: {
                message: formatError(err),
                cause: err,
              },
            };
          }
        })
    );
  }

  async makeSellOrder({
    assets,
    erc20Asset: { contractAddress, amount },
    ...params
  }: MakeSellOrderParams): Promise<OrderResponse[]> {
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
  }: MakeBuyOrderParams): Promise<OrderResponse[]> {
    return this.makeOrder({
      makerAssets: [{ contractAddress, amount, type: "ERC20" }],
      takerAssets: assets,
      ...params,
    });
  }

  async getOrders(params?: GetOrdersParams): Promise<OrderResponse[]> {
    const orders = (
      await Promise.all<Promise<OrderResponse[]>[]>(
        Object.entries(this.marketplaces)
          .filter(([_, marketplace]) => marketplace)
          .map<Promise<OrderResponse[]>>(
            async ([marketplaceName, marketplace]): Promise<
              OrderResponse[]
            > => {
              try {
                const orders = await marketplace.getOrders(params);
                return orders.map((data: any) => ({
                  marketplaceName,
                  data,
                }));
              } catch (err) {
                return [
                  {
                    marketplaceName: marketplaceName as MarketplaceName,
                    error: {
                      message: formatError(err),
                      cause: err,
                    },
                  },
                ];
              }
            }
          )
      )
    ).flat();

    return orders;
  }

  async takeOrder(order: OrderResponse): Promise<TakeOrderResponse> {
    const { marketplaceName } = order;
    const marketplace = this.marketplaces[marketplaceName];

    if (!marketplace) {
      throw new Error(`unknown marketplace: ${marketplaceName} order`);
    }

    if (!("data" in order) || !order.data) {
      throw new Error("order does not contain data");
    }

    // @ts-ignore
    const data = await marketplace.takeOrder(order.data);

    // @ts-ignore
    return {
      marketplaceName,
      data,
    };
  }

  async cancelOrder(order: OrderResponse): Promise<CancelOrderResponse> {
    const { marketplaceName } = order;
    const marketplace = this.marketplaces[marketplaceName];

    if (!marketplace) {
      throw new Error(`unknown marketplace: ${marketplaceName} order`);
    }

    if (!("data" in order) || !order.data) {
      throw new Error("order does not contain data");
    }

    // @ts-ignore
    const data = await marketplace.cancelOrder(order.data);

    // @ts-ignore
    return {
      marketplaceName,
      data,
    };
  }
}

function formatError(err: unknown): string {
  if (Object.hasOwnProperty.call(err, "message")) {
    return (err as { message: string }).message;
  }

  try {
    return JSON.stringify(err);
  } catch (_) {
    return `${err}`;
  }
}
