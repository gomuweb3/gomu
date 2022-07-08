import {
  signMakerOrder,
  addressesByNetwork,
  SupportedChainId,
} from "@looksrare/sdk";
import fetch from "isomorphic-unfetch";

import {
  erc721Asset,
  erc1155Asset,
  erc20Asset,
  nftAssetPermutations,
} from "../test/mocks";

import {
  LooksRare,
  Status,
  LooksRareOriginalOrder,
  normalizeOrder,
} from "./LooksRare";

const apiKey: string = "<API_KEY>";
const address: string = "0xADDRESS";
const chainId: number = 1;
const signer: any = "<SIGNER>";
const mockOrderSignature: string = "<SIGNATURE>";
const mockNonce = "1";

const supportedChainIds = [1, 4];
const exampleUnsupportedChainIds = [2, 3];

const DAY = 60 * 60 * 24;
const DEFAULT_EXPIRATION_TIMEOUT = 30 * DAY;
const CUSTOM_EXPIRATION_TIMEOUT_MS = 69 * DAY * 1000;

const DEFAULT_MIN_PERCENTAGE_TO_ASK = 8500;

const DEFAULT_PARAMS_HEX = "0x";

const API_ORIGIN: Record<SupportedChainId, string> = {
  [SupportedChainId.HARDHAT]: "http://localhost",
  [SupportedChainId.MAINNET]: "https://api.looksrare.org",
  [SupportedChainId.RINKEBY]: "https://api-rinkeby.looksrare.org",
};

jest.mock("@looksrare/sdk");

const mockedSignMakerOrder = signMakerOrder as unknown as jest.MockedFunction<
  typeof signMakerOrder
>;

mockedSignMakerOrder.mockImplementation(() =>
  Promise.resolve(mockOrderSignature)
);

const mockContractCallReceipt = "<CONTRACT_CALL_RECEIPT>";
const mockMatchBidWithTakerAsk = jest
  .fn()
  .mockResolvedValue(mockContractCallReceipt);
const mockMatchAskWithTakerBid = jest
  .fn()
  .mockResolvedValue(mockContractCallReceipt);
const mockCancelMultipleMakerOrders = jest
  .fn()
  .mockResolvedValue(mockContractCallReceipt);

jest.mock("@ethersproject/contracts", () => {
  // Works and lets you check for constructor calls:
  return {
    Contract: jest.fn().mockImplementation(() => {
      return {
        matchBidWithTakerAsk: mockMatchBidWithTakerAsk,
        matchAskWithTakerBid: mockMatchAskWithTakerBid,
        cancelMultipleMakerOrders: mockCancelMultipleMakerOrders,
      };
    }),
  };
});

jest.mock("isomorphic-unfetch");

