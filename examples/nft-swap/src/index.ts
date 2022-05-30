import { Web3Provider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { Gomu, Asset } from "@gomuweb3/sdk";
import HDWalletProvider from "@truffle/hdwallet-provider";

async function main(): Promise<void> {
  const chainId = 3; // Ropsten
  const url = "<ALCHEMY_OR_INFURA_URL>";

  // Instantiate Gomu for maker using mnemonics
  const mnemonic = "<MAKER_MNEMONIC>";
  const makerProvider = new HDWalletProvider({
    mnemonic,
    url,
  });
  const makerWallet = Wallet.fromMnemonic(mnemonic);
  const makerGomu = new Gomu({
    provider: new Web3Provider(makerProvider),
    signer: makerWallet,
    address: makerWallet.address,
    chainId,
  });

  // Instantiate Gomu for taker using private key
  const privateKey = "<TAKER_PRIVATE_KEY>";
  const takerProvider = new HDWalletProvider({
    privateKeys: [privateKey],
    url,
  });
  const takerWallet = new Wallet(privateKey);
  const takerGomu = new Gomu({
    provider: new Web3Provider(takerProvider),
    signer: takerWallet,
    address: takerWallet.address,
    chainId,
  });

  // Prepare the assets
  const nftAsset: Asset = {
    contractAddress: "<NFT_TOKEN_ADDRESS>",
    tokenId: "<NFT_TOKEN_ID>",
    type: "ERC721",
  };
  const erc20Asset: Asset = {
    contractAddress: "<ERC20_TOKEN_ADDRESS>",
    type: "ERC20",
    amount: 100000000000000n, // 0.0001
  };

  // Make an order, across multiple marketplaces.
  const order1 = await makerGomu.makeOrder({
    makerAssets: [nftAsset],
    takerAssets: [erc20Asset],
  });
  console.log("successfully made order:", order1);

  const { orders: orders1 } = await makerGomu.getOrders({
    maker: makerWallet.address,
  });
  console.log("retrieved orders:", orders1);

  // Oops, we forgot to specify the taker address and expiration time. Let's cancel them.
  for (const order of orders1) {
    const resp = await makerGomu.cancelOrder(order);
    console.log("successfully cancelled order:", order, "resp:", resp);
  }

  // Let's remake the order with the taker address and expiration time.
  const expirationTime: Date = new Date();
  expirationTime.setDate(expirationTime.getDate() + 1);

  const order2 = await makerGomu.makeOrder({
    makerAssets: [nftAsset],
    takerAssets: [erc20Asset],
    taker: takerWallet.address,
    expirationTime,
  });
  console.log("successfully made order:", order2);

  const { orders: orders2 } = await takerGomu.getOrders({
    maker: makerWallet.address,
    taker: takerWallet.address,
  });
  console.log("retrieved orders:", orders2);

  // Pick the first marketplace to take the order.
  const resp2 = await takerGomu.takeOrder(orders2[0]);
  console.log("successfully took order:", orders2[0], "resp:", resp2);
}

main();
