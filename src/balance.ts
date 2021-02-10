import { contract, fmt, hre, keepTrying } from "./utils";
import { CompoundLoop } from "../typechain-hardhat/CompoundLoop";
import { CONTRACT_ADDRESS, OWNER } from "./consts";

function instance() {
  return contract<CompoundLoop>(require("../artifacts/contracts/CompoundLoop.sol/CompoundLoop.json").abi, CONTRACT_ADDRESS);
}

export async function printClaimableComp() {
  const result = await instance().methods["claimComp()"]().call({ from: OWNER });
  console.log("claimable COMP", fmt(result));
}

export async function printCurrentLiquidity() {
  const result = await instance().methods.getAccountLiquidityWithInterest().call({ from: OWNER });
  console.log(await hre().web3.eth.getBlockNumber(), fmt(result.accountLiquidity));
}

export async function printHistoricalLiquidity(hours: number) {
  const startBlock = 11823720;
  const endBlock = await hre().web3.eth.getBlockNumber();

  const promises = [];
  for (let block = startBlock; block < endBlock; block += Math.round((60 * 60 * hours) / 13)) {
    console.log("checking", block);
    // @ts-ignore-next-line
    promises.push({ block, p: instance().methods.getAccountLiquidityWithInterest().call({ from: OWNER }, block) });
  }
  const results = await Promise.all(promises.map((promise: any) => resolve(promise)));
  results.forEach((r) => {
    console.log(r.block, ":", r.p[1]);
  });
}

async function resolve(promise: { block: number; p: any }): Promise<{ block: number; p: any }> {
  return { block: promise.block, p: await keepTrying(() => promise.p) };
}
