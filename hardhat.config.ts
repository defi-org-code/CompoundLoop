import "@nomiclabs/hardhat-web3";
import "hardhat-typechain";
import "hardhat-gas-reporter";
import { HardhatUserConfig } from "hardhat/types";
import { task } from "hardhat/config";
import {
  binanceHotWallet,
  coinmarketcapKey,
  CONTRACT_ADDRESS,
  ethAlchemyRpcUrl,
  ethChainId,
  ethInfuraRpcUrl,
  OWNER,
  USDCAddress,
} from "./src/consts";
import { printCurrentLiquidity, printClaimableComp, printHistoricalLiquidity, compoundLoop } from "./src/balance";
import { erc20, eth, fmt, fmt1e6, fmt1e8, impersonate, to1e6 } from "./src/utils";

task("status", "check status").setAction(async () => {
  await printClaimableComp();
  await printCurrentLiquidity();
  await printHistoricalLiquidity(12);
});

task("addFunds", "fork and add funds").setAction(async () => {
  await impersonate(OWNER);
  await impersonate(binanceHotWallet);
  await erc20(USDCAddress).methods.transfer(CONTRACT_ADDRESS, to1e6(4_000_000)).send({ from: binanceHotWallet });

  const instance = compoundLoop();

  const startBalance = await instance.methods.underlyingBalance().call({ from: OWNER });
  const startCTokenBalance = await instance.methods.cTokenBalance().call({ from: OWNER });
  const startLiquidity = await instance.methods.getAccountLiquidityWithInterest().call({ from: OWNER });
  console.log("startBalance", fmt1e6(startBalance));
  console.log("startCTokenBalance", fmt1e8(startCTokenBalance));
  console.log("startLiquidity", fmt(startLiquidity.accountLiquidity));

  await instance.methods.enterPosition(to1e6(250_000), 94, 100).send({ from: OWNER });

  const endBalance = await instance.methods.underlyingBalance().call({ from: OWNER });
  const endCTokenBalance = await instance.methods.cTokenBalance().call({ from: OWNER });
  const endLiquidity = await instance.methods.getAccountLiquidityWithInterest().call({ from: OWNER });
  console.log("endBalance", fmt1e6(endBalance));
  console.log("endCTokenBalance", fmt1e8(endCTokenBalance));
  console.log("endLiquidity", fmt(endLiquidity.accountLiquidity));

  await instance.methods.exitPosition(100, 1, 1).send({ from: OWNER });
  console.log("exit");

  const endBalance2 = await instance.methods.underlyingBalance().call({ from: OWNER });
  const endCTokenBalance2 = await instance.methods.cTokenBalance().call({ from: OWNER });
  const endLiquidity2 = await instance.methods.getAccountLiquidityWithInterest().call({ from: OWNER });
  console.log("endBalance2", fmt1e6(endBalance2));
  console.log("endCTokenBalance2", fmt1e8(endCTokenBalance2));
  console.log("endLiquidity2", fmt(endLiquidity2.accountLiquidity));
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
