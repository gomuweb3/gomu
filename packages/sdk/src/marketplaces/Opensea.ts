import BigNumber from "bignumber.js";
import { Network, OpenSeaPort, WyvernProtocol } from "opensea-js";
import { WyvernSchemaName } from "opensea-js/lib/types";
import Web3 from "web3";

import { Marketplace } from "./Marketplace";
import {
  assertAssetsIsNotBundled,
  assertAssetsIsNotEmpty,
  assertAssetsIsNotErc20AndErc20,
  assertAssetsIsNotErc721Erc1155AndErc721Erc115,
} from "./validators";

import type {
  Erc1155Asset,
  Erc20Asset,
  Erc721Asset,
  GetOrdersParams,
  MakeOrderParams,
  NormalizedAsset,
  OpenseaNormalizedOrder,
} from "../types";
import type {
  OrderV2 as OpenseaOriginalOrder,
  OrdersQueryOptions,
  OrderSide,
} from "opensea-js/lib/orders/types";
import type {
  Asset as _Asset,
  OpenSeaAPIConfig,
  OpenSeaAsset,
} from "opensea-js/lib/types";
import type { BigNumberInput } from "opensea-js/lib/utils/utils";

export interface OpenseaConfig
  extends Exclude<OpenSeaAPIConfig, "networkName"> {}

export interface _OpenseaConfig extends OpenseaConfig {
  provider: Web3["currentProvider"];
  chainId: number;
  address: string;
}

export const openseaSupportedChainIds = [1, 4];

export class Opensea implements Marketplace<OpenseaNormalizedOrder> {
  private readonly seaport: OpenSeaPort;
  private readonly address: string;

  constructor({ provider, chainId, address, ...otherConfig }: _OpenseaConfig) {
    // @ts-ignore
    this.seaport = new OpenSeaPort(provider, {
      ...otherConfig,
      networkName: Opensea.getNetwork(chainId),
    });
    this.address = address;
  }

  static supportsChainId(chainId: number): boolean {
    return openseaSupportedChainIds.includes(chainId);
  }

  async makeOrder({
    makerAssets,
    takerAssets,
    taker,
    expirationTime,
  }: MakeOrderParams): Promise<OpenseaNormalizedOrder> {
    assertAssetsIsNotEmpty(makerAssets, "maker");
    assertAssetsIsNotEmpty(takerAssets, "taker");
    assertAssetsIsNotBundled(makerAssets);
    assertAssetsIsNotBundled(takerAssets);

    const makerAsset = makerAssets[0];
    const takerAsset = takerAssets[0];
    assertAssetsIsNotErc20AndErc20(makerAsset, takerAsset);
    assertAssetsIsNotErc721Erc1155AndErc721Erc115(makerAsset, takerAsset);

    let createOrder: (
      params: CreateBuyOrderParams | CreateSellOrderParams
    ) => Promise<OpenseaOriginalOrder>;
    let baseAsset: Erc721Asset | Erc1155Asset;
    let quoteAsset: Erc20Asset;

    if (
      (makerAsset.type === "ERC721" || makerAsset.type === "ERC1155") &&
      takerAsset.type === "ERC20"
    ) {
      createOrder = this.seaport.createSellOrder.bind(this.seaport);
      baseAsset = makerAsset;
      quoteAsset = takerAsset;
    } else if (
      makerAsset.type === "ERC20" &&
      (takerAsset.type === "ERC721" || takerAsset.type === "ERC1155")
    ) {
      createOrder = this.seaport.createBuyOrder.bind(this.seaport);
      baseAsset = takerAsset;
      quoteAsset = makerAsset;
    } else {
      throw new Error("unsupported operation");
    }

    const resp = await this.seaport.api.getPaymentTokens({
      address: quoteAsset.contractAddress.toLowerCase(),
    });
    const quoteToken = resp.tokens[0];

    const params: CreateBuyOrderParams | CreateSellOrderParams = {
      asset: {
        tokenId: baseAsset.tokenId || null,
        tokenAddress: baseAsset.contractAddress,
        schemaName: baseAsset.type as WyvernSchemaName,
      },
      accountAddress: this.address,
      startAmount: toUnitAmount(quoteAsset.amount, quoteToken.decimals),
      paymentTokenAddress: quoteAsset.contractAddress,
      buyerAddress: taker,
    };

    if (baseAsset.type === "ERC1155") {
      params.quantity = Number(baseAsset.amount);
    }

    if (expirationTime) {
      params.expirationTime = Math.round(expirationTime.getTime() / 1000);
    }

    const order = await createOrder(params);

    return normalizeOrder(order);
  }

