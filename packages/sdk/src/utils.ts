import { BigNumber } from 'bignumber.js';
import {
  SupportedPlatformType,
  PlatformOrderData,
  SwappableAssetV4,
} from './types';

interface CreateOrderResult {
  platform: SupportedPlatformType;
  result: PlatformOrderData | null;
}

export const transformCreateOrderResults = (results: CreateOrderResult[]) => {
  return results.reduce((acc, { platform, result }) => {
    if (!result) {
      return acc;
    }
    acc[platform] = result;

    return acc;
  }, {} as Partial<Record<SupportedPlatformType, PlatformOrderData>>);
};

export const getERC20Asset = ({
  priceInBaseUnits,
  tokenAddress,
}: {
  priceInBaseUnits: string;
  tokenAddress: string;
}) => {
  return {
    type: 'ERC20',
    amount: priceInBaseUnits,
    tokenAddress,
  } as SwappableAssetV4;
};

const makeBigNumber = (arg: number | string | BigNumber) => {
  if (arg === "0x") {
    arg = 0;
  }
  arg = arg.toString();
  return new BigNumber(arg);
};


export const toBaseUnitAmount = (value: number | string, decimals: number) => {
  const amount = makeBigNumber(value);
  const unit = new BigNumber(10).pow(decimals);
  const baseUnitAmount = amount.times(unit);
  const hasDecimals = baseUnitAmount.decimalPlaces() !== 0;
  if (hasDecimals) {
      throw new Error(`Invalid unit amount: ${amount.toString()} - Too many decimal places`);
  }
  return String(baseUnitAmount);
};

export const toUnitAmount = (value: number | string, decimals: number) => {
  const amount = makeBigNumber(value);
  const aUnit = new BigNumber(10).pow(decimals);
  const unit = amount.div(aUnit);
  return unit.toNumber();
};

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
