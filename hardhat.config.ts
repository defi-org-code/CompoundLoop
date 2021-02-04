import "@nomiclabs/hardhat-web3";
import "hardhat-typechain";
import "hardhat-gas-reporter";
import { HardhatRuntimeEnvironment, HardhatUserConfig } from "hardhat/types";
import { task } from "hardhat/config";
import { coinmarketkapKey, ethAlchemyRpcUrl, ethChainId, ethInfuraRpcUrl, unitrollerAddress } from "./src/consts";
import { getBalance } from "./src/balance";

task("status", "check status").setAction(async (_, hre: HardhatRuntimeEnvironment) => {
  const [owner] = await hre.web3.eth.getAccounts(); //TODO change to deployed contract address
  const b = await getBalance(hre.web3, owner);
  console.log(b);
});

interface RemoteContract {
  abi: any;
  address: string;
  name: string;
  bytecode?: string;
  bytecodeHash?: string;
  deployedBytecode?: string;
}
const remoteContracts: RemoteContract[] = [
  // {
  //   name: "Comptroller",
  //   address: unitrollerAddress,
  //   abi: require("./abi/ComptrollerAbi.json"),
  // },
];

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
        blockNumber: 11790000,
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
    coinmarketcap: coinmarketkapKey,
    showTimeSpent: true,
    remoteContracts,
  },
};
export default config;
