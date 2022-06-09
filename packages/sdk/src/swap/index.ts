import { Signer } from "@ethersproject/abstract-signer";
import { Web3Provider } from "@ethersproject/providers";
import {
  NftSwapV3,
  type SwappableAsset,
  SignedOrder,
} from "@traderxyz/nft-swap-sdk";

import { Asset } from "../types";

export interface SwapSdkConfig {
  gasLimit?: number;
}

export interface _SwapSdkConfig extends SwapSdkConfig {
  address: string;
  chainId: number;
  provider: Web3Provider;
  signer: Signer;
}

export class SwapSdk {
  private address: string;
  private sdk: NftSwapV3;
  private gasLimit = 350000;

  constructor({
    address,
    chainId,
    provider,
    signer,
    gasLimit,
  }: _SwapSdkConfig) {
    this.address = address;
    this.sdk = new NftSwapV3(provider, signer, chainId);
    if (gasLimit) {
      this.gasLimit = gasLimit;
    }
  }

  static supportedChainIds = [1, 4];

  async approveAssetsStatuses({
    assets,
  }: {
    assets: SwappableAsset[];
  }): Promise<void> {
    const approvalStatuses = await Promise.all(
      assets.map((asset) => {
        return this.sdk.loadApprovalStatus(asset, this.address);
      })
    );

    await Promise.all(
      approvalStatuses.map(async (status, index) => {
        if (status.contractApproved) return;
        const asset = assets[index];
        const approvalTx = await this.sdk.approveTokenOrNftByAsset(
          asset,
          this.address
        );
        await approvalTx.wait();
      })
    );
  }

  transformAssetsToSwappableAssets(assets: Asset[]): SwappableAsset[] {
    return assets.map(({ contractAddress, amount, ...rest }: any) => {
      return {
        ...rest,
        tokenAddress: contractAddress,
        ...(amount && { amount: String(amount) }),
      };
    });
  }

  async makeOrder({
    makerAssets,
    takerAssets,
  }: {
    makerAssets: Asset[];
    takerAssets: Asset[];
  }): Promise<SignedOrder> {
    const swappableMakerAssets =
      this.transformAssetsToSwappableAssets(makerAssets);
    const swappableTakerAssets =
      this.transformAssetsToSwappableAssets(takerAssets);
    await this.approveAssetsStatuses({ assets: swappableMakerAssets });

    const order = this.sdk.buildOrder(
      swappableMakerAssets,
      swappableTakerAssets,
      this.address
    );
    const signedOrder = await this.sdk.signOrder(order, this.address);

    return signedOrder;
  }

  async takeOrder({
    order,
    gasLimit = this.gasLimit,
  }: {
    order: SignedOrder;
    gasLimit?: number;
  }): Promise<any> {
    const { takerAssets } = this.sdk.getAssetsFromOrder(order);

    await this.approveAssetsStatuses({ assets: takerAssets });

    const fillTx = await this.sdk.fillSignedOrder(order, undefined, {
      gasLimit,
    });

    const fillTxReceipt = await this.sdk.awaitTransactionHash(fillTx.hash);
    return fillTxReceipt;
  }
}
