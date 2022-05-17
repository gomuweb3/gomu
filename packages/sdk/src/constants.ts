import { SupportedTokenType, OpenseaSupportedNetwork } from './types';

export const SUPPORTED_TOKEN_TYPES: SupportedTokenType[] = [
  'ERC20',
  'ERC721',
  'ERC1155',
];

export const WETH_ADDRESSES: Record<OpenseaSupportedNetwork, string> = {
  'main': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  'rinkeby': '0xc778417e063141139fce010982780140aa0cd5ab',
};

export const ETH_DECIMALS = 18;
