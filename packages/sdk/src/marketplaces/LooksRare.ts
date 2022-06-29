/**
 * LooksRare does not check for or trigger approval (no helpers from SDK).
 * We may need to provide these functions manually.
 *
 * Helper note:
 * Approve WETH for EXCHANGE contract
 * Approve NFTs for their respective transfer manager contracts: TRANSFER_MANAGER_ERC721 or TRANSFER_MANAGER_ERC1155
 *
 * Contract addresses:
 * https://github.com/LooksRare/looksrare-sdk/blob/eb2e61dba502f0d35c3c3c20236f6505ef730877/src/constants/addresses.ts
 */

import { Signer } from "@ethersproject/abstract-signer";
import { Contract } from "@ethersproject/contracts";
import {
  signMakerOrder,
  addressesByNetwork,
  SupportedChainId,
  MakerOrder as MakerOrderPayload,
  TakerOrder as TakerOrderPayload,
  LooksRareExchangeAbi,
} from "@looksrare/sdk";
import BigNumber from "bignumber.js";
import fetch from "isomorphic-unfetch";

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
  LooksRareOrderData,
} from "../types";

export interface LooksRareConfig {
  apiKey?: string;
}

interface _LooksRareConfig extends LooksRareConfig {
  signer: Signer;
  chainId: number;
  address: string;
}

interface ApiResponse<T> {
  success: boolean;
  name?: string;
  message?: string; // Used for errors
  data?: T;
  errors: {
    target: Record<string, unknown>;
    value: Record<string, unknown>;
    property: string;
    children: string[];
    constraints: Record<string, unknown>;
  }[];
}

export enum Status {
  VALID = "VALID",
  CANCELLED = "CANCELLED",
  EXECUTED = "EXECUTED",
  EXPIRED = "EXPIRED",
}

export interface LooksRareOriginalOrder {
  hash: string;
  collectionAddress: string;
  tokenId: string;
  isOrderAsk: boolean;
  signer: string;
  strategy: string;
  currencyAddress: string;
  amount: string;
  price: string;
  nonce: string;
  startTime: number;
  endTime: number;
  minPercentageToAsk: number;
  params: string;
  status: Status;
  signature: string;
  v: number;
  r: string;
  s: string;
}

interface FetchOrderParams {
  isOrderAsk?: boolean;
  collection?: string;
  tokenId?: string;
  signer?: string;
  strategy?: string;
  currency?: string;
  price?: {
    min?: string;
    max?: string;
  };
  startTime?: number;
  endTime?: number;
  status: Status[];
  pagination?: {
    first: number;
    cursor: string;
  };
  sort: "EXPIRING_SOON" | "NEWEST" | "PRICE_ASC" | "PRICE_DESC";
}

export interface ContractReceipt {
  hash: string;
  type: number;
  accessList: null;
  blockHash: null;
  blockNumber: null;
  transactionIndex: null;
  confirmations: number;
  from: string;
  gasPrice: {
    type: "BigNumber";
    hex: string;
  };
  maxPriorityFeePerGas: {
    type: "BigNumber";
    hex: string;
  };
  maxFeePerGas: {
    type: "BigNumber";
    hex: string;
  };
  gasLimit: {
    type: "BigNumber";
    hex: string;
  };
  to: string;
  value: {
    type: "BigNumber";
    hex: string;
  };
  nonce: number;
  data: string;
  r: string;
  s: string;
  v: number;
  creates: null;
  chainId: number;
}

const API_ORIGIN: Record<SupportedChainId, string> = {
  [SupportedChainId.HARDHAT]: "http://localhost",
  [SupportedChainId.MAINNET]: "https://api.looksrare.org",
  [SupportedChainId.RINKEBY]: "https://api-rinkeby.looksrare.org",
};

enum ApiPath {
  orders = "/api/v1/orders",
  orderNonce = "/api/v1/orders/nonce",
}

const DAY = 60 * 60 * 24;
const DEFAULT_EXPIRATION_TIMEOUT = 30 * DAY; // Follow LooksRare's default

// Following LooksRare's default
// Enforce a max slippage of 15% on all orders, if a collection change the fees to be >15%, the order will become invalid
const DEFAULT_MIN_PERCENTAGE_TO_ASK = 8500;

