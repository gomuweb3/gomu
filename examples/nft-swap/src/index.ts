import { getDefaultProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import Gomu, { Asset } from "@gomu/sdk";

async function main(): Promise<void> {
  const chainId = 3; // Ropsten
  const network = "<ALCHEMY_OR_INFURA_URL>";
  const provider = getDefaultProvider(network);

  const makerMnemonic = "<MAKER_MNEMONIC>";
  const makerWallet = Wallet.fromMnemonic(makerMnemonic).connect(provider);

  const makerGomu = new Gomu(provider, {
    wallet: makerWallet,
    chainId,
  });

  const takerPrivateKey = "<TAKER_PRIVATE_KEY>";
  const takerWallet = new Wallet(takerPrivateKey, provider);

  const takerGomu = new Gomu(provider, {
    wallet: takerWallet,
    chainId,
  });

  const nftAsset: Asset = {
    tokenAddress: "<NFT_TOKEN_ADDRESS>",
    tokenId: "<NFT_TOKEN_ID>",
    type: "ERC721",
    amount: 1n,
  };
  const erc20Asset: Asset = {
    tokenAddress: "<ERC20_TOKEN_ADDRESS>",
    type: "ERC20",
    amount: 100000000000000n, // 0.0001
  };

  const order1 = await makerGomu.makeOrder(nftAsset, erc20Asset);
  console.log("successfully made order:", order1);

  const { orders: orders1 } = await makerGomu.getOrders({
    maker: makerWallet.address,
  });
  console.log("retrieved orders:", orders1);

  const resp1 = await makerGomu.cancelOrder(orders1[0]);
  console.log("successfully cancelled order:", orders1[0], "resp:", resp1);

  const order2 = await makerGomu.makeOrder(nftAsset, erc20Asset, {
    taker: takerWallet.address,
  });
  console.log("successfully made order:", order2);

  const { orders: orders2 } = await takerGomu.getOrders({
    maker: makerWallet.address,
    taker: takerWallet.address,
  });
  console.log("retrieved orders:", orders2);

  const resp2 = await takerGomu.takeOrder(orders2[0]);
  console.log("successfully took order:", order2[0], "resp:", resp2);
}

main();
