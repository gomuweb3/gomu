# Gomu SDK
Create Web 3 experiences easily with Gomu SDK.

## Installation

Install with npm:
```bash
npm install @gomuweb3/sdk
```

Install with yarn:
```bash
yarn add @gomuweb3/sdk
```

## Getting Started

### Initialization

Initialization with metamask (wallet accounts must be connected first) and ethers:

```JavaScript
import { Web3Provider } from '@ethersproject/providers';
import { Gomu } from '@gomuweb3/sdk';
// OR
const { Gomu } = require('@gomuweb3/gomu'); // commonjs

const provider = new Web3Provider(window.ethereum);

const gomuSdk = new Gomu({
  provider,
  signer: provider.getSigner(),
  address: '<ACCOUNT_ADDRESS>',
  chainId: 1, // defaults to 1
  openseaConfig: { apiKey: '<API_KEY>' },
});
```

NodeJS example with Ropsten network:

```bash
npm install @gomuweb3/sdk ethers @truffle/hdwallet-provider
```

```Javascript
import { Web3Provider } from '@ethersproject/providers';
import { Wallet } from '@ethersproject/wallet';
import HDWalletProvider from '@truffle/hdwallet-provider';
import { Gomu } from '@gomuweb3/sdk';

const networkUrl = '<ALCHEMY_OR_INFURA_URL>';
const mnemonic = '<WALLET_MNEMONIC>';

const provider = new HDWalletProvider({
  mnemonic,
  networkUrl,
});

const wallet = Wallet.fromMnemonic(mnemonic);

const gomuSdk = new Gomu({
  provider: new Web3Provider(provider),
  signer: wallet,
  address: wallet.address,
  chainId: 3, // ropsten
});
```

React hook example that re-initializes sdk on chainId/address change:

```JavaScript
import { useMemo } from 'react';
import { Web3Provider } from '@ethersproject/providers';
import { Gomu } from '@gomuweb3/sdk';

const useGomuSdk = (chainId, address) => {
  return useMemo(() => {
    const provider = new Web3Provider(window.ethereum);

    return new Gomu({
      provider,
      signer: provider.getSigner(),
      address,
      chainId,
      openseaConfig: { apiKey: process.env.REACT_APP_OPENSEA_KEY },
    });
  }, [chainId, address]);
};
```

Please note that some node-native sub-dependencies aren't polyfilled in Webpack 5, so consider using other versions of Webpack. If you are using `create-react-app`, then downgrading `react-script` to version 4 might help.

### Usage

Creating sell orders for asset on opensea and traderxyz in WETH on mainnet:

```JavaScript
const YOUR_ASSET = {
  contractAddress: '<ASSET_CONTRACT_ADDRESS>',
  tokenId: '<TOKEN_ID>',
  type: 'ERC721', // or ERC1155
};

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'; // WETH ERC20 Contract Address
const amount = 12000000000000000000n; // 12 WETH in BigInt
// OR
const amount = BigInt('12000000000000000000');

gomuSdk.makeSellOrder({
  assets: [YOUR_ASSET],
  erc20Asset: {
    contractAddress: WETH_ADDRESS
    amount,
  },
}).then(console.log); // Order[]

// alternative with makeOrder method

gomuSdk.makeOrder({
  makerAssets: [YOUR_ASSET],
  takerAssets: [{
    contractAddress: WETH_ADDRESS,
    amount,
    type: 'ERC20',
  }],
}).then(console.log); // Order[]
```

Creating buy orders in WETH on mainnet:

```JavaScript
const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'; // WETH ERC20 Contract Address
const amount = 33000000000000000000n; // 33 WETH in BigInt

const TARGET_ASSET = {
  contractAddress: '<ASSET_CONTRACT_ADDRESS>',
  tokenId: '<TOKEN_ID>',
  type: 'ERC721', // or ERC1155
};

gomuSdk.makeBuyOrder({
  assets: [TARGET_ASSET],
  erc20Asset: {
    contractAddress: WETH_ADDRESS,
    amount,
  },
}).then(console.log); // Order[]

// alternative with makeOrder method

gomuSdk.makeOrder({
  makerAssets: [{
    contractAddress: WETH_ADDRESS,
    amount,
    type: 'ERC20',
  }],
  takerAssets: [TARGET_ASSET],
}).then(console.log); // Order[]
```

Get orders where you are maker, and cancel first one:

```JavaScript
const getOrdersThenCancelFirstOne = async() {
  const { orders } = await gomuSdk.getOrders({
    maker: '<YOUR_ACCOUNT_ADDRESS>',
  });
  const cancelledResponse = await gomuSdk.cancelOrder(orders[0]);
};
```

Get orders for specific asset for sale and take first order. Do note, when implementing this, orders are not sorted by value, so you probably want to sort for higher values:

```JavaScript
const getOrdersThenTakeFirstOne = async() {
  const { orders } = await gomuSdk.getOrders({
    makerAsset: {
      contractAddress: '<ASSET_CONTRACT_ADDRESS>',
      tokenId: '<TOKEN_ID>',
      type: 'ERC721',
    },
  });
  const takenOrderResponse = await gomuSdk.takeOrder(orders[0]);
};
```
