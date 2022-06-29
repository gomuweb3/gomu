import type { Erc20Asset, Erc721Asset, Erc1155Asset } from "../types";

const WETH_ADDRESS = "0xc778417E063141139Fce010982780140Aa0cD5Ab";
const NFT_CONTRACT_ADDRESS = "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb";
const NFT_TOKEN_ID = "8765";

export enum AssetType {
  ERC721 = "ERC721",
  ERC1155 = "ERC1155",
  ERC20 = "ERC20",
}

export const erc721Asset: Erc721Asset = {
  contractAddress: NFT_CONTRACT_ADDRESS,
  tokenId: NFT_TOKEN_ID,
  type: AssetType.ERC721,
} as const;

export const erc1155Asset: Erc1155Asset = {
  contractAddress: NFT_CONTRACT_ADDRESS,
  tokenId: NFT_TOKEN_ID,
  type: AssetType.ERC1155,
  /** @ts-ignore */
  amount: 1n,
} as const;

export const erc20Asset: Erc20Asset = {
  contractAddress: WETH_ADDRESS,
  /** @ts-ignore */
  amount: 10000000000000000n,
  type: AssetType.ERC20,
} as const;

export const nftAssetCombinations = [
  [erc1155Asset, erc1155Asset],
  [erc1155Asset, erc721Asset],
  [erc721Asset, erc721Asset],
];

export const nftAssetPermutations = [
  ...nftAssetCombinations,
  [erc721Asset, erc1155Asset],
];
