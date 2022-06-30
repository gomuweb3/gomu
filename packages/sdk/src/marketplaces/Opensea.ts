import { BaseProvider, Web3Provider } from "@ethersproject/providers";
import BigNumber from "bignumber.js";
import { Network, OpenSeaPort, WyvernProtocol } from "opensea-js";
import {
  CONDUIT_KEYS_TO_CONDUIT,
  CROSS_CHAIN_DEFAULT_CONDUIT_KEY,
} from "opensea-js/lib/constants";
import { WyvernSchemaName } from "opensea-js/lib/types";

import { Marketplace } from "./Marketplace";
import { approveAsset } from "./approval";
import {
  assertAssetsIsNotBundled,
  assertAssetsIsNotEmpty,
  assertAssetsIsNotErc20AndErc20,
  assertAssetsIsNotErc721Erc1155AndErc721Erc115,
} from "./validators";

import type {
  Asset,
  Erc1155Asset,
  Erc20Asset,
  Erc721Asset,
  GetOrdersParams,
  MakeOrderParams,
} from "../types";
import type {
  OrderV2 as Order,
  OrdersQueryOptions,
  OrderSide,
} from "opensea-js/lib/orders/types";
import type { Asset as _Asset, OpenSeaAPIConfig } from "opensea-js/lib/types";
import type { BigNumberInput } from "opensea-js/lib/utils/utils";

export interface OpenseaConfig
  extends Exclude<OpenSeaAPIConfig, "networkName"> {}

export interface _OpenseaConfig extends OpenseaConfig {
  provider: Web3Provider;
  chainId: number;
  address: string;
}

export const openseaSupportedChainIds = [1, 4];

// From: https://github.com/ProjectOpenSea/seaport-js/blob/556401030b1d4c72f3d836b5a3c587255ade9f4c/src/constants.ts#L47-L54
// These are item type values returned by their API and present in all existing v2 orders and are
// therefore unlikely to change
enum ItemType {
  NATIVE = 0,
  ERC20 = 1,
  ERC721 = 2,
  ERC1155 = 3,
  ERC721_WITH_CRITERIA = 4,
  ERC1155_WITH_CRITERIA = 5,
}

export class Opensea implements Marketplace<Order> {
  private readonly seaport: OpenSeaPort;
  private readonly address: string;
  private readonly provider: Web3Provider;

  constructor({ provider, chainId, address, ...otherConfig }: _OpenseaConfig) {
    // @ts-ignore
    this.seaport = new OpenSeaPort(provider, {
      ...otherConfig,
      networkName: Opensea.getNetwork(chainId),
    });
    this.address = address;
    this.provider = provider;
  }

  static supportsChainId(chainId: number): boolean {
    return openseaSupportedChainIds.includes(chainId);
  }

  async approveTakeOrderAsset(order: Order): Promise<void> {
    const {
      protocolData: { parameters },
    } = order;

    const { consideration } = parameters;

    // We're doing a simplistic approval for all assets in considerations since it doesn't seem like seaport js
    // is filtering by recipients either.
    // You can start tracing the code path from here:
    // https://github.com/ProjectOpenSea/seaport-js/blob/556401030b1d4c72f3d836b5a3c587255ade9f4c/src/seaport.ts#L729
    const assets = Array.from<Asset>(
      consideration.map((item) => {
        const { itemType } = item;

        if (itemType === ItemType.ERC20) {
          return {
            type: "ERC20",
            amount: BigInt(item.endAmount),
            contractAddress: item.token,
          };
        }

        if (
          [ItemType.ERC1155, ItemType.ERC1155_WITH_CRITERIA].includes(itemType)
        ) {
          return {
            type: "ERC1155",
            amount: BigInt(item.endAmount),
            contractAddress: item.token,
            tokenId: item.identifierOrCriteria,
          };
        }

        if (
          [ItemType.ERC721, ItemType.ERC721_WITH_CRITERIA].includes(itemType)
        ) {
          return {
            type: "ERC721",
            contractAddress: item.token,
            tokenId: item.identifierOrCriteria,
          };
        }

        throw new Error("unsupported type");
      })
    );

    await Promise.all(assets.map((asset) => this.approveAsset(asset)));
  }

  async approveAsset(
    asset: Asset,
    overrides?: { contractAddress?: string }
  ): Promise<void> {
    // OpenSea SDK uses seaport SDK in the background, which has a very convoluted process of
    // checking wallet balance and amount approved for each token that is initiated during order creation.
    // (They have a very long chain of calls for getting both balances and approvals in one RPC call and then checking
    // only either for approvals or balances)
    // The checks involves checking amount approved on conduit contract that's supposed to handle the transfer.
    // Lastly, all of these are marked as private methods so it's not safe to call them directly here; we have to re-implement.

    // Note: atm it seems OpenSea is using only one conduit address (no discrimination between mainnet and testnet)
    // Probably doesn't work on testnet
    // Init Seaport SDK with conduit map: https://github.com/ProjectOpenSea/opensea-js/blob/e1dfb4cac70e34cac0ed2702facb179c55c190a5/src/sdk.ts#L226-L228
    // Approval on Seaport SDK: https://github.com/ProjectOpenSea/seaport-js/blob/556401030b1d4c72f3d836b5a3c587255ade9f4c/src/seaport.ts#L258-L264
    // (operator is the default conduit)
    const conduitAddress =
      overrides?.contractAddress ||
      CONDUIT_KEYS_TO_CONDUIT[CROSS_CHAIN_DEFAULT_CONDUIT_KEY];

    if (!this.provider || typeof this.provider === "string") {
      throw new Error("unsupported provider");
    }

    const provider = new BaseProvider(this.provider.network);
    const signer = await this.provider.getSigner();

    approveAsset({
      walletAddress: this.address,
      contractAddress: conduitAddress,
      asset,
      provider,
      signer,
    });
  }

  async makeOrder({
    makerAssets,
    takerAssets,
    taker,
    expirationTime,
  }: MakeOrderParams): Promise<Order> {
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
    ) => Promise<Order>;
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

    return createOrder(params);
  }

  async getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
  }: GetOrdersParams = {}): Promise<Order[]> {
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
      return [...buyOrdersResp.orders, ...sellOrdersResp.orders];
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
    return resp.orders;
  }
  /* eslint-enable camelcase */

  async takeOrder(order: Order): Promise<string> {
    return this.seaport.fulfillOrder({
      order,
      accountAddress: this.address,
    });
  }

  async cancelOrder(order: Order): Promise<void> {
    return this.seaport.cancelOrder({
      order,
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