const DEFAULT_PARAMS_HEX = "0x";

export const looksrareSupportedChainIds = [
  SupportedChainId.MAINNET,
  SupportedChainId.RINKEBY,
];

export class LooksRare implements Marketplace<LooksRareOrderData> {
  private readonly apiKey: string | undefined;
  private readonly address: string;
  private readonly chainId: SupportedChainId;
  private readonly signer: Signer;

  constructor({ apiKey, signer, chainId, address }: _LooksRareConfig) {
    if (!LooksRare.supportsChainId(chainId)) {
      throw new Error("unsupported chain id");
    }

    this.apiKey = apiKey;
    this.address = address;
    this.chainId = chainId;
    this.signer = signer;
  }

  static supportsChainId(chainId: number): boolean {
    return looksrareSupportedChainIds.includes(chainId);
  }

  /**
   * Makes an order and post to LooksRare order book.
   */
  async makeOrder({
    makerAssets,
    takerAssets,
    taker,
    expirationTime,
  }: MakeOrderParams): Promise<LooksRareOrderData> {
    if (taker) {
      // We disable private sale for now
      // We will need to include ethers.js lib to support it because LooksRare uses it to verify address in params
      // (https://github.com/LooksRare/looksrare-sdk/blob/eb2e61dba502f0d35c3c3c20236f6505ef730877/src/sign/encodeOrderParams.ts#L13)
      // and has listed ethers@5.x as a peer dependency. 0x has ethers as dependency but it is 4.x which is missing
      // the utils.isAddress method.
      throw new Error("targeted taker unsupported in looksrare");
    }

    assertAssetsIsNotEmpty(makerAssets, "maker");
    assertAssetsIsNotEmpty(takerAssets, "taker");
    assertAssetsIsNotBundled(makerAssets);
    assertAssetsIsNotBundled(takerAssets);

    const makerAsset = makerAssets[0];
    const takerAsset = takerAssets[0];
    assertAssetsIsNotErc20AndErc20(makerAsset, takerAsset);
    assertAssetsIsNotErc721Erc1155AndErc721Erc115(makerAsset, takerAsset);

    let baseAsset: Erc721Asset | Erc1155Asset;
    let quoteAsset: Erc20Asset;
    let isOrderAsk: boolean; // True = Ask, false = Bid

    if (
      (makerAsset.type === "ERC721" || makerAsset.type === "ERC1155") &&
      takerAsset.type === "ERC20"
    ) {
      baseAsset = makerAsset;
      quoteAsset = takerAsset;
      isOrderAsk = true;
    } else if (
      makerAsset.type === "ERC20" &&
      (takerAsset.type === "ERC721" || takerAsset.type === "ERC1155")
    ) {
      baseAsset = takerAsset;
      quoteAsset = makerAsset;
      isOrderAsk = false;
    } else {
      throw new Error("unsupported operation");
    }

    const contractAddresses = addressesByNetwork[this.chainId];
    const signerAddress = this.address;

    // The strategy is a validation contract that will be activated when matching maker and taker orders
    // See: https://github.com/LooksRare/contracts-exchange-v1/blob/59ccb75c939c1dcafebda8cecedbda442131f0af/contracts/LooksRareExchange.sol#L209
    const strategy = taker
      ? contractAddresses.STRATEGY_PRIVATE_SALE
      : contractAddresses.STRATEGY_STANDARD_SALE;

    const params = taker ? [taker] : [];
    const nonce = await this.getNonce(signerAddress);
    // Re: private sale
    // Address params will be encoded into solidity address param type for private sale
    // https://github.com/LooksRare/looksrare-sdk/blob/eb2e61dba502f0d35c3c3c20236f6505ef730877/src/sign/generateMakerOrderTypedData.ts#L17
    // Contract will then extract it as targetBuyer
    // https://github.com/LooksRare/contracts-exchange-v1/blob/59ccb75c939c1dcafebda8cecedbda442131f0af/contracts/executionStrategies/StrategyPrivateSale.sol#L57

    const now = Math.floor(Date.now() / 1000);
    const expTime = expirationTime
      ? Math.round(expirationTime.getTime() / 1000)
      : now + DEFAULT_EXPIRATION_TIMEOUT;

    const makerOrder: MakerOrderPayload = {
      isOrderAsk,
      signer: signerAddress,
      collection: baseAsset.contractAddress,
      tokenId: baseAsset.tokenId,
      amount: "1",
      price: quoteAsset.amount.toString(),
      currency: quoteAsset.contractAddress,
      strategy,
      nonce,
      startTime: now.toString(),
      endTime: expTime.toString(),
      minPercentageToAsk: DEFAULT_MIN_PERCENTAGE_TO_ASK,
      params,
    };

    const signature = await signMakerOrder(
      /* @ts-ignore */
      this.signer,
      this.chainId,
      makerOrder
    );

    const order = await this.postOrder({ ...makerOrder, signature });

    return normalizeOrder(order);
  }

