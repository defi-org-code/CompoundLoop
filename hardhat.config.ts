import "@nomiclabs/hardhat-web3";
import "hardhat-typechain";
import "hardhat-gas-reporter";
import { HardhatUserConfig } from "hardhat/types";
import { task } from "hardhat/config";
import { coinmarketcapKey, ethAlchemyRpcUrl, ethChainId, ethInfuraRpcUrl } from "./src/consts";
import { printCurrentLiquidity, printClaimableComp, printHistoricalLiquidity } from "./src/balance";

task("status", "check status").setAction(async () => {
  await printClaimableComp();
  await printCurrentLiquidity();
  await printHistoricalLiquidity(12);
});

const config: HardhatUserConfig = {
  solidity: {
    version: "0.7.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      blockGasLimit: 12e6,
      forking: {
        url: ethAlchemyRpcUrl,
      },
    },
    eth: {
      chainId: ethChainId,
      url: ethInfuraRpcUrl,
      timeout: 60000,
      httpHeaders: {
        keepAlive: "true",
      },
    },
  },
  typechain: {
    outDir: "typechain-hardhat",
    target: "web3-v1",
  },
  mocha: {
    timeout: 240_000,
  },
  gasReporter: {
    currency: "USD",
    coinmarketcap: coinmarketcapKey,
    showTimeSpent: true,
  },
};
export default config;
