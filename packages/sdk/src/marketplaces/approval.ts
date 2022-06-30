import { Signer } from "@ethersproject/abstract-signer";
import { BaseProvider } from "@ethersproject/providers";
import {
  getApprovalStatus as getApprovalStatus_,
  approveAsset as approveAsset_,
} from "@traderxyz/nft-swap-sdk/src/sdk/v4/pure";

import { Asset } from "../types";

import type {
  SwappableAssetV4,
  UserFacingERC20AssetDataSerializedV4,
  UserFacingERC721AssetDataSerializedV4,
  UserFacingERC1155AssetDataSerializedV4,
} from "@traderxyz/nft-swap-sdk";

/**
 * Approves asset for use on specified contract address.
 * @param params Params for asset approval
 */
export async function approveAsset(params: {
  walletAddress: string;
  contractAddress: string;
  asset: Asset;
  provider: BaseProvider;
  signer: Signer;
}): Promise<void> {
  const { walletAddress, contractAddress, asset, provider, signer } = params;
  const swappableAsset = convertAsset(asset);

  if (
    await isApprovedAsset(
      walletAddress,
      contractAddress,
      swappableAsset,
      provider
    )
  ) {
    return;
  }

  const approvalStatus = await approveAsset_(
    contractAddress,
    swappableAsset,
    signer
  );

  await approvalStatus.wait();
}

/**
 * Gets approval status of assets related to wallet for use in contract.
 * @param walletAddress Address of wallet holding the tokens
 * @param contractAddress Address of the contract to grant approval of token use in
 * @param asset ERC20/ERC721/ERC1155 asset
 * @param provider
 */
async function isApprovedAsset(
  walletAddress: string,
  contractAddress: string,
  asset: SwappableAssetV4,
  provider: BaseProvider
): Promise<boolean> {
  const approvalStatus = await getApprovalStatus_(
    walletAddress,
    contractAddress,
    asset,
    provider
  );

  return approvalStatus.contractApproved;
}

/**
 * Converts our internal asset type to swappable asset V4.
 * @param asset
 */
function convertAsset(asset: Asset): SwappableAssetV4 {
  if (asset.type === "ERC20") {
    const swappableErc20Asset: UserFacingERC20AssetDataSerializedV4 = {
      type: "ERC20",
      tokenAddress: asset.contractAddress,
      amount: asset.amount.toString(),
    };

    return swappableErc20Asset;
  }

  if (asset.type === "ERC721") {
    const swappableErc721Asset: UserFacingERC721AssetDataSerializedV4 = {
      type: "ERC721",
      tokenAddress: asset.contractAddress,
      tokenId: asset.tokenId,
    };

    return swappableErc721Asset;
  }

  if (asset.type === "ERC1155") {
    const swappableErc1155Asset: UserFacingERC1155AssetDataSerializedV4 = {
      type: "ERC1155",
      tokenAddress: asset.contractAddress,
      tokenId: asset.tokenId,
      amount: asset.amount.toString(),
    };

    return swappableErc1155Asset;
  }

  throw new Error("unsupported type");
}
