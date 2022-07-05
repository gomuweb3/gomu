import { Signer } from "@ethersproject/abstract-signer";
import { BaseProvider } from "@ethersproject/providers";
import { NftSwapV4, SupportedChainIdsV4 } from "@traderxyz/nft-swap-sdk";
import BigNumber from "bignumber.js";

import {
  assertAssetsIsNotBundled,
  assertAssetsIsNotEmpty,
  assertAssetsIsNotErc20AndErc20,
  assertAssetsIsNotErc721Erc1155AndErc721Erc115,
} from "./validators";

import type {
  Asset,
  BigNumberFee,
  Fee,
  GetOrdersParams,
  MakeOrderParams,
} from "../types";
import type { Marketplace } from "./Marketplace";
import type {
  ContractReceipt,
  ContractTransaction,
} from "@ethersproject/contracts";
import type {
  SwappableAssetV4,
  UserFacingERC20AssetDataSerializedV4,
} from "@traderxyz/nft-swap-sdk";
import type {
  PostOrderResponsePayload,
  SearchOrdersParams,
} from "@traderxyz/nft-swap-sdk/dist/sdk/v4/orderbook";

export interface TraderConfig {
  gasLimit?: number;
}

export interface _TraderConfig extends TraderConfig {
  provider: BaseProvider;
  chainId: number;
  address: string;
  signer: Signer;
}

export const traderSupportedChainIds = Object.keys(SupportedChainIdsV4)
  .filter((key) => Number.isInteger(Number(key)))
  .map(Number);

export class Trader implements Marketplace<PostOrderResponsePayload> {
  private readonly nftSwapSdk: NftSwapV4;
  private readonly chainId: number;
  private readonly address: string;
  private readonly gasLimit: number;

  constructor({
    provider,
    chainId,
    address,
    signer,
    gasLimit = 2000000,
  }: _TraderConfig) {
    this.nftSwapSdk = new NftSwapV4(provider, signer, chainId);
    this.chainId = chainId;
    this.address = address;
    this.gasLimit = gasLimit;
  }

  static supportsChainId(chainId: number): boolean {
    return traderSupportedChainIds.includes(chainId);
  }

  async makeOrder({
    makerAssets,
    takerAssets,
    taker,
    expirationTime,
    marketplacesConfig,
  }: MakeOrderParams): Promise<PostOrderResponsePayload> {
    assertAssetsIsNotEmpty(makerAssets, "maker");
    assertAssetsIsNotEmpty(takerAssets, "taker");
    assertAssetsIsNotBundled(makerAssets);
    assertAssetsIsNotBundled(takerAssets);

    let makerAsset: Asset | SwappableAssetV4 = makerAssets[0];
    let takerAsset: Asset | SwappableAssetV4 = takerAssets[0];
    assertAssetsIsNotErc20AndErc20(makerAsset, takerAsset);
    assertAssetsIsNotErc721Erc1155AndErc721Erc115(makerAsset, takerAsset);

    makerAsset = getSwappableAssetV4(makerAsset);
    takerAsset = getSwappableAssetV4(takerAsset);

    const { amount } = (
      makerAsset.type === "ERC20" ? makerAsset : takerAsset
    ) as UserFacingERC20AssetDataSerializedV4;
    const { fees } = marketplacesConfig?.trader || {};
    const { flatAmountFees, totalFeesAmount } = calculateFees(fees, amount);

    // Nft-swap-sdk adds fees on top of erc20 amount, so we need to subtract total fees from erc20 amount
    // https://github.com/trader-xyz/nft-swap-sdk/blob/main/src/sdk/v4/NftSwapV4.ts#L1148
    if (totalFeesAmount.gte(0)) {
      const amountWithoutFees = new BigNumber(amount)
        .minus(totalFeesAmount)
        .toString();
      if (makerAsset.type === "ERC20") {
        makerAsset.amount = amountWithoutFees;
      }

      if (takerAsset.type === "ERC20") {
        takerAsset.amount = amountWithoutFees;
      }
    }

    await this.approveAsset(makerAsset);

    const order = this.nftSwapSdk.buildOrder(
      // @ts-ignore
      makerAsset,
      takerAsset,
      this.address,
      {
        taker,
        expiry: expirationTime,
        fees: flatAmountFees,
      }
    );
    const signedOrder = await this.nftSwapSdk.signOrder(order);
    return this.nftSwapSdk.postOrder(signedOrder, this.chainId.toString());
  }

  async getOrders({
    makerAsset,
    maker,
    takerAsset,
    taker,
  }: GetOrdersParams = {}): Promise<PostOrderResponsePayload[]> {
    let filters: Partial<SearchOrdersParams> = {};

    if (makerAsset) {
      filters = addAssetFilters(filters, makerAsset);
    }

    if (maker) {
      filters.maker = maker;
    }

    if (takerAsset) {
      filters = addAssetFilters(filters, takerAsset);
    }

    if (taker) {
      filters.taker = taker;
    }

    const resp = await this.nftSwapSdk.getOrders(filters);
    return resp.orders;
  }

