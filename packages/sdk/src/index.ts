import { type SwappableAsset, type SwappableAssetV4, SupportedChainIdsV4 } from '@traderxyz/nft-swap-sdk';
import traderxyzAddresses from '@traderxyz/nft-swap-sdk/src/sdk/v4/addresses.json';
import { type OpenSeaAsset } from 'opensea-js/lib/types';
import type {
  OrderSideType,
  TradableAsset,
  TraderxyzOrder,
  OpenseaOrder,
  SupportedPlatformType,
  OpenseaSupportedNetwork,
  PlatformOrder,
  CreateOrderOptionsUserFacing,
  GetAssetOrdersResponse,
  ERC20TokenInfo,
  CustomProvidersConfig,
} from './types';
import { SwapSdk } from './swap';
import { OpenseaSdk } from './platforms/opensea';
import { TraderxyzSdk, TraderxyzConfig } from './platforms/traderxyz';
import { transformCreateOrderResults, getERC20Asset } from './utils';
import { WETH_ADDRESSES } from './constants';

export { SwapSdk, OpenseaSdk, TradableAsset, SwappableAsset, SwappableAssetV4, OpenSeaAsset, OpenseaOrder, TraderxyzOrder, PlatformOrder, GetAssetOrdersResponse };
export { SUPPORTED_TOKEN_TYPES } from './constants';
export type { WrappedOrder, SupportedTokenType, SupportedPlatformType, OrderSideType } from './types';

interface CommerceSdkConfig {
  chainId?: number;
  customProviders?: CustomProvidersConfig;
  makerAddress?: string;
  selectedPlatforms?: SupportedPlatformType[];
  openseaConfig?: {
    apiKey?: string;
  }
  traderxyzConfig?: {
    gasLimit?: string;
  }
}

const traderxyzSupportedChains = Object.keys(SupportedChainIdsV4).reduce((acc, entry) => {
  const num = Number(entry);
  if (Number.isInteger(num)) {
    acc.push(num);
  }
  return acc;
}, [] as number[]);

const SUPPORTED_CHAINS_MAPPING: Record<SupportedPlatformType, number[]> = {
  opensea: [1, 4],
  traderxyz: traderxyzSupportedChains,
};

const SUPPORTED_PLATFORMS: SupportedPlatformType[] = ['opensea', 'traderxyz'];

const getTraderxyzSdk = (config: TraderxyzConfig) => {
  let traderxyzSdk;
  let error: any;
  try {
    traderxyzSdk = new TraderxyzSdk(config);
  } catch (e: any) {
    // protects only from usage of unsupported chainId, which is properly handled in other methods
    traderxyzSdk = new TraderxyzSdk({ ...config, chainId: 1 });
    error = e;
  }
  return { traderxyzSdk, error };
};

export class CommerceSdk {
  private traderxyzSdk: TraderxyzSdk;
  private openseaSdk: OpenseaSdk;
  private openseaNetwork: OpenseaSupportedNetwork;
  private isOpenseaEnabled: boolean;
  private sdkMapping: Record<SupportedPlatformType, TraderxyzSdk | OpenseaSdk>;
  readonly chainId: number;
  readonly enabledPlatforms: SupportedPlatformType[];
  readonly supportedChains = SUPPORTED_CHAINS_MAPPING;
  readonly selectedPlatforms: SupportedPlatformType[];

  constructor(config?: CommerceSdkConfig) {
    const { chainId = 1, customProviders, makerAddress, selectedPlatforms, openseaConfig, traderxyzConfig } = config || {};

    if ((typeof window === 'undefined' || !window.ethereum) && !customProviders) {
      throw new Error('"customProviders" required if "window.ethereum" is unavailable.');
    }

    this.chainId = chainId;
    this.selectedPlatforms = selectedPlatforms || [];
    this.enabledPlatforms = SUPPORTED_PLATFORMS.reduce((acc, key) => {
      if (selectedPlatforms?.length && !selectedPlatforms.includes(key)) {
        return acc;
      }
      if (SUPPORTED_CHAINS_MAPPING[key].includes(chainId)) {
        acc.push(key);
      }
      return acc;
    }, [] as SupportedPlatformType[]);

    if (!this.enabledPlatforms.length) {
      console.error(this._getNoPlatformsErrorMessage());
    }

    const { traderxyzSdk, error } = getTraderxyzSdk({ chainId, customProviders, makerAddress, gasLimit: traderxyzConfig?.gasLimit });
    if (error && (!this.selectedPlatforms.length || !this.selectedPlatforms.includes('traderxyz'))) {
      console.error(`TraderxyzSdk initialization error with chainId ${chainId}:`, error);
    }

    this.traderxyzSdk = traderxyzSdk;
    const useRinkebyTestnet = chainId === 4;
    this.openseaSdk = new OpenseaSdk({
      apiKey: openseaConfig?.apiKey,
      useRinkebyTestnet,
      customProvider: customProviders?.hdWallet,
      makerAddress,
    });
    this.isOpenseaEnabled = this.enabledPlatforms.includes('opensea');
    this.openseaNetwork = useRinkebyTestnet ? 'rinkeby' : 'main';
    this.sdkMapping = {
      opensea: this.openseaSdk,
      traderxyz: this.traderxyzSdk,
    }
  }

