import BigNumber from "bignumber.js";
import { OpenSeaPort, WyvernProtocol } from "opensea-js";
import {
  Order,
  OrderQuery,
  OrderSide,
  SaleKind,
  WyvernSchemaName,
} from "opensea-js/lib/types";

import { Asset, GetOrdersOptions } from "../types";

import { Marketplace } from "./Marketplace";

export class Opensea implements Marketplace<Order> {
  private readonly seaport: OpenSeaPort;
  private readonly walletAddress: string;

  constructor(seaport: OpenSeaPort, walletAddress: string) {
    this.seaport = seaport;
    this.walletAddress = walletAddress;
  }

  async makeOrder(makerAsset: Asset, takerAsset: Asset): Promise<Order> {
    let createOrder: Function;
    let baseAsset: Asset;
    let quoteAsset: Asset;

    if (makerAsset.type === "ERC721" || makerAsset.type === "ERC1155") {
      createOrder = this.seaport.createSellOrder.bind(this.seaport);
      baseAsset = makerAsset;
      quoteAsset = takerAsset;
    } else if (takerAsset.type === "ERC721" || takerAsset.type === "ERC1155") {
      createOrder = this.seaport.createBuyOrder.bind(this.seaport);
      baseAsset = takerAsset;
      quoteAsset = makerAsset;
    } else {
      throw new Error("unsupported operation");
    }

    const [{ tokens: baseTokens }, { tokens: quoteTokens }] = await Promise.all(
      [
        this.seaport.api.getPaymentTokens({
          address: baseAsset.tokenAddress.toLowerCase(),
        }),
        this.seaport.api.getPaymentTokens({
          address: quoteAsset.tokenAddress.toLowerCase(),
        }),
      ]
    );

    return createOrder({
      asset: {
        tokenId: baseAsset.tokenId || null,
        tokenAddress: baseAsset.tokenAddress,
        schemaName: baseAsset.type as WyvernSchemaName,
      },
      quantity: toUnitAmount(baseAsset.amount, baseTokens[0]?.decimals),
      accountAddress: this.walletAddress,
      startAmount: toUnitAmount(quoteAsset.amount, quoteTokens[0]?.decimals),
      paymentTokenAddress: quoteAsset.tokenAddress,
    });
  }

  /* eslint-disable camelcase */
  async getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
  }: GetOrdersOptions = {}): Promise<Order[]> {
    const query: OrderQuery = {
      maker,
      sale_kind: SaleKind.FixedPrice,
      taker,
    };

    if (!makerAsset && !takerAsset) {
      // Query in sequence instead of Promise.all to avoid getting rate limited.
      const buyOrdersResp = await this.seaport.api.getOrders({
        ...query,
        side: OrderSide.Buy,
      });
      const sellOrdersResp = await this.seaport.api.getOrders({
        ...query,
        side: OrderSide.Sell,
      });
      return [...buyOrdersResp.orders, ...sellOrdersResp.orders];
    }

    let baseAsset: Asset | undefined;
    let quoteAsset: Asset | undefined;

    if (
      makerAsset &&
      (makerAsset.type === "ERC721" || makerAsset.type === "ERC1155")
    ) {
      query.side = OrderSide.Sell;
      baseAsset = makerAsset;
      quoteAsset = takerAsset;
    } else if (
      takerAsset &&
      (takerAsset.type === "ERC721" || takerAsset.type === "ERC1155")
    ) {
      query.side = OrderSide.Buy;
      baseAsset = takerAsset;
      quoteAsset = makerAsset;
    } else {
      throw new Error("unsupported operation");
    }

    if (baseAsset) {
      const { tokenAddress, tokenId } = baseAsset;
      query.asset_contract_address = tokenAddress;
      if (tokenId) {
        query.token_id = tokenId;
      }
    }

    if (quoteAsset) {
      query.payment_token_address = quoteAsset.tokenAddress;
    }

    const resp = await this.seaport.api.getOrders(query);
    return resp.orders;
  }
  /* eslint-enable camelcase */

  async takeOrder(order: Order): Promise<string> {
    return this.seaport.fulfillOrder({
      order,
      accountAddress: this.walletAddress,
    });
  }

  async cancelOrder(order: Order): Promise<void> {
    return this.seaport.cancelOrder({
      order,
      accountAddress: this.walletAddress,
    });
  }
}

function toUnitAmount(amount: bigint, decimals?: number): number {
  return decimals
    ? WyvernProtocol.toUnitAmount(
        new BigNumber(amount.toString()),
        decimals
      ).toNumber()
    : Number(amount);
}
