const Web3 = require("web3");
const web3 = new Web3("https://mainnet.infura.io/v3/62f4815d28674debbe4703c5eb9d413c");

const cUSDCAddress = "0x39AA39c021dfbaE8faC545936693aC917d5E7563";
const lensAbi = require("../abi/CompoundLensAbi.json");
const lensAddress = "0xd513d22422a3062Bd342Ae374b4b9c20E0a9a074";

async function getBalance(owner) {
  const lens = new web3.eth.Contract(lensAbi, lensAddress);
  return await lens.methods.cTokenBalances(cUSDCAddress, owner).call({ from: owner });
}

module.exports = {
  getBalance,
};
