import Web3 from "web3";

export function hre() {
  return require("hardhat");
}

export function contract<T>(web3: Web3, abi: any, address: string) {
  return (new web3.eth.Contract(abi, address) as any) as T;
}
