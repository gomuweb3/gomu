import { BaseProvider, JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { NftSwapV4 } from "@traderxyz/nft-swap-sdk";
import HDWalletProvider from "@truffle/hdwallet-provider";
import { Network, OpenSeaPort } from "opensea-js";

import { Opensea } from "./marketplaces/Opensea";
import { TraderXyz } from "./marketplaces/TraderXyz";
import {
  Asset,
  CancelOrderResponse,
  GetOrdersOptions,
  GetOrdersResponse,
  MakeOrderOptions,
  Order,
  TakeOrderResponse,
} from "./types";

export { Asset };

export interface GomuOptions {
  wallet: Wallet;
  chainId?: number;
  openseaApiKey?: string;
}

interface Marketplaces {
  opensea?: Opensea;
  traderxyz?: TraderXyz;
}

export default class Gomu {
  private readonly provider: BaseProvider;
  private readonly chainId: number;
  private readonly wallet: Wallet;
  readonly marketplaces: Marketplaces = {};

  constructor(
    provider: BaseProvider,
    { wallet, chainId = 1, openseaApiKey }: GomuOptions
  ) {
    this.provider = provider;
    this.wallet = wallet;
    this.chainId = chainId;

    const walletAddress = this.wallet.address;

    const web3Provider = new HDWalletProvider({
      privateKeys: [this.wallet.privateKey],
      url: (this.wallet.provider as JsonRpcProvider).connection.url,
    });

    if (this.chainId === 1 || this.chainId === 4) {
      const seaport = new OpenSeaPort(web3Provider, {
        ...(this.chainId === 4 && { networkName: Network.Rinkeby }),
        apiKey: openseaApiKey,
      });
      this.marketplaces.opensea = new Opensea(seaport, walletAddress);
    }

    if (this.chainId === 1 || this.chainId === 3) {
      const nftSwapSdk = new NftSwapV4(
        this.provider,
        this.wallet,
        this.chainId
      );
      this.marketplaces.traderxyz = new TraderXyz(
        this.chainId,
        nftSwapSdk,
        walletAddress
      );
    }
  }

  async makeOrder(
    makerAsset: Asset,
    takerAsset: Asset,
    options?: MakeOrderOptions
  ): Promise<Order[]> {
    // @ts-ignore
    return Promise.all(
      Object.entries(this.marketplaces)
        .filter(([_, marketplace]) => marketplace)
        .map(async ([marketplaceName, marketplace]) => ({
          marketplaceName,
          marketplaceOrder: await marketplace.makeOrder(
            makerAsset,
            takerAsset,
            options
          ),
        }))
    );
  }

  async getOrders(options?: GetOrdersOptions): Promise<GetOrdersResponse> {
    const orders = (
      await Promise.all(
        Object.entries(this.marketplaces)
          .filter(([_, marketplace]) => marketplace)
          .map(async ([marketplaceName, marketplace]) => {
            const orders = await marketplace.getOrders(options);
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
