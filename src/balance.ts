import { bn, contract, fmt, hre, keepTrying } from "./utils";
import { CompoundLoop } from "../typechain-hardhat/CompoundLoop";
import { compoundLensAddress, compTokenAddress, CONTRACT_ADDRESS, OWNER, unitrollerAddress } from "./consts";
import { CompoundLensAbi } from "../typechain/CompoundLensAbi";

export async function printClaimableComp() {
  const instance = contract<CompoundLensAbi>(require("../abi/CompoundLensAbi.json"), compoundLensAddress);
  const result = await instance.methods
    .getCompBalanceMetadataExt(compTokenAddress, unitrollerAddress, CONTRACT_ADDRESS)
    .call({ from: OWNER });
  const claimable = bn(result[0]).add(bn(result[3]));
  console.log("claimable COMP", fmt(claimable));

  // from CompoundLens:
  //      function getCompBalanceMetadataExt(Comp comp, ComptrollerLensInterface comptroller, address account) external returns (CompBalanceMetadataExt memory) {
  //         uint balance = comp.balanceOf(account);
  //         comptroller.claimComp(account);
  //         uint newBalance = comp.balanceOf(account);
  //         uint accrued = comptroller.compAccrued(account);
  //         uint total = add(accrued, newBalance, "sum comp total");
  //         uint allocated = sub(total, balance, "sub allocated");
  //
  //         return CompBalanceMetadataExt({
  //             balance: balance,
  //             votes: uint256(comp.getCurrentVotes(account)),
  //             delegate: comp.delegates(account),
  //             allocated: allocated
  //         });
  //     }
}

export async function printCurrentLiquidity() {
  const instance = contract<CompoundLoop>(require("../artifacts/contracts/CompoundLoop.sol/CompoundLoop.json").abi, CONTRACT_ADDRESS);
  const result = await instance.methods.getAccountLiquidityWithInterest().call({ from: OWNER });
  console.log(await hre().web3.eth.getBlockNumber(), fmt(result.accountLiquidity));
}

export async function printHistoricalLiquidity(hours: number) {
  const instance = contract<CompoundLoop>(require("../artifacts/contracts/CompoundLoop.sol/CompoundLoop.json").abi, CONTRACT_ADDRESS);
  const startBlock = 11792730;
  const endBlock = await hre().web3.eth.getBlockNumber();

  const promises = [];
  for (let block = startBlock; block < endBlock; block += Math.round((60 * 60 * hours) / 13)) {
    console.log("checking", block);
    // @ts-ignore
    promises.push({ block, p: instance.methods.getAccountLiquidityWithInterest().call({ from: OWNER }, block) });
  }
  const results = await Promise.all(promises.map((promise: any) => resolve(promise)));
  results.forEach((r) => {
    console.log(r.block, ":", r.p[1]);
  });
}

async function resolve(promise: { block: number; p: any }): Promise<{ block: number; p: any }> {
  return { block: promise.block, p: await keepTrying(() => promise.p) };
}
