import { Signer } from "@ethersproject/abstract-signer";
import { BaseProvider } from "@ethersproject/providers";
import { NftSwapV4 } from "@traderxyz/nft-swap-sdk";

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
export async function approveAsset({
  provider,
  chainId,
  walletAddress,
  signer,
  contractAddress,
  asset,
}: {
  provider: BaseProvider;
  chainId: number;
  walletAddress: string;
  signer: Signer;
  contractAddress: string;
  asset: Asset;
}): Promise<void> {
  const sdk = new NftSwapV4(provider, signer, chainId, {
    zeroExExchangeProxyContractAddress: contractAddress,
  });
  const swappableAsset = convertAsset(asset);

  const approvalStatus = await sdk.loadApprovalStatus(
    swappableAsset,
    walletAddress
  );

  if (approvalStatus.contractApproved) {
    return;
  }

  const approvalTx = await sdk.approveTokenOrNftByAsset(
    swappableAsset,
    walletAddress
  );

  await approvalTx.wait();
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