describe("LooksRare SDK", () => {
  let looksrare: LooksRare;

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe("instantiation", () => {
    function initLooksRareSDK(chainId: number): LooksRare {
      return new LooksRare({ apiKey, address, chainId, signer });
    }

    for (const chainId of supportedChainIds) {
      it(`should accept supported chain ID of ${chainId}`, () => {
        expect(initLooksRareSDK(chainId)).toBeInstanceOf(LooksRare);
      });
    }

    for (const chainId of exampleUnsupportedChainIds) {
      it(`should reject unsupported chain ID of ${chainId}`, () => {
        expect(() => initLooksRareSDK(chainId)).toThrow();
      });
    }
  });

  describe("supportedChainId static function", () => {
    for (const chainId of supportedChainIds) {
      it(`should return true for chain ID of ${chainId}`, () => {
        expect(LooksRare.supportsChainId(chainId)).toBeTruthy();
      });
    }

    for (const chainId of exampleUnsupportedChainIds) {
      it(`should return false for unsupported chain ID of ${chainId}`, () => {
        expect(LooksRare.supportsChainId(chainId)).toBeFalsy();
      });
    }
  });

  describe("makeOrder", () => {
    describe("failure", () => {
      beforeEach(() => {
        looksrare = new LooksRare({ apiKey, address, chainId, signer });
      });

      it("should reject with taker specified because we are not yet supporting it", async () => {
        await expect(
          looksrare.makeOrder({
            makerAssets: [erc721Asset],
            takerAssets: [erc20Asset],
            taker: "12345",
          })
        ).rejects.toEqual(Error("targeted taker unsupported in looksrare"));
      });

      it("should reject if maker assets is empty", async () => {
        await expect(
          looksrare.makeOrder({
            makerAssets: [],
            takerAssets: [erc20Asset],
          })
        ).rejects.toEqual(Error("maker assets cannot be empty"));
      });

      it("should reject if taker assets is empty", async () => {
        await expect(
          looksrare.makeOrder({
            makerAssets: [erc721Asset],
            takerAssets: [],
          })
        ).rejects.toEqual(Error("taker assets cannot be empty"));
      });

      it("should reject if there are more than one maker asset", async () => {
        await expect(
          looksrare.makeOrder({
            makerAssets: [erc721Asset, erc1155Asset],
            takerAssets: [erc20Asset],
          })
        ).rejects.toEqual(Error("bundled assets are not supported"));
      });

      it(`should reject if there are more than one taker asset`, async () => {
        await expect(
          looksrare.makeOrder({
            makerAssets: [erc721Asset],
            takerAssets: [erc20Asset, erc20Asset],
          })
        ).rejects.toEqual(Error("bundled assets are not supported"));
      });

      for (const [makerAsset, takerAsset] of nftAssetPermutations) {
        it(`should reject if both assets are NFTs (maker: ${makerAsset.type}, taker: ${takerAsset.type})`, async () => {
          await expect(
            looksrare.makeOrder({
              makerAssets: [makerAsset],
              takerAssets: [takerAsset],
            })
          ).rejects.toEqual(
            Error("ERC721/ERC1155 <-> ERC721/ERC1155 is not supported")
          );
        });
      }

      it("should reject if invalid assets are passed in", async () => {
        await expect(
          looksrare.makeOrder({
            /** @ts-ignore */
            makerAssets: [{}],
            /** @ts-ignore */
            takerAssets: [{}],
          })
        ).rejects.toEqual(Error("unsupported operation"));
      });
    });

    describe.each(supportedChainIds)("success", (chainId) => {
      const successfulOrderScenarios = [
        {
          message:
            "should create order with erc721 maker asset and erc20 taker asset",
          args: {
            makerAssets: [erc721Asset],
            takerAssets: [erc20Asset],
          },
          expectedPayload: {
            isOrderAsk: true,
            baseAsset: erc721Asset,
            quoteAsset: erc20Asset,
          },
        },
        {
          message:
            "should create order with erc1155 maker asset and erc20 taker asset",
          args: {
            makerAssets: [erc1155Asset],
            takerAssets: [erc20Asset],
          },
          expectedPayload: {
            isOrderAsk: true,
            baseAsset: erc1155Asset,
            quoteAsset: erc20Asset,
          },
        },
        {
          message:
            "should create order with erc20 maker asset and erc721 taker asset",
          args: {
            makerAssets: [erc20Asset],
            takerAssets: [erc721Asset],
          },
          expectedPayload: {
            isOrderAsk: false,
            baseAsset: erc721Asset,
            quoteAsset: erc20Asset,
          },
        },
        {
          message:
            "should create order with erc20 maker asset and erc1155 taker asset",
          args: {
            makerAssets: [erc20Asset],
            takerAssets: [erc1155Asset],
          },
          expectedPayload: {
            isOrderAsk: false,
            baseAsset: erc1155Asset,
            quoteAsset: erc20Asset,
          },
        },
        {
          message: "should create order with custon expiration date",
          args: {
            makerAssets: [erc721Asset],
            takerAssets: [erc20Asset],
            expirationTime: new Date(Date.now() + CUSTOM_EXPIRATION_TIMEOUT_MS),
          },
          expectedPayload: {
            isOrderAsk: true,
            baseAsset: erc721Asset,
            quoteAsset: erc20Asset,
            endTime: Math.round(
              (Date.now() + CUSTOM_EXPIRATION_TIMEOUT_MS) / 1000
            ),
          },
        },
      ];

      describe.each(successfulOrderScenarios)(
        `chain ${chainId}`,
        (scenario) => {
          let mockedFetchOrder: jest.SpyInstance;
          let mockedGetNonce: jest.SpyInstance;
          let mockedPostOrder: jest.SpyInstance;

          beforeEach(() => {
            looksrare = new LooksRare({ apiKey, address, chainId, signer });

            mockedFetchOrder = jest
              .spyOn(LooksRare.prototype as any, "fetchOrders")
              .mockImplementation();

            mockedGetNonce = jest
              .spyOn(LooksRare.prototype as any, "getNonce")
              .mockReturnValue(mockNonce);
          });

          afterEach(() => {
            mockedFetchOrder.mockRestore();
            mockedGetNonce.mockRestore();
            mockedPostOrder.mockRestore();
          });

          it(`${scenario.message}`, async () => {
            const { args, expectedPayload } = scenario;
            const contractAddresses = addressesByNetwork[chainId];

            const expectedStartTime = Math.floor(Date.now() / 1000);
            const expectedEndTime =
              expectedPayload.endTime ||
              expectedStartTime + DEFAULT_EXPIRATION_TIMEOUT;

            const expectedMakeOrderPayload = {
              isOrderAsk: expectedPayload.isOrderAsk,
              signer: address,
              collection: expectedPayload.baseAsset.contractAddress,
              tokenId: expectedPayload.baseAsset.tokenId,
              amount: "1",
              price: expectedPayload.quoteAsset.amount.toString(),
              currency: expectedPayload.quoteAsset.contractAddress,
              strategy: contractAddresses.STRATEGY_STANDARD_SALE,
              nonce: mockNonce,
              startTime: expectedStartTime.toString(),
              endTime: expectedEndTime.toString(),
              minPercentageToAsk: DEFAULT_MIN_PERCENTAGE_TO_ASK,
              params: [],
            };

            const mockPostOrderResult = {
              currencyAddress: expectedMakeOrderPayload.currency,
              collectionAddress: expectedMakeOrderPayload.collection,
              tokenId: expectedMakeOrderPayload.tokenId,
              price: expectedMakeOrderPayload.price,
              amount: expectedMakeOrderPayload.amount,
            } as LooksRareOriginalOrder;

            mockedPostOrder = jest
              .spyOn(LooksRare.prototype as any, "postOrder")
              .mockReturnValue(mockPostOrderResult);

            const normalizedOrder = normalizeOrder(mockPostOrderResult);

            await expect(looksrare.makeOrder(args)).resolves.toEqual(
              normalizedOrder
            );

            expect(mockedSignMakerOrder).toHaveBeenCalledWith(
              signer,
              chainId,
              expectedMakeOrderPayload
            );

            expect(mockedPostOrder).toHaveBeenCalledWith({
              ...expectedMakeOrderPayload,
              signature: mockOrderSignature,
            });
          });
        }
      );
    });
  });

  describe.each(supportedChainIds)("takeOrder", (chainId) => {
    const contractAddresses = addressesByNetwork[chainId];
    const makerOrderAddress = "<MAKER_ORDER_ADDRESS>";

    const scenarios = [
      {
        args: {
          isOrderAsk: true,
        },
        calledMethod: mockMatchAskWithTakerBid,
      },
      {
        args: {
          isOrderAsk: false,
        },
        calledMethod: mockMatchBidWithTakerAsk,
      },
      {
        args: {
          isOrderAsk: true,
          params: "0x12345",
        },
        calledMethod: mockMatchAskWithTakerBid,
      },
      {
        args: {
          isOrderAsk: false,
          params: "0x12345",
        },
        calledMethod: mockMatchBidWithTakerAsk,
      },
    ];

    describe.each(scenarios)(`chain ${chainId}`, (scenario) => {
      const { isOrderAsk } = scenario.args;

      beforeEach(() => {
        looksrare = new LooksRare({ apiKey, address, chainId, signer });
      });

      it(`should send the correct taker order to relevant smart contract when isOrderAsk is ${isOrderAsk}`, async () => {
        const mockMakerOrder = {
          isOrderAsk,
          hash: "<ORDER_HASH>",
          collectionAddress: erc721Asset.contractAddress,
          tokenId: erc721Asset.tokenId,
          signer: makerOrderAddress,
          strategy: contractAddresses.STRATEGY_STANDARD_SALE,
          currencyAddress: erc20Asset.contractAddress,
          amount: erc20Asset.amount.toString(),
          price: "1000000000000000",
          nonce: "1",
          startTime: Date.now(),
          endTime: Math.floor(Date.now() / 1000) + DEFAULT_EXPIRATION_TIMEOUT,
          minPercentageToAsk: 8500,
          params: scenario.args.params || DEFAULT_PARAMS_HEX,
          status: Status.VALID,
          signature: mockOrderSignature,
          v: 1,
          r: "<R_VALUE>",
          s: "<S_VALUD>",
        };

        const expectedTakerOrder = {
          isOrderAsk: !mockMakerOrder.isOrderAsk,
          taker: address,
          price: mockMakerOrder.price,
          minPercentageToAsk: DEFAULT_MIN_PERCENTAGE_TO_ASK,
          tokenId: mockMakerOrder.tokenId,
          params: mockMakerOrder.params || DEFAULT_PARAMS_HEX,
        };

        const expectedMakerOrder = {
          ...mockMakerOrder,
          collection: mockMakerOrder.collectionAddress,
          currency: mockMakerOrder.currencyAddress,
          params: mockMakerOrder.params || DEFAULT_PARAMS_HEX,
        };

        await expect(
          looksrare.takeOrder(normalizeOrder(mockMakerOrder))
        ).resolves.toBe(mockContractCallReceipt);

        expect(scenario.calledMethod).toBeCalledWith(
          expectedTakerOrder,
          expectedMakerOrder
        );
      });
    });
  });

  describe("getOrders", () => {
    describe("failure", () => {
      beforeEach(() => {
        looksrare = new LooksRare({ apiKey, address, chainId, signer });
      });

      it("should reject if invalid assets are passed in", async () => {
        await expect(
          looksrare.getOrders({
            /** @ts-ignore */
            makerAsset: [{}],
            /** @ts-ignore */
            takerAsset: [{}],
          })
        ).rejects.toEqual(Error("unsupported operation"));
      });

      it("should return empty result if taker is specified because LooksRare API does not have a filter for it", async () => {
        await expect(
          looksrare.getOrders({
            taker: "<TAKER>",
          })
        ).resolves.toEqual([]);
      });
    });

    describe.each(supportedChainIds)("success", (chainId) => {
      beforeEach(() => {
        looksrare = new LooksRare({ apiKey, address, chainId, signer });
      });

      const apiOrigin = API_ORIGIN[chainId];
      const successScenarios = [
        {
          message:
            "should get all valid orders when maker and taker assets are undefined",
          args: {
            makerAsset: undefined,
            takerAsset: undefined,
          },
          expectedQueryParams: ["sort=NEWEST", "status[]=VALID"],
        },
        {
          message:
            "should get valid orders filtered by maker address when maker is specified",
          args: {
            makerAsset: undefined,
            takerAsset: undefined,
            maker: address,
          },
          expectedQueryParams: [
            "sort=NEWEST",
            "status[]=VALID",
            `signer=${address}`,
          ],
        },
        {
          message:
            "should get valid ask orders filtered by erc721 maker and erc20 taker assets when specified",
          args: {
            makerAsset: erc721Asset,
            takerAsset: erc20Asset,
          },
          expectedQueryParams: [
            "sort=NEWEST",
            "status[]=VALID",
            "isOrderAsk=true",
            `collection=${erc721Asset.contractAddress}`,
            `tokenId=${erc721Asset.tokenId}`,
            `currency=${erc20Asset.contractAddress}`,
            `price[min]=${erc20Asset.amount}`,
            `price[max]=${erc20Asset.amount}`,
          ],
        },
        {
          message:
            "should get valid ask orders filtered by erc1155 maker and erc20 taker assets when specified",
          args: {
            makerAsset: erc1155Asset,
            takerAsset: erc20Asset,
          },
          expectedQueryParams: [
            "sort=NEWEST",
            "status[]=VALID",
            "isOrderAsk=true",
            `collection=${erc1155Asset.contractAddress}`,
            `tokenId=${erc1155Asset.tokenId}`,
            `currency=${erc20Asset.contractAddress}`,
            `price[min]=${erc20Asset.amount}`,
            `price[max]=${erc20Asset.amount}`,
          ],
        },
        {
          message:
            "should get valid bid orders filtered by erc20 maker and erc1155 taker assets when specified",
          args: {
            makerAsset: erc20Asset,
            takerAsset: erc721Asset,
          },
          expectedQueryParams: [
            "sort=NEWEST",
            "status[]=VALID",
            "isOrderAsk=false",
            `collection=${erc721Asset.contractAddress}`,
            `tokenId=${erc721Asset.tokenId}`,
            `currency=${erc20Asset.contractAddress}`,
            `price[min]=${erc20Asset.amount}`,
            `price[max]=${erc20Asset.amount}`,
          ],
        },
        {
          message:
            "should get valid bid orders filtered by erc20 maker and erc721 taker assets when specified",
          args: {
            makerAsset: erc20Asset,
            takerAsset: erc1155Asset,
          },
          expectedQueryParams: [
            "sort=NEWEST",
            "status[]=VALID",
            "isOrderAsk=false",
            `collection=${erc1155Asset.contractAddress}`,
            `tokenId=${erc1155Asset.tokenId}`,
            `currency=${erc20Asset.contractAddress}`,
            `price[min]=${erc20Asset.amount}`,
            `price[max]=${erc20Asset.amount}`,
          ],
        },
        {
          message:
            "should get valid ask orders filtered by erc721 maker and erc20 taker assets and maker address when specified",
          args: {
            makerAsset: erc721Asset,
            takerAsset: erc20Asset,
            maker: address,
          },
          expectedQueryParams: [
            "sort=NEWEST",
            "status[]=VALID",
            `signer=${address}`,
            "isOrderAsk=true",
            `collection=${erc721Asset.contractAddress}`,
            `tokenId=${erc721Asset.tokenId}`,
            `currency=${erc20Asset.contractAddress}`,
            `price[min]=${erc20Asset.amount}`,
            `price[max]=${erc20Asset.amount}`,
          ],
        },
      ];

      describe.each(successScenarios)(`chain ${chainId}`, (scenario) => {
        const fetchData = [];
        const fetchResult = {
          success: true,
          data: fetchData,
        };

        beforeEach(() => {
          mockAPIFetchResponse(fetchResult);
        });

        it(`${scenario.message}`, async () => {
          await expect(looksrare.getOrders(scenario.args)).resolves.toEqual(
            fetchData
          );

          const queryParams = encodeURI(scenario.expectedQueryParams.join("&"));
          expect(fetch).toBeCalledWith(
            `${apiOrigin}/api/v1/orders?${queryParams}`
          );
        });
      });
    });
  });

  describe.each(supportedChainIds)("cancelOrder", (chainId) => {
    describe(`chain ${chainId}`, () => {
      beforeEach(() => {
        looksrare = new LooksRare({ apiKey, address, chainId, signer });
      });

      it("should call exchange contract's cancelMultipleMakerOrders method with order nonces", async () => {
        const order = normalizeOrder({
          currencyAddress: "<currecncy_address>",
          collectionAddress: "<currecncy_address>",
          tokenId: "<token_id>",
          price: "1000",
          amount: "1",
          nonce: mockNonce,
        } as LooksRareOriginalOrder);
        /** @ts-ignore */
        await expect(looksrare.cancelOrder(order)).resolves.toBe(
          mockContractCallReceipt
        );
        expect(mockCancelMultipleMakerOrders).toBeCalledWith([mockNonce]);
      });
    });
  });

  /**
   * ******************************************
   * PRIVATE METHODS
   * ******************************************
   */

  describe("private methods", () => {
    describe.each(supportedChainIds)("getNonce", (chainId) => {
      const fetchData = "<FETCH_DATA>";
      const fetchResult = {
        success: true,
        data: fetchData,
      };

      beforeEach(() => {
        mockAPIFetchResponse(fetchResult);
      });

      describe(`chain ${chainId}`, () => {
        const apiOrigin = API_ORIGIN[chainId];
        const apiUrl = `${apiOrigin}/api/v1/orders/nonce`;

        it(`should make a request to ${apiOrigin} to retrive a nonce`, async () => {
          looksrare = new LooksRare({ apiKey, address, chainId, signer });

          /** @ts-ignore */
          await expect(looksrare.getNonce(address)).resolves.toBe(fetchData);
          expect(fetch).toBeCalledWith(`${apiUrl}?address=${address}`);
        });
      });
    });

    describe.each(supportedChainIds)("postOrder", (chainId) => {
      const mockPayload = { 1: 1, a: "a" };
      const mockPayloadSerialized = JSON.stringify(mockPayload);

      const fetchData = "<FETCH_DATA>";
      const fetchResult = {
        success: true,
        data: fetchData,
      };

      beforeEach(() => {
        mockAPIFetchResponse(fetchResult);
      });

      describe(`chain ${chainId}`, () => {
        const apiOrigin = API_ORIGIN[chainId];
        const apiUrl = `${apiOrigin}/api/v1/orders`;

        it(`should serialize payload and post to ${apiOrigin} without api key if it is missing and return the results`, async () => {
          looksrare = new LooksRare({ address, chainId, signer });

          /** @ts-ignore */
          await expect(looksrare.postOrder(mockPayload)).resolves.toBe(
            fetchData
          );
          expect(fetch).toBeCalledWith(apiUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: mockPayloadSerialized,
          });
        });

        it(`should serialize payload and post to ${apiOrigin} with api key header and return the results`, async () => {
          looksrare = new LooksRare({ apiKey, address, chainId, signer });

          /** @ts-ignore */
          await expect(looksrare.postOrder(mockPayload)).resolves.toBe(
            fetchData
          );
          expect(fetch).toBeCalledWith(apiUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "X-Looks-Api-Key": apiKey,
            },
            body: mockPayloadSerialized,
          });
        });
      });
    });

    describe("parseApiResponse", () => {
      beforeEach(() => {
        looksrare = new LooksRare({ apiKey, address, chainId, signer });
      });

      it("should return error message if response is unsuccessful", async () => {
        const errorMessage = "Oh no I errored out!";
        const mockApiResponseObj = {
          success: false,
          message: errorMessage,
        };
        const mockApiResponse = {
          json(): typeof mockApiResponseObj {
            return mockApiResponseObj;
          },
        };

        await expect(
          /** @ts-ignore */
          looksrare.parseApiResponse(mockApiResponse)
        ).rejects.toEqual(Error(errorMessage));
      });

      it("should return error message if data is missing", async () => {
        const mockApiResponseObj = {
          success: true,
          data: undefined,
        };
        const mockApiResponse = {
          json(): typeof mockApiResponseObj {
            return mockApiResponseObj;
          },
        };

        await expect(
          /** @ts-ignore */
          looksrare.parseApiResponse(mockApiResponse)
        ).rejects.toEqual(Error("missing data"));
      });
    });
  });
});

function mockAPIFetchResponse(fetchResult: {
  success: boolean;
  data?: unknown;
  message?: string;
}): void {
  (fetch as unknown as jest.MockedFunction<any>).mockResolvedValue({
    json() {
      return Promise.resolve(fetchResult);
    },
  });
}
