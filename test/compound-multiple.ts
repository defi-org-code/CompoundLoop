import { expect, use } from "chai";
import BN from "bn.js";
use(require("chai-bn")(BN));
declare global {
  namespace Chai {
    interface Assertion extends NumberComparer {
      bignumber: Assertion;
    }
  }
}

import { bn, cerc20, compiledContract, erc20, evmIncreaseTime, hre, impersonate, usd } from "../src/utils";
import { CompoundMultiple } from "../typechain-hardhat/CompoundMultiple";
import { compTokenAddress, CUSDCAddress, USDCAddress } from "../src/consts";

const toComp = (x: number) => bn(x).div(bn(10)).pow(bn(18));
const fromComp = (x: number) => bn(x).mul(bn(10)).pow(bn(18));

const USDC_HOLDER = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";

describe("CompoundLoop", async () => {
  it("enter, exit, claim", async () => {
    const owner = (await hre().web3.eth.getAccounts())[0];

    const initialAmount = usd(5_000_000);
    const minAmount = usd(10_000);

    const compoundMultiple = await compiledContract<CompoundMultiple>("CompoundMultiple", owner, owner);
    expect(await compoundMultiple.methods.CUSDC().call()).eq(CUSDCAddress);

    const usdcToken = await erc20(USDCAddress);
    const compToken = await erc20(compTokenAddress);
    const cusdcToken = await cerc20(CUSDCAddress);

    await impersonate(USDC_HOLDER);
    const contractAddress = compoundMultiple.options.address;
    await usdcToken.methods.transfer(contractAddress, initialAmount).send({ from: USDC_HOLDER });

    let res = await compoundMultiple.methods.enterPosition(minAmount, 93, 100).send({ from: owner });
    console.log(`enter position: gas used - ${res.gasUsed}`);
    expect(res.gasUsed).to.be.lt(8000000);

    expect(await usdcToken.methods.balanceOf(contractAddress).call()).to.bignumber.eq("0");

    const borrowBalance = await cusdcToken.methods.borrowBalanceStored(contractAddress).call();
    console.log(`contract borrow balance after entering: ${usd(borrowBalance)}`);
    expect(bn(borrowBalance)).to.bignumber.gt(usd(14970000));
    expect(bn(borrowBalance)).to.bignumber.lt(usd(14980000));

    const blocks = 5;
    const avgBlockTime = 13;
    await evmIncreaseTime(blocks * avgBlockTime);

    await compoundMultiple.methods.claimAndTransferAllComp(owner).send({ from: owner });
    expect(await compToken.methods.balanceOf(contractAddress).call()).to.bignumber.eq("0");

    const compBalance = bn(await compToken.methods.balanceOf(owner).call());
    console.log(`owner COMP balance after claim: ${compBalance} COMP`);
    const compPerDay = compBalance.divn(blocks * avgBlockTime).muln(60 * 60 * 24);
    console.log(`owner COMP balance after claim: ${compPerDay} COMP/Day`);

    expect(compPerDay).to.bignumber.gte(bn("12000000000000000"));

    res = await compoundMultiple.methods.exitPosition(100, 1, 1).send({ from: owner, gas: 10e6 });
    console.log(`exit position: gas used - ${res.gasUsed}`);

    const borrowedBalance = await cusdcToken.methods.borrowBalanceStored(contractAddress).call({ from: owner });
    expect(bn(borrowedBalance)).to.be.bignumber.eq("0");
    // expect(await cusdcTokenERC20.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));
    //
    // const usdcBalanceAfterExit = await usdcToken.balanceOf(compoundMultiple.address);
    // console.log(`contract USDC balance after exit: ${toUsd(usdcBalanceAfterExit)} USDC`);
    // expect(usdcBalanceAfterExit).to.be.bignumber.gte(initialAmount);
    //
    // await compoundMultiple.transferAsset(usdcToken.address, owner, usdcBalanceAfterExit, { from: owner });
    // expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));
    //
    // let usdcBalanceAfterWithdraw = await usdcToken.balanceOf(owner);
    // console.log(`owner USDC balance after withdraw: ${toUsd(usdcBalanceAfterWithdraw)} USDC`);
    // expect(usdcBalanceAfterWithdraw).to.be.bignumber.gte(initialAmount);
  });
  //
  // it("enter, enter again with small amount, exit", async function () {
  //   const owner = nextAccount();
  //
  //   const initialAmount = fromUsd(1000000);
  //   const secondAmount = fromUsd(20000);
  //   const minAmount = fromUsd(10000);
  //
  //   const totalAmount = initialAmount.add(secondAmount);
  //
  //   const compoundMultiple = await CompoundLoop.new(owner, { from: owner });
  //
  //   const usdcToken = await ERC20.at(USDC_ADDR);
  //   const cusdcToken = await CERC20.at(CUSDC_ADDR);
  //   const cusdcTokenERC20 = await ERC20.at(CUSDC_ADDR);
  //
  //   await usdcToken.transfer(compoundMultiple.address, initialAmount, { from: USDC_HOLDER });
  //
  //   let res = await compoundMultiple.enterPosition(initialAmount, minAmount, 99, 100, { from: owner });
  //   expect(parseInt(res.receipt.gasUsed)).to.be.lt(6000000);
  //   console.log(`enter position (initial): gas used - ${res.receipt.gasUsed}`);
  //
  //   expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));
  //
  //   let borrowBalance = await cusdcToken.borrowBalanceStored(compoundMultiple.address);
  //   console.log(`contract borrow balance after initial entering: ${toUsd(borrowBalance)}`);
  //   expect(new BN(borrowBalance)).to.be.bignumber.gt(fromUsd(2976136));
  //   expect(new BN(borrowBalance)).to.be.bignumber.lt(fromUsd(2976137));
  //
  //   await usdcToken.transfer(compoundMultiple.address, secondAmount, { from: USDC_HOLDER });
  //
  //   res = await compoundMultiple.enterPosition(secondAmount, minAmount, 99, 100, { from: owner });
  //   expect(parseInt(res.receipt.gasUsed)).to.be.lt(6000000);
  //   console.log(`enter position (second): gas used - ${res.receipt.gasUsed}`);
  //
  //   expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));
  //
  //   borrowBalance = await cusdcToken.borrowBalanceStored(compoundMultiple.address);
  //   console.log(`contract borrow balance after initial entering: ${toUsd(borrowBalance)}`);
  //   expect(new BN(borrowBalance)).to.be.bignumber.gt(fromUsd(3033109));
  //   expect(new BN(borrowBalance)).to.be.bignumber.lt(fromUsd(3043110));
  //
  //   const blocks = 5;
  //   for (let i = 0; i < blocks; i++) {
  //     await time.advanceBlock();
  //   }
  //
  //   res = await compoundMultiple.exitPosition({ from: owner });
  //   console.log(`exit position: gas used - ${res.receipt.gasUsed}`);
  //
  //   expect(await cusdcToken.borrowBalanceStored(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));
  //   expect(await cusdcTokenERC20.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));
  //
  //   const usdcBalanceAfterExit = await usdcToken.balanceOf(compoundMultiple.address);
  //   console.log(`contract USDC balance after exit: ${toUsd(usdcBalanceAfterExit)} USDC`);
  //   expect(usdcBalanceAfterExit).to.be.bignumber.gte(totalAmount);
  //
  //   await compoundMultiple.transferAsset(usdcToken.address, owner, usdcBalanceAfterExit, { from: owner });
  //   expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));
  //
  //   let usdcBalanceAfterWithdraw = await usdcToken.balanceOf(owner);
  //   console.log(`owner USDC balance after withdraw: ${toUsd(usdcBalanceAfterWithdraw)} USDC`);
  //   expect(usdcBalanceAfterWithdraw).to.be.bignumber.gte(totalAmount);
  // });
  //
  // it("enter, exit manually", async function () {
  //   const owner = nextAccount();
  //
  //   const initialAmount = fromUsd(1000000);
  //   const minAmount = fromUsd(10000);
  //
  //   const compoundMultiple = await CompoundLoop.new(owner, { from: owner });
  //
  //   const usdcToken = await ERC20.at(USDC_ADDR);
  //   const cusdcToken = await CERC20.at(CUSDC_ADDR);
  //   const cusdcTokenERC20 = await ERC20.at(CUSDC_ADDR);
  //
  //   await usdcToken.transfer(compoundMultiple.address, initialAmount, { from: USDC_HOLDER });
  //
  //   let res = await compoundMultiple.enterPosition(initialAmount, minAmount, 99, 100, { from: owner });
  //   expect(parseInt(res.receipt.gasUsed)).to.be.lt(6000000);
  //   console.log(`enter position: gas used - ${res.receipt.gasUsed}`);
  //
  //   expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));
  //
  //   let borrowBalance = await cusdcToken.borrowBalanceStored(compoundMultiple.address);
  //   console.log(`contract borrow balance after initial entering: ${toUsd(borrowBalance)}`);
  //   expect(new BN(borrowBalance)).to.be.bignumber.gt(fromUsd(2976136));
  //   expect(new BN(borrowBalance)).to.be.bignumber.lt(fromUsd(2976137));
  //
  //   const blocks = 5;
  //   for (let i = 0; i < blocks; i++) {
  //     await time.advanceBlock();
  //   }
  //
  //   // exit manually here
  //   await compoundMultiple.setApproval({ from: owner });
  //   let redeemAmount = new BN(5000000000);
  //   while (true) {
  //     redeemAmount = redeemAmount.mul(new BN(5)).div(new BN(4));
  //
  //     const borrowBalance = new BN(await cusdcToken.borrowBalanceStored(compoundMultiple.address));
  //     if (borrowBalance.eq(new BN(0))) {
  //       break;
  //     }
  //
  //     await compoundMultiple.redeemUnderlying(redeemAmount, { from: owner });
  //     const usdcBalance = await usdcToken.balanceOf(compoundMultiple.address);
  //     console.log(`borrow balance: ${borrowBalance} usdc balance: ${usdcBalance} redeemAmount: ${redeemAmount}`);
  //     await compoundMultiple.repayBorrow(0, { from: owner });
  //   }
  //
  //   await compoundMultiple.redeemCToken(new BN(await cusdcTokenERC20.balanceOf(compoundMultiple.address)), {
  //     from: owner,
  //   });
  //   expect(new BN(await cusdcTokenERC20.balanceOf(compoundMultiple.address))).to.bignumber.eq(new BN(0));
  //
  //   const usdcBalanceAfterExit = await usdcToken.balanceOf(compoundMultiple.address);
  //   console.log(`contract USDC balance after exit: ${toUsd(usdcBalanceAfterExit)} USDC`);
  //   expect(usdcBalanceAfterExit).to.be.bignumber.gte(initialAmount);
  //
  //   await compoundMultiple.transferAsset(usdcToken.address, owner, usdcBalanceAfterExit, { from: owner });
  //   expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));
  //
  //   let usdcBalanceAfterWithdraw = await usdcToken.balanceOf(owner);
  //   console.log(`owner USDC balance after withdraw: ${toUsd(usdcBalanceAfterWithdraw)} USDC`);
  //   expect(usdcBalanceAfterWithdraw).to.be.bignumber.gte(initialAmount);
  // });
});
