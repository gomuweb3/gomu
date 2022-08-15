import { Contract } from "@ethersproject/contracts";
import { BaseProvider } from "@ethersproject/providers";

import { Erc721Asset } from "../types";

export class Erc721BalanceAsserter {
  private readonly abi = [
    "function ownerOf(uint256 tokenId) view returns (address)",
  ];

  private readonly provider: BaseProvider;

  constructor(provider: BaseProvider) {
    this.provider = provider;
  }

  async assertBalance(
    address: string,
    { contractAddress, tokenId, type }: Erc721Asset
  ): Promise<void> {
    let owner;
    try {
      const contract = new Contract(contractAddress, this.abi, this.provider);
      owner = await contract.ownerOf(tokenId);
    } catch (e) {
      throw new Error(
        `contractAddress: ${contractAddress} does not exist or is not a ${type} token`
      );
    }

    if (owner !== address) {
      throw new Error(
        `insufficient balance for contractAddress: ${contractAddress}, tokenId: ${tokenId}`
      );
    }
  }
}