  async takeOrder(order: PostOrderResponsePayload): Promise<ContractReceipt> {
    const signedOrder = order.order;

    let takerAsset: SwappableAssetV4;
    if (order.sellOrBuyNft === "buy") {
      takerAsset = {
        tokenAddress: order.nftToken,
        tokenId: order.nftTokenId,
        type: order.nftType as "ERC721" | "ERC1155",
        amount: order.nftTokenAmount,
      };
    } else if (order.sellOrBuyNft === "sell") {
      takerAsset = {
        tokenAddress: order.erc20Token,
        type: "ERC20",
        amount: order.erc20TokenAmount,
      };
    } else {
      throw new Error(`unknown side: ${order.sellOrBuyNft}`);
    }

    await this.approveAsset(takerAsset);

    const fillTx = await this.nftSwapSdk.fillSignedOrder(
      signedOrder,
      undefined,
      {
        gasLimit: this.gasLimit,
      }
    );
    return fillTx.wait();
  }

  async cancelOrder(
    order: PostOrderResponsePayload
  ): Promise<ContractTransaction> {
    return this.nftSwapSdk.cancelOrder(
      order.order.nonce,
      order.nftType as "ERC721" | "ERC1155"
    );
  }

  private async approveAsset(asset: SwappableAssetV4): Promise<void> {
    const approvalStatus = await this.nftSwapSdk.loadApprovalStatus(
      asset,
      this.address
    );

    if (!approvalStatus.contractApproved) {
      const approvalTx = await this.nftSwapSdk.approveTokenOrNftByAsset(
        asset,
        this.address
      );
      await approvalTx.wait();
    }
  }
}

function addAssetFilters(
  filters: Partial<SearchOrdersParams>,
  asset: Asset
): Partial<SearchOrdersParams> {
  const newFilters = { ...filters };
  const { contractAddress, type } = asset;

  switch (type) {
    case "ERC20":
      newFilters.erc20Token = contractAddress;
      break;
    case "ERC721":
      newFilters.nftToken = contractAddress;
      break;
    case "ERC1155":
      newFilters.nftToken = contractAddress;
      newFilters.nftTokenId = asset.tokenId;
      break;
    default:
      throw new Error(`unknown asset type: ${type}`);
  }

  return newFilters;
}

function getSwappableAssetV4(asset: Asset): SwappableAssetV4 {
  const { contractAddress, type } = asset;
  switch (type) {
    case "ERC20":
      return {
        tokenAddress: contractAddress,
        type,
        amount: asset.amount.toString(),
      };
    case "ERC721":
      return {
        tokenAddress: contractAddress,
        tokenId: asset.tokenId,
        type,
      };
    case "ERC1155":
      return {
        tokenAddress: contractAddress,
        tokenId: asset.tokenId,
        type,
        amount: asset.amount.toString(),
      };
    default:
      throw new Error(`unknown asset type: ${type}`);
  }
}

const BASIS_POINTS_100_PERCENT = 10000;

function calculateFees(
  fees: Fee[] | undefined,
  amount: string
): { flatAmountFees: BigNumberFee[]; totalFeesAmount: BigNumber } {
  const flatAmountFees: BigNumberFee[] = [];
  let totalFeesAmount = new BigNumber(0);

  if (fees?.length) {
    for (let i = 0; i <= fees.length; i++) {
      const fee = fees[i];

      if ("amount" in fee && fee.amount > 0) {
        if (new BigNumber(String(fee.amount)).gte(new BigNumber(amount))) {
          throw new Error(
            "Fee amount cannot be greater than or equal to amount"
          );
        }

        flatAmountFees.push({ ...fee, amount: String(fee.amount) });
        totalFeesAmount = totalFeesAmount.plus(
          new BigNumber(String(fee.amount))
        );
        continue;
      }

      if ("basisPoints" in fee && fee.basisPoints > 0) {
        if (fee.basisPoints >= BASIS_POINTS_100_PERCENT) {
          throw new Error(
            "Fee basis points cannot be greater than or equal to 100% of amount"
          );
        }

        const feeAmount = new BigNumber(amount)
          .times(fee.basisPoints)
          .div(BASIS_POINTS_100_PERCENT)
          .toFixed(0);

        flatAmountFees.push({
          ...fee,
          amount: feeAmount.toString(),
        });
        totalFeesAmount = totalFeesAmount.plus(feeAmount);
      }
    }

    if (totalFeesAmount.gte(new BigNumber(amount))) {
      throw new Error("Total fees cannot be greater than or equal to amount");
    }
  }

  return { flatAmountFees, totalFeesAmount };
}
