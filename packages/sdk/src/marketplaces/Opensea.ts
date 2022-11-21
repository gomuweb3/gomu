import { BigNumber } from "@0x/utils";
import { Signer } from "@ethersproject/abstract-signer";
import { ExternalProvider, Web3Provider } from "@ethersproject/providers";
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
  OpenseaOrder,
} from "../types";
import type {
  OrderV2 as OpenseaOriginalOrder,
  OrdersQueryOptions,
  OrderSide,
} from "opensea-js/lib/orders/types";
import type { Asset as _Asset, OpenSeaAPIConfig } from "opensea-js/lib/types";
import type { BigNumberInput } from "opensea-js/lib/utils/utils";

export interface OpenseaConfig
  extends Exclude<OpenSeaAPIConfig, "networkName"> {}

export interface _OpenseaConfig extends OpenseaConfig {
  provider: ExternalProvider;
  chainId: number;
  address: string;
  signer: Signer;
}

export const openseaSupportedChainIds = [1, 5];

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

export class Opensea implements Marketplace<OpenseaOrder> {
  private readonly seaport: OpenSeaPort;
  private readonly address: string;
  private readonly provider: ExternalProvider;
  private readonly signer: Signer;
  private readonly chainId: number;

  constructor({
    provider,
    chainId,
    address,
    signer,
    ...otherConfig
  }: _OpenseaConfig) {
    // @ts-ignore
    this.seaport = new OpenSeaPort(provider, {
      ...otherConfig,
      networkName: Opensea.getNetwork(chainId),
    });
    this.address = address;
    this.provider = provider;
    this.signer = signer;
    this.chainId = chainId;
  }

  static supportsChainId(chainId: number): boolean {
    return openseaSupportedChainIds.includes(chainId);
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

    // Note: atm it seems OpenSea is using only one conduit address (no distinction between mainnet and testnet)
    // Surprisingly it works on testnet (I supposed they managed to deploy both contracts using the same account and nonce)
    // Init Seaport SDK with conduit map: https://github.com/ProjectOpenSea/opensea-js/blob/e1dfb4cac70e34cac0ed2702facb179c55c190a5/src/sdk.ts#L226-L228
    // Approval on Seaport SDK: https://github.com/ProjectOpenSea/seaport-js/blob/556401030b1d4c72f3d836b5a3c587255ade9f4c/src/seaport.ts#L258-L264
    // (operator is the default conduit)
    const conduitAddress =
      overrides?.contractAddress ||
      CONDUIT_KEYS_TO_CONDUIT[CROSS_CHAIN_DEFAULT_CONDUIT_KEY];

    return approveAsset({
      walletAddress: this.address,
      contractAddress: conduitAddress,
      asset,
      provider: new Web3Provider(this.provider),
      signer: this.signer,
      chainId: this.chainId,
    });
  }

  async makeOrder({
    makerAssets,
    takerAssets,
    taker,
    expirationTime,
  }: MakeOrderParams): Promise<OpenseaOrder> {
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
  }: GetOrdersParams = {}): Promise<OpenseaOrder[]> {
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

  async takeOrder(order: OpenseaOrder): Promise<string> {
    return this.seaport.fulfillOrder({
      order: order.originalOrder,
      accountAddress: this.address,
    });
  }

  async cancelOrder(order: OpenseaOrder): Promise<void> {
    return this.seaport.cancelOrder({
      order: order.originalOrder,
      accountAddress: this.address,
    });
  }

  private static getNetwork(chainId: number): Network {
    switch (chainId) {
      case 1:
        return Network.Main;
      case 5:
        return Network.Goerli;
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

// Opensea OrderV2 contains price on root level, but payment token info in either offer or consideration
// for now we are working only with orders that use single erc20 payment token
function normalizeOrder(order: OpenseaOriginalOrder): OpenseaOrder {
  const isSellOrder = order.side === ORDER_SIDE_SELL;
  const { consideration, offer, offerer } = order.protocolData.parameters;

  const erc20Asset = {
    contractAddress: (isSellOrder ? consideration : offer)[0].token,
    type: "ERC20",
    amount: BigInt(order.currentPrice),
  } as const;

  const nftAssets = (isSellOrder ? offer : consideration)
    .filter((asset) => asset.itemType !== ItemType.ERC20)
    .map(determineNftAsset);

  return {
    id: order.orderHash!,
    makerAssets: isSellOrder ? nftAssets : [erc20Asset],
    takerAssets: isSellOrder ? [erc20Asset] : nftAssets,
    maker: offerer,
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

function determineNftAsset({
  token,
  identifierOrCriteria,
  itemType,
  endAmount,
}: {
  token: string;
  identifierOrCriteria: string;
  itemType: number;
  endAmount: string;
}): Asset {
  const contractAddress = token;
  const tokenId = identifierOrCriteria;
  const amount = BigInt(endAmount);

  if (
    itemType === ItemType.ERC721 ||
    itemType === ItemType.ERC721_WITH_CRITERIA
  ) {
    return {
      type: "ERC721",
      contractAddress,
      tokenId,
    };
  }

  if (
    itemType === ItemType.ERC1155 ||
    itemType === ItemType.ERC1155_WITH_CRITERIA
  ) {
    return {
      type: "ERC1155",
      contractAddress,
      tokenId,
      amount: BigInt(amount),
    };
  }

  return {
    type: "Unknown",
    contractAddress,
    tokenId,
    amount: BigInt(amount),
  };
}