  private _getNoPlatformsErrorMessage() {
    return `ChainId ${this.chainId} doesn't have supported platforms with this configuration.
    Supported chains: ${JSON.stringify(this.supportedChains)}.
    ${this.selectedPlatforms?.length ? `Selected platforms configuration: ${JSON.stringify(this.selectedPlatforms)}` : ''}`;
  }

  private async _approveAssetsStatuses(assets: SwappableAssetV4[]) {
    const supportedChainIds = Object.keys(traderxyzAddresses).map(Number);
    if (supportedChainIds.includes(this.chainId)) {
      await this.traderxyzSdk.approveAssetsStatuses({ assets });
    }
  }

  private _getSdk(platform: SupportedPlatformType) {
    const sdk = this.sdkMapping[platform];
    if (!sdk) {
      throw new Error(`Platform "${platform}" is not supported. Supported platforms: ${JSON.stringify(SUPPORTED_PLATFORMS)}`);
    }
    return sdk;
  }

  private _doInitialSafetyChecks() {
    if (!this.enabledPlatforms.length) {
      throw new Error(this._getNoPlatformsErrorMessage());
    }
  }

  private async _getERC20TokenInfo(address?: string): Promise<ERC20TokenInfo | undefined> {
    if (!this.isOpenseaEnabled || !address) return undefined;
    const { tokens } = await this.openseaSdk.sdk.api.getPaymentTokens({ address });
    return tokens[0];
  }

  public async createSellOrders({
    asset,
    priceInBaseUnits,
    paymentTokenAddress,
    expirationTime,
  }: CreateOrderOptionsUserFacing) {
    this._doInitialSafetyChecks();

    const ERC20TokenInfo = await this._getERC20TokenInfo(paymentTokenAddress);

    if (this.isOpenseaEnabled && paymentTokenAddress && !ERC20TokenInfo) {
      throw new Error(`Trading for this asset (${paymentTokenAddress}) is not yet supported on this chain with opensea.`);
    }

    this._approveAssetsStatuses([asset as SwappableAssetV4]);

    const results = await Promise.all(this.enabledPlatforms.map(async (platform) => {
      const sdk = this._getSdk(platform);
      const result = await sdk.createOrder({
        assets: [asset],
        priceInBaseUnits,
        paymentTokenAddress,
        expirationTime,
        ERC20TokenInfo,
        orderSide: 'sell',
      });

      return {
        platform,
        result,
      };
    }));

    return transformCreateOrderResults(results);
  }

  public async createBuyOrders({
    asset,
    priceInBaseUnits,
    paymentTokenAddress: paymentTokenAddressFromOptions,
    expirationTime,
  }: CreateOrderOptionsUserFacing) {
    this._doInitialSafetyChecks();

    const paymentTokenAddress = paymentTokenAddressFromOptions
      || (this.isOpenseaEnabled ? WETH_ADDRESSES[this.openseaNetwork] : ''); // creating buy orders by default uses WETH on opensea side if no token is specified

    if (!paymentTokenAddress) {
      throw new Error('"paymentTokenAddress" is required for this chainId');
    }

    const ERC20TokenInfo = await this._getERC20TokenInfo(paymentTokenAddress);

    if (this.isOpenseaEnabled && !ERC20TokenInfo) {
      throw new Error(`Trading for this asset (${paymentTokenAddress}) is not yet supported on this chain with opensea.`);
    }

    const ERC20Asset = getERC20Asset({
      priceInBaseUnits,
      tokenAddress: paymentTokenAddress!,
    });

    await this._approveAssetsStatuses([ERC20Asset]);

    const results = await Promise.all(this.enabledPlatforms.map(async (platform) => {
      const sdk = this._getSdk(platform);
      const result = await sdk.createOrder({
        assets: [asset],
        priceInBaseUnits,
        paymentTokenAddress,
        expirationTime,
        ERC20TokenInfo,
        orderSide: 'buy',
      });

      return {
        platform,
        result,
      };
    }));

    return transformCreateOrderResults(results);
  }

  public async getAssetOrders({
    asset,
    orderSide,
  }: {
    asset: TradableAsset;
    orderSide?: OrderSideType;
  }) {
    const results = await Promise.all(this.enabledPlatforms.map(async (platform) => {
      const sdk = this._getSdk(platform);
      const result = await sdk.getAssetOrders({
        asset,
        orderSide,
      });

      return {
        platform,
        result,
      };
    }));

    return results.reduce((acc, { platform, result }) => {
      const platformOrders = result.map((order) => ({
        platform,
        order,
      }));
      acc[platform] = platformOrders;

      return acc;
    }, {} as GetAssetOrdersResponse);
  }

  public fulfillOrder({ platform, order }: PlatformOrder) {
    const sdk = this._getSdk(platform);
    return sdk.fulfillOrder(order);
  }

  public cancelOrder({ platform, order }: PlatformOrder) {
    const sdk = this._getSdk(platform);
    return sdk.cancelOrder(order);
  }
};