  /**
   * Creates and posts a TakerOrder to LooksRare exchange contract
   */
  async takeOrder({
    originalOrder,
  }: LooksRareOrderData): Promise<ContractReceipt> {
    const takerOrder: TakerOrderPayload = {
      isOrderAsk: !originalOrder.isOrderAsk,
      taker: this.address,
      price: originalOrder.price,
      minPercentageToAsk: DEFAULT_MIN_PERCENTAGE_TO_ASK,
      tokenId: originalOrder.tokenId,
      params: [], // The typing expects an array even though we should be using a hex value here, I don't know why.
    };

    const parsedTakerOrder = {
      ...takerOrder,
      params: originalOrder.params || DEFAULT_PARAMS_HEX,
    };

    const parsedMakerOrder = {
      ...originalOrder,
      collection: originalOrder.collectionAddress,
      currency: originalOrder.currencyAddress,
      params: originalOrder.params || DEFAULT_PARAMS_HEX,
    };

    return takerOrder.isOrderAsk
      ? this.getExchangeContract().matchBidWithTakerAsk(
          parsedTakerOrder,
          parsedMakerOrder
        )
      : this.getExchangeContract().matchAskWithTakerBid(
          parsedTakerOrder,
          parsedMakerOrder
        );
  }

  /**
   * Gets orders from LooksRare order book.
   */
  async getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
  }: GetOrdersParams = {}): Promise<LooksRareOrderData[]> {
    const status = [Status.VALID];
    const sort = "NEWEST";

    if (taker) {
      return [];
    }

    const query: FetchOrderParams = {
      sort,
      status,
      ...(maker && { signer: maker }),
    };

    if (!makerAsset && !takerAsset) {
      const orders = await this.fetchOrders(query);

      return orders.map(normalizeOrder);
    }

    let baseAsset: Erc721Asset | Erc1155Asset | undefined;
    let quoteAsset: Erc20Asset | undefined;

    // One of makerAsset or takerAsset exist here, or both.
    if (
      makerAsset &&
      (makerAsset.type === "ERC721" || makerAsset.type === "ERC1155") &&
      (!takerAsset || takerAsset.type === "ERC20")
    ) {
      query.isOrderAsk = true;
      baseAsset = makerAsset;
      quoteAsset = takerAsset;
    } else if (
      (!makerAsset || makerAsset.type === "ERC20") &&
      takerAsset &&
      (takerAsset.type === "ERC721" || takerAsset.type === "ERC1155")
    ) {
      query.isOrderAsk = false;
      baseAsset = takerAsset;
      quoteAsset = makerAsset;
    } else {
      throw new Error("unsupported operation");
    }

    if (baseAsset) {
      const { contractAddress, tokenId } = baseAsset;
      query.collection = contractAddress;
      query.tokenId = tokenId;
    }

    if (quoteAsset) {
      const quoteAssetPrice = quoteAsset.amount.toString();
      query.currency = quoteAsset.contractAddress;
      query.price = { min: quoteAssetPrice, max: quoteAssetPrice };
    }

    const result = await this.fetchOrders(query);

    return result.map(normalizeOrder);
  }

  /**
   * Cancels order on LooksRare exchange contract.
   */
  async cancelOrder(orderData: LooksRareOrderData): Promise<ContractReceipt> {
    return this.getExchangeContract().cancelMultipleMakerOrders([
      orderData.originalOrder.nonce,
    ]);
  }

  /**
   * Gets looksrare exchange contract instance.
   */
  private getExchangeContract(): Contract {
    const exchangeAddress = addressesByNetwork[this.chainId].EXCHANGE;

    return new Contract(exchangeAddress, LooksRareExchangeAbi, this.signer);
  }

  /**
   * Gets nonce from LooksRare API.
   */
  private async getNonce(address: string): Promise<string> {
    const res = await fetch(
      `${this.getApiUrl(ApiPath.orderNonce, { address })}`
    );

    return this.parseApiResponse<string>(res);
  }

  /**
   * Posts make order to LooksRare API.
   */
  private async postOrder(payload: {
    signature: string;
    tokenId: string;
    collection: string;
    strategy: string;
    currency: string;
    signer: string;
    isOrderAsk: boolean;
    nonce: string;
    amount: string;
    price: string;
    startTime: number;
    endTime: number;
    minPercentageToAsk: number;
    params: unknown[];
  }): Promise<LooksRareOriginalOrder> {
    const res = await fetch(this.getApiUrl(ApiPath.orders), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(this.apiKey && { "X-Looks-Api-Key": this.apiKey }),
      },
      body: JSON.stringify(payload),
    });

    return this.parseApiResponse<LooksRareOriginalOrder>(res);
  }

  /**
   * Fetches order from LooksRare API.
   */
  private async fetchOrders(
    params: FetchOrderParams
  ): Promise<LooksRareOriginalOrder[]> {
    const res = await fetch(
      this.getApiUrl(ApiPath.orders, parseFetchParams(params))
    );

    return this.parseApiResponse<LooksRareOriginalOrder[]>(res);
  }

  /**
   * Parses responses from LooksRare API.
   */
  private async parseApiResponse<T>(res: Response): Promise<T> {
    const { success, data, message } = (await res.json()) as ApiResponse<T>;

    if (!success) {
      throw new Error(message);
    }

    if (!data) {
      throw new Error("missing data");
    }

    return data;
  }

  /**
   * Gets LooksRare API origin.
   */
  private getApiUrl(
    path: ApiPath,
    queryParams?: Record<string, string> | [string, string][]
  ): string {
    const params = queryParams
      ? `?${new URLSearchParams(queryParams).toString()}`
      : "";

    return `${API_ORIGIN[this.chainId]}${path}${params}`;
  }
}