  async getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
  }: GetOrdersParams = {}): Promise<OpenseaNormalizedOrder[]> {
    const query: Omit<OrdersQueryOptions, "limit"> = {
      // https://github.com/ProjectOpenSea/opensea-js/blob/master/src/api.ts#L106 limit is currently omitted here
      protocol: "seaport",
      maker,
      taker,
      side: ORDER_SIDE_SELL,
    };

    if (!makerAsset && !takerAsset) {
      // Query in sequence instead of Promise.all to avoid getting rate limited.
      const buyOrdersResp = await this.seaport.api.getOrders({
        ...query,
        side: ORDER_SIDE_BUY,
      });
      const sellOrdersResp = await this.seaport.api.getOrders({
        ...query,
      });
      return [...buyOrdersResp.orders, ...sellOrdersResp.orders].map(
        normalizeOrder
      );
    }

    let baseAsset: Erc721Asset | Erc1155Asset | undefined;
    let quoteAsset: Erc20Asset | undefined;

    // One of makerAsset or takerAsset exist here, or both.
    if (
      makerAsset &&
      (makerAsset.type === "ERC721" || makerAsset.type === "ERC1155") &&
      (!takerAsset || takerAsset.type === "ERC20")
    ) {
      baseAsset = makerAsset;
      quoteAsset = takerAsset;
    } else if (
      (!makerAsset || makerAsset.type === "ERC20") &&
      takerAsset &&
      (takerAsset.type === "ERC721" || takerAsset.type === "ERC1155")
    ) {
      query.side = ORDER_SIDE_BUY;
      baseAsset = takerAsset;
      quoteAsset = makerAsset;
    } else {
      throw new Error("unsupported operation");
    }

    if (baseAsset) {
      const { contractAddress, tokenId } = baseAsset;
      query.assetContractAddress = contractAddress;
      query.tokenIds = [tokenId];
    }

    if (quoteAsset) {
      query.paymentTokenAddress = quoteAsset.contractAddress;
    }

    const resp = await this.seaport.api.getOrders(query);
    return resp.orders.map(normalizeOrder);
  }
  /* eslint-enable camelcase */

  async takeOrder(order: OpenseaNormalizedOrder): Promise<string> {
    return this.seaport.fulfillOrder({
      order: order.originalOrder,
      accountAddress: this.address,
    });
  }

  async cancelOrder(order: OpenseaNormalizedOrder): Promise<void> {
    return this.seaport.cancelOrder({
      order: order.originalOrder,
      accountAddress: this.address,
    });
  }

  private static getNetwork(chainId: number): Network {
    switch (chainId) {
      case 1:
        return Network.Main;
      case 4:
        return Network.Rinkeby;
      default:
        throw new Error(`unsupported chain id: ${chainId}`);
    }
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

function normalizeAssets(assets: OpenSeaAsset[]): NormalizedAsset[] {
  return assets.map((asset) => {
    return {
      contractAddress: asset.assetContract.address,
      tokenId: asset.tokenId!,
      type: asset.assetContract.schemaName,
      amount: BigInt(1),
    };
  });
}

// Opensea OrderV2 contains price on root level, but payment token info in either maker or taker bundle
// for now we are working only with orders that use single erc20 payment token
function normalizeOrder(order: OpenseaOriginalOrder): OpenseaNormalizedOrder {
  const isSellOrder = order.side === ORDER_SIDE_SELL;
  const erc20Asset = {
    contractAddress: (isSellOrder
      ? order.takerAssetBundle
      : order.makerAssetBundle
    ).assets[0].assetContract.address,
    type: "ERC20",
    amount: BigInt(order.currentPrice),
  };

  return {
    id: order.orderHash!,
    makerAssets: isSellOrder
      ? normalizeAssets(order.makerAssetBundle.assets)
      : [erc20Asset],
    takerAssets: isSellOrder
      ? [erc20Asset]
      : normalizeAssets(order.takerAssetBundle.assets),
    isSellOrder,
    originalOrder: order,
  };
}

const ORDER_SIDE_BUY: OrderSide = "bid";

const ORDER_SIDE_SELL: OrderSide = "ask";

interface CreateBuyOrderParams {
  asset: _Asset;
  accountAddress: string;
  startAmount: BigNumberInput;
  quantity?: BigNumberInput;
  expirationTime?: BigNumberInput;
  paymentTokenAddress?: string;
}

interface CreateSellOrderParams {
  asset: _Asset;
  accountAddress: string;
  startAmount: BigNumberInput;
  endAmount?: BigNumberInput;
  quantity?: BigNumberInput;
  listingTime?: string;
  expirationTime?: BigNumberInput;
  paymentTokenAddress?: string;
  buyerAddress?: string;
}
