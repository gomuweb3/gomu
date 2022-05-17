import { ethers } from 'ethers';
import { NftSwapV3, NftSwapV4, type SwappableAsset, SignedOrder, SignedNftOrderV4 } from '@traderxyz/nft-swap-sdk';
import { WrappedOrder } from './types';

interface SwapSdkConfig {
  customProvider?: any;
  customSigner?: any;
  chainId?: number;
  gasLimit?: string;
}

export class SwapSdk {
  private provider: any;
  private signer: any;
  private chainId: number;
  private sdkV3: NftSwapV3;
  private sdkV4: NftSwapV4;
  private DEFAULT_GAS_LIMIT: string;

  constructor(config?: SwapSdkConfig) {
    this.provider = config?.customProvider || this._getDefaultWindowProvider();
    this.signer = config?.customSigner || this.provider.getSigner();
    this.chainId = config?.chainId || 1;
    const { sdkV3, sdkV4 } = this._initSdk();
    this.sdkV3 = sdkV3;
    this.sdkV4 = sdkV4;
    this.DEFAULT_GAS_LIMIT = config?.gasLimit || '350000';
  }

  private _getDefaultWindowProvider() {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    return provider;
  }

  private _initSdk() {
    return {
      sdkV3: new NftSwapV3(this.provider, this.signer, this.chainId),
      sdkV4: new NftSwapV4(this.provider, this.signer, this.chainId),
    };
  }

  private _getSelectedAddress(): string {
    return this.provider.provider?.selectedAddress || '';
  }

  public isV4Order({
    makerAssets,
    takerAssets
  }: {
    makerAssets: SwappableAsset[];
    takerAssets: SwappableAsset[];
  }) {
    if (makerAssets.length > 1 || takerAssets.length > 1) {
      return false;
    }

    const makerAssetIsERC20 = makerAssets[0].type === 'ERC20';
    const takerAssetIsERC20 = takerAssets[0].type === 'ERC20';

    if ((makerAssetIsERC20 && takerAssetIsERC20) || (!makerAssetIsERC20 && !takerAssetIsERC20)) {
      return false;
    }
    return true;
  }

  public async approveAssetsStatuses({
    assets,
    accountAddress = this._getSelectedAddress(),
    isV4,
  }: {
    assets: SwappableAsset[];
    accountAddress?: string;
    isV4?: boolean;
  }) {
    const sdk = isV4 ? this.sdkV4 : this.sdkV3;
    const approvalStatuses = await Promise.all(assets.map((asset) => {
      return sdk.loadApprovalStatus(
        asset,
        accountAddress,
      );
    }));

    await Promise.all(approvalStatuses.map(async (status, index) => {
      if (status.contractApproved) return;
      const asset = assets[index];
      const approvalTx = await sdk.approveTokenOrNftByAsset(
        asset,
        accountAddress,
      );
      await approvalTx.wait();
    }));
  }

  public filterOutEmptyAddressAssets(assets: SwappableAsset[]) {
    return assets.filter((a) => !!a.tokenAddress);
  };

  public getAssetsFromWrappedOrder({ isV4, signedOrder }: WrappedOrder) {
    if (isV4) {
      return {
        makerAssets: [this.sdkV4.getMakerAsset(signedOrder as SignedNftOrderV4)],
        takerAssets: [this.sdkV4.getTakerAsset(signedOrder as SignedNftOrderV4)],
      };
    }
    return this.sdkV3.getAssetsFromOrder(signedOrder as SignedOrder);
  }

  public async generateWrappedOrder({
    makerAssets: makerAssetsFromProps,
    takerAssets: takerAssetsFromProps,
    takerAddress,
    makerAddress = this._getSelectedAddress(),
  }: {
    makerAssets: SwappableAsset[];
    takerAssets: SwappableAsset[];
    takerAddress: string;
    makerAddress?: string;
  }) {
    const makerAssets = this.filterOutEmptyAddressAssets(makerAssetsFromProps);
    const takerAssets = this.filterOutEmptyAddressAssets(takerAssetsFromProps);
    const isV4 = this.isV4Order({ makerAssets, takerAssets });

    await this.approveAssetsStatuses({ assets: makerAssets, accountAddress: makerAddress, isV4 });

    const getSignedOrder = async () => {
      if (isV4) {
        const order = this.sdkV4.buildOrder(
          // @ts-ignore
          makerAssets[0],
          takerAssets[0],
          makerAddress,
        );
        const signedOrder = await this.sdkV4.signOrder(order);
        return signedOrder;
      } else {
        const order = this.sdkV3.buildOrder(
          makerAssets,
          takerAssets,
          makerAddress,
        );
        const signedOrder = await this.sdkV3.signOrder(order, makerAddress);
        return signedOrder;
      }
    };

    const signedOrder = await getSignedOrder();
    const wrappedOrder = {
      isV4,
      makerAddress,
      takerAddress,
      signedOrder,
    };

    return wrappedOrder;
  }

  public async takeWrappedOrder({
    order,
    takerAddress = this._getSelectedAddress(),
    gasLimit = this.DEFAULT_GAS_LIMIT,
  }: {
    order: WrappedOrder;
    takerAddress?: string;
    gasLimit?: string;
  }) {
    const { takerAssets } = this.getAssetsFromWrappedOrder(order);

    await this.approveAssetsStatuses({ assets: takerAssets, accountAddress: takerAddress });

    const fillTx = order.isV4
      ? await this.sdkV4.fillSignedOrder(order.signedOrder as SignedNftOrderV4, undefined, { gasLimit })
      : await this.sdkV3.fillSignedOrder(order.signedOrder as SignedOrder, undefined, { gasLimit });

    const sdk = order.isV4 ? this.sdkV4 : this.sdkV3;
    const fillTxReceipt = await sdk.awaitTransactionHash(fillTx.hash);
    return fillTxReceipt;
  };
}