/**
 * Parses fetch params into 2D array format of [ [ key1, value1 ], [ key2, value2 ], ... ].
 */
function parseFetchParams(params: FetchOrderParams): [string, string][] {
  const paramsArr: [string, string][] = [];

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      return paramsArr.push(...flattenFetchParamArr(key, value));
    }

    if (typeof value === "object" && value !== null) {
      return paramsArr.push(...flattenFetchParamObj(key, value));
    }

    paramsArr.push([key, `${value}`]);
  });

  return paramsArr;
}

/**
 * Flattens array named `A` with values of `[value1, value2]` into `[ [ 'A[]',  value1 ], [ 'A[]', value2 ] ]`.
 */
function flattenFetchParamArr(
  key: string,
  values: unknown[]
): [string, string][] {
  return values.map((val) => {
    return [`${key}[]`, `${val}`];
  });
}

/**
 * Flattens object named `A` with value of `{ key: value }` into `[ 'A[key]', value ]`.
 */
function flattenFetchParamObj(
  objName: string,
  objValue: object
): [string, string][] {
  return Object.entries(objValue).map(([key, value]) => {
    return [`${objName}[${key}]`, value];
  });
}

export function normalizeOrder(
  order: LooksRareOriginalOrder
): LooksRareOrderData {
  const isSellOrder = order.isOrderAsk;
  const nftAsset = {
    contractAddress: order.collectionAddress,
    tokenId: order.tokenId,
    amount: order.amount,
  };
  const erc20Asset = {
    contractAddress: order.currencyAddress,
    type: "ERC20",
    amount: new BigNumber(order.price).toString(),
  };

  return {
    id: order.hash,
    makerAssets: isSellOrder ? [nftAsset] : [erc20Asset],
    takerAssets: isSellOrder ? [erc20Asset] : [nftAsset],
    isSellOrder,
    originalOrder: order,
  };
}
