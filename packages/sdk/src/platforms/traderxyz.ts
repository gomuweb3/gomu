import { ethers } from 'ethers';
import { NftSwapV4, type SwappableAssetV4 } from '@traderxyz/nft-swap-sdk';
import { getERC20Asset } from '../utils';
import { PlatformInterface, TraderxyzOrder, CreateOrderOptions, GetAssetOrdersOptions, PlatformOrderData, CustomProvidersConfig } from '../types';

export interface TraderxyzConfig {
  chainId?: number;
  customProviders?: CustomProvidersConfig;
  makerAddress?: string;
  gasLimit?: string;
}

export class TraderxyzSdk implements PlatformInterface<TraderxyzOrder, ethers.providers.TransactionReceipt, ethers.ContractTransaction> {
  private provider: any;
  private signer: any;
  private chainId: number;
  private makerAddress?: string;
  private sdk: NftSwapV4;
  private DEFAULT_GAS_LIMIT: string;

  constructor(config?: TraderxyzConfig) {
    this.provider = config?.customProviders ? config.customProviders.provider : this._getDefaultWindowProvider();
    this.signer = config?.customProviders ? config.customProviders.signer : this.provider.getSigner();
    this.chainId = config?.chainId || 1;
    this.makerAddress = config?.makerAddress;
    this.sdk = new NftSwapV4(this.provider, this.signer, this.chainId);
    this.DEFAULT_GAS_LIMIT = config?.gasLimit || '350000';
  }

  private _getDefaultWindowProvider() {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    return provider;
  }

  private _getMakerAddress(): string {
    return this.makerAddress || this.provider.provider?.selectedAddress || '';
  }

  public async approveAssetsStatuses({
    assets,
    accountAddress = this._getMakerAddress(),
  }: {
    assets: SwappableAssetV4[];
    accountAddress?: string;
  }) {
    const approvalStatuses = await Promise.all(assets.map((asset) => {
      return this.sdk.loadApprovalStatus(
        asset,
        accountAddress,
      );
    }));

    await Promise.all(approvalStatuses.map(async (status, index) => {
      if (status.contractApproved) return;
      const asset = assets[index];
      const approvalTx = await this.sdk.approveTokenOrNftByAsset(
        asset,
        accountAddress,
      );
      await approvalTx.wait();
    }));
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
    if (orderSide === 'sell' && !paymentTokenAddress) {
      console.warn('Traderxyz requires "paymentTokenAddress".');
      return null;
    }

    const ERC20Asset = getERC20Asset({
      priceInBaseUnits,
      tokenAddress: paymentTokenAddress!,
    });

    const makerAssets = orderSide === 'sell'
      ? assets as SwappableAssetV4[]
      : [ERC20Asset];
    const takerAssets = orderSide === 'sell'
      ? [ERC20Asset]
      : assets as SwappableAssetV4[];

    const makerAddress = this._getMakerAddress();

    await this.approveAssetsStatuses({ assets: makerAssets });

    const order = this.sdk.buildOrder(
      // @ts-ignore
      makerAssets[0],
      takerAssets[0],
      makerAddress,
      { expiry: expirationTime },
    );
    const signedOrder = await this.sdk.signOrder(order);

    const postedOrder = await this.sdk.postOrder(signedOrder, String(this.chainId));

    return postedOrder as TraderxyzOrder;
  };

  public async getAssetOrders({
    asset,
    orderSide,
  }: GetAssetOrdersOptions) {
    const { orders } = await this.sdk.getOrders({
      nftTokenId: asset.tokenId,
      nftToken: asset.tokenAddress,
      sellOrBuyNft: orderSide,
    });

    return orders as TraderxyzOrder[];
  };

  public async fulfillOrder(platformOrderData: PlatformOrderData) {
    const { order } = platformOrderData as TraderxyzOrder;
    const takerAssets = [this.sdk.getTakerAsset(order)];

    await this.approveAssetsStatuses({ assets: takerAssets, accountAddress: this._getMakerAddress() });

    const fillTx = await this.sdk.fillSignedOrder(order, undefined, { gasLimit: this.DEFAULT_GAS_LIMIT });

    const fillTxReceipt = await this.sdk.awaitTransactionHash(fillTx.hash);
    return fillTxReceipt;
  }

  public async cancelOrder(platformOrderData: PlatformOrderData) {
    const { nftType: orderType, order: { nonce } } = platformOrderData as TraderxyzOrder;
    return this.sdk.cancelOrder(nonce, orderType);
  }
}
