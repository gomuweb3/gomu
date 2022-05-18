import { SignedOrder, SignedNftOrderV4, SwappableAsset, SwappableAssetV4, SignedNftOrderV4Serialized } from '@traderxyz/nft-swap-sdk';
import { OpenSeaAsset, Order as OpenseaOrder } from 'opensea-js/lib/types';

export type { SwappableAsset, SwappableAssetV4, OpenSeaAsset, OpenseaOrder };

export type SupportedTokenType = 'ERC20' | 'ERC721' | 'ERC1155';

export type SupportedPlatformType = 'opensea' | 'traderxyz';

export type OpenseaSupportedNetwork = 'main' | 'rinkeby';

export type OrderSideType = 'buy' | 'sell';

export type NftType = 'ERC721' | 'ERC1155';

export interface TradableAsset {
  tokenAddress: string;
  tokenId: string;
  type: NftType;
}

export interface WrappedOrder {
  id?: number;
  created_at?: string;
  isV4: boolean;
  makerAddress: string;
  takerAddress: string;
  signedOrder: SignedOrder | SignedNftOrderV4;
  isFilled?: boolean;
  isRejected?: boolean;
}

export interface TraderxyzOrder { // REQUIRES SYNC WITH SearchOrdersResponsePayload
  erc20Token: string;
  erc20TokenAmount: string;
  nftToken: string;
  nftTokenId: string;
  nftTokenAmount: string;
  nftType: NftType;
  sellOrBuyNft: 'buy' | 'sell';
  chainId: string;
  order: SignedNftOrderV4Serialized;
  metadata: Record<string, string> | null;
}

export type PlatformOrderData = OpenseaOrder | TraderxyzOrder;

export interface PlatformOrder {
  platform: SupportedPlatformType;
  order: PlatformOrderData;
}

export interface ERC20TokenInfo {
  address: string;
  decimals: number;
  name: string;
  symbol: string;
}

export interface CreateOrderOptions {
  assets: TradableAsset[];
  priceInBaseUnits: string;
  paymentTokenAddress?: string;
  expirationTime?: number;
  ERC20TokenInfo?: ERC20TokenInfo;
  orderSide: OrderSideType;
}

export type CreateOrderOptionsUserFacing = Omit<CreateOrderOptions, 'ERC20Token' | 'assets' | 'orderSide'> & { asset: TradableAsset }

export interface GetAssetOrdersOptions {
  asset: TradableAsset;
  orderSide?: OrderSideType;
}

export interface PlatformInterface<Order, TakeOrderRes, CancelOrderRes> {
  createOrder(options: CreateOrderOptions): Promise<Order | null>;
  getAssetOrders(options: GetAssetOrdersOptions): Promise<Order[]>;
  fulfillOrder(order: Order): Promise<TakeOrderRes>;
  cancelOrder(order: Order): Promise<CancelOrderRes>;
}

export type GetAssetOrdersResponse = Partial<Record<SupportedPlatformType, PlatformOrder[]>>;

export interface CustomProvidersConfig {
  provider: any;
  signer: any;
  hdWallet: any;
}
