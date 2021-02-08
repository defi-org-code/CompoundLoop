import { IERC20 } from "../typechain-hardhat/IERC20";
import { CERC20 } from "../typechain-hardhat/CERC20";
import BN from "bn.js";

export function bn(n: number | string) {
  return hre().web3.utils.toBN(n);
}

export function eth(n: number | string) {
  return bn(n).muln(1e18);
}

export function to1e6(n: number | string) {
  return bn(n).muln(1e6);
}

export function fmt(bn: string | BN) {
  return hre().web3.utils.fromWei(bn, "ether");
}

export function hre() {
  return require("hardhat");
}

export function contract<T>(abi: any, address?: string) {
  return (new (hre().web3.eth.Contract)(abi, address) as any) as T;
}

export function erc20(address?: string) {
  const abi = hre().artifacts.readArtifactSync("IERC20").abi;
  return contract<IERC20>(abi, address);
}

export function cerc20(address?: string) {
  const abi = hre().artifacts.readArtifactSync("CERC20").abi;
  return contract<CERC20>(abi, address);
}

export async function compiledContract<T>(name: string, owner: string, ...args: any[]) {
  const artifact = hre().artifacts.readArtifactSync(name);
  const theContract = new (hre().web3.eth.Contract)(artifact.abi, null, {
    data: artifact.bytecode,
    from: owner,
  });
  const tx = theContract.deploy({ arguments: [...args] });
  const result = await tx.send({ from: owner });
  return result as T; // TODO add .address to prototype
}

export async function impersonate(address: string) {
  await hre().network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
}

export async function resetNetworkFork(blockNumber?: number) {
  await hre().network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          blockNumber,
          jsonRpcUrl: hre().network.config.forking.jsonRpcUrl,
        },
      },
    ],
  });
}

export async function evmIncreaseTime(seconds: number) {
  await hre().network.provider.request({
    method: "evm_increaseTime",
    params: [seconds],
  });
}

export async function keepTrying<T>(fn: () => Promise<T>): Promise<T> {
  do {
    try {
      return await fn();
    } catch (e) {
      console.error(e);
      await sleep(1);
    }
  } while (true);
}

export async function sleep(seconds: number) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
