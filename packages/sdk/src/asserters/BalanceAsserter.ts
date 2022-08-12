import { BaseProvider } from "@ethersproject/providers";

import { Asset } from "../types";

import { Erc1155BalanceAsserter } from "./Erc1155BalanceAsserter";
import { Erc20BalanceAsserter } from "./Erc20BalanceAsserter";
import { Erc721BalanceAsserter } from "./Erc721BalanceAsserter";

export class BalanceAsserter {
  private readonly asserters;

  constructor(provider: BaseProvider) {
    this.asserters = {
      ERC20: new Erc20BalanceAsserter(provider),
      ERC721: new Erc721BalanceAsserter(provider),
      ERC1155: new Erc1155BalanceAsserter(provider),
    };
  }

  async assertBalance(address: string, asset: Asset): Promise<void> {
    const { type } = asset;
    // @ts-ignore
    const asserter = this.asserters[type];
    if (!asserter) {
      throw new Error(`unknown asset type: ${type}`);
    }

    return asserter.assertBalance(address, asset);
  }
}
