import { ethers } from 'ethers';
import { OpenSeaPort, Network } from 'opensea-js';
import { OrderSide } from 'opensea-js/lib/types';
import { toUnitAmount, sleep } from '../utils';
import { ETH_DECIMALS } from '../constants';
import { PlatformInterface, OpenSeaAsset, OpenseaOrder, CreateOrderOptions, GetAssetOrdersOptions, PlatformOrderData, OrderSideType } from '../types';

interface OpenseaSdkConfig {
  apiKey?: string;
  apiBaseUrl?: string;
  customProvider?: any;
  makerAddress?: string;
  useRinkebyTestnet?: boolean;
}

const OPENSEA_THROTTLE_TIME = 1000 * 1.5;

export class OpenseaSdk implements PlatformInterface<OpenseaOrder, string, void> {
  private apiKey?: string;
  private useRinkeby: boolean;
  private provider: any;
  private makerAddress?: string;
  public sdk: OpenSeaPort;
  public MAX_ASSETS_LIMIT = 200;
  public MAX_ORDERS_LIMIT = 50;

  constructor(config: OpenseaSdkConfig) {
    this.apiKey = config.apiKey;
    this.provider = config.customProvider || this._getDefaultWindowProvider();
    this.makerAddress = config.makerAddress;
    this.useRinkeby = !!config.useRinkebyTestnet;

    this.sdk = this._initSdk(config);
  }

  private _getDefaultWindowProvider() {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    return provider.provider;
  }

  private _initSdk(config: OpenseaSdkConfig) {
    return new OpenSeaPort(this.provider, {
      networkName: this.useRinkeby ? Network.Rinkeby : Network.Main,
      ...(!this.useRinkeby && { apiKey: this.apiKey }),
      apiBaseUrl: config.apiBaseUrl,
      useReadOnlyProvider: false,
    });
  }

  private _getLimit(maxLimit: number, limit?: number) {
    return limit ? Math.min(limit, maxLimit) : maxLimit;
  }

  private _getMakerAddress(): string {
    return this.makerAddress || this.provider?.selectedAddress || '';
  }

  public async createOrder({
    assets,
    priceInBaseUnits,
    paymentTokenAddress,
    expirationTime,
    ERC20TokenInfo,
    orderSide,
  }: CreateOrderOptions) {
    if (assets.length > 1) {
      console.error('Multiple assets are not supported yet.');
      return null;
    }

   const asset = {
      tokenAddress: assets[0].tokenAddress,
      tokenId: assets[0].tokenId,
      schemaName: assets[0].type,
    } as OpenSeaAsset;

    const orderOptions = {
      accountAddress: this._getMakerAddress(),
      asset,
      startAmount: toUnitAmount(priceInBaseUnits!, ERC20TokenInfo ? ERC20TokenInfo.decimals : ETH_DECIMALS),
      paymentTokenAddress,
      expirationTime,
    };

    if (orderSide === 'sell') {
      return this.sdk.createSellOrder(orderOptions);
    }

    return this.sdk.createBuyOrder(orderOptions);
  }

  public async getAssetOrders({
    asset: {
      tokenAddress,
      tokenId,
    },
    orderSide,
  }: GetAssetOrdersOptions) {
    const getOrders = (orderSide?: OrderSideType) => {
      return this.sdk.api.getOrders({
        asset_contract_address: tokenAddress,
        token_id: tokenId,
        side: orderSide === 'buy' ? OrderSide.Buy : OrderSide.Sell,
        limit: this._getLimit(this.MAX_ORDERS_LIMIT),
      });
    };

    const reqTime = Date.now();
    const ordersRes = await getOrders(orderSide);
    const timeDiff = Date.now() - reqTime;
    let buyOrders;
    if (!orderSide) {
      if (timeDiff < OPENSEA_THROTTLE_TIME) {
        await sleep(OPENSEA_THROTTLE_TIME - timeDiff);
      }
      buyOrders = await getOrders('buy');
    }
    return ordersRes.orders.concat(buyOrders?.orders || []);
  }

  public fulfillOrder(platformOrderData: PlatformOrderData) {
    return this.sdk.fulfillOrder({ order: platformOrderData as OpenseaOrder, accountAddress: this._getMakerAddress() });
  }

  public cancelOrder(platformOrderData: PlatformOrderData) {
    return this.sdk.cancelOrder({ order: platformOrderData as OpenseaOrder, accountAddress: this._getMakerAddress() });
  }

  public getAssets({
    owner,
    contractAddress,
    tokenIds,
    search,
    orderBy,
    orderDirection,
    limit,
    offset,
    cursor,
  }: {
    owner?: string;
    contractAddress?: string;
    tokenIds?: Array<number | string>;
    search?: string;
    orderBy?: string;
    orderDirection?: string;
    limit?: number;
    offset?: number;
    cursor?: string;
  }) {
    return this.sdk.api.getAssets({
      owner,
      asset_contract_address: contractAddress,
      token_ids: tokenIds,
      search,
      order_by: orderBy,
      order_direction: orderDirection,
      limit: this._getLimit(this.MAX_ASSETS_LIMIT, limit),
      offset,
      cursor,
    });
  }
}
