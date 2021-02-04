import Web3 from "web3";
// import { CompoundLensAbi } from "../typechain/CompoundLensAbi";
import { contract } from "./utils";
import { compoundLensAddress, cUSDCAddress } from "./consts";

// const lensAbi = require("../abi/CompoundLensAbi.json");

export async function getBalance(web3: Web3, owner: string) {
  // const lens = contract<CompoundLensAbi>(web3, lensAbi, compoundLensAddress);
  // return await lens.methods.cTokenBalances(cUSDCAddress, owner).call({ from: owner });
}
