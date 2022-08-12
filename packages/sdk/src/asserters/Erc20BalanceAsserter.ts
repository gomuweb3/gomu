import { Contract } from "@ethersproject/contracts";
import { BaseProvider } from "@ethersproject/providers";

import { Erc20Asset } from "../types";

export class Erc20BalanceAsserter {
  private readonly abi = [
    "function balanceOf(address owner) view returns (uint256)",
  ];

  private readonly provider: BaseProvider;

  constructor(provider: BaseProvider) {
    this.provider = provider;
  }

  async assertBalance(
    address: string,
    { contractAddress, type, amount }: Erc20Asset
  ): Promise<void> {
    let balance;
    try {
      const contract = new Contract(contractAddress, this.abi, this.provider);
      balance = await contract.balanceOf(address);
    } catch (e) {
      throw new Error(
        `contractAddress: ${contractAddress} does not exist or is not a ${type} token`
      );
    }

    if (balance.lt(amount)) {
      throw new Error(
        `insufficient balance for contractAddress: ${contractAddress}`
      );
    }
  }
}
