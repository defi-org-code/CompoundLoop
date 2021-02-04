import { HardhatRuntimeEnvironment, HardhatUserConfig } from "hardhat/types";
import "hardhat-typechain";
import "@nomiclabs/hardhat-web3";
import { task } from "hardhat/config";
import { ethAlchemyRpcUrl, ethChainId, ethInfuraRpcUrl } from "./src/consts";
import { getBalance } from "./src/balance";

task("status", "check status").setAction(async (_, hre: HardhatRuntimeEnvironment) => {
  const [owner] = await hre.web3.eth.getAccounts(); //TODO change to deployed contract address
  const b = await getBalance(hre.web3, owner);
  console.log(b);
});

const config: HardhatUserConfig = {
  solidity: "0.7.3",
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: ethAlchemyRpcUrl,
        blockNumber: 11786000,
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
    timeout: 60000,
  },
};
export default config;
