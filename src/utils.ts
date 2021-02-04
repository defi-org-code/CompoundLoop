export function hre() {
  return require("hardhat");
}

export function contract<T>(abi: any, address?: string) {
  return (new (hre().web3.eth.Contract)(abi, address) as any) as T;
}
