import type { Asset } from "../types";

export function assertAssetsIsNotEmpty(assets: Asset[], prefix: string): void {
  if (!assets || assets.length === 0) {
    throw new Error(`${prefix} assets cannot be empty`);
  }
}

export function assertAssetsIsNotBundled(assets: Asset[]): void {
  if (assets.length > 1) {
    throw new Error("bundled assets are not supported");
  }
}

export function assertAssetsIsNotErc20AndErc20(
  makerAsset: Asset,
  takerAsset: Asset
): void {
  if (makerAsset.type === "ERC20" && takerAsset.type === "ERC20") {
    throw new Error("ERC20 <-> ERC20 is not supported");
  }
}

export function assertAssetsIsNotErc721Erc1155AndErc721Erc115(
  makerAsset: Asset,
  takerAsset: Asset
): void {
  if (
    (makerAsset.type === "ERC721" || makerAsset.type === "ERC1155") &&
    (takerAsset.type === "ERC721" || takerAsset.type === "ERC1155")
  ) {
    throw new Error("ERC712/ERC1155 <-> ERC712/ERC1155 is not supported");
  }
}
