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

import { bn, cerc20, compiledContract, erc20, evmIncreaseTime, hre, impersonate, to1e6 } from "../src/utils";
import { CompoundLoop } from "../typechain-hardhat/CompoundLoop";
import { compTokenAddress, CONTRACT_ADDRESS, CUSDCAddress, USDCAddress } from "../src/consts";

const USDC_HOLDER = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";

describe("CompoundLoop", async () => {
  it("emergencySubmitTransaction:: withdraw usdc from contract", async function () {
    const owner = (await hre().web3.eth.getAccounts())[3];

    const initialAmount = to1e6(1000000);
    const minAmount = to1e6(10000);

    const compoundLoop = await compiledContract<CompoundLoop>("CompoundLoop", owner, owner);
    const contractAddress = compoundLoop.options.address;

    const usdcToken = await erc20(USDCAddress);
    const compToken = await erc20(compTokenAddress);
    const cusdcToken = await cerc20(CUSDCAddress);

    await impersonate(USDC_HOLDER);
    await usdcToken.methods.transfer(contractAddress, initialAmount).send({ from: USDC_HOLDER });

    expect(await usdcToken.methods.balanceOf(contractAddress).call()).to.be.bignumber.eq(initialAmount);
    expect(await usdcToken.methods.balanceOf(owner).call()).to.be.bignumber.eq(new BN(0));
    const gasLimit = new BN(8000000);
    const data = hre().web3.eth.abi.encodeFunctionCall(
      {
        name: "transfer",
        type: "function",
        inputs: [
          {
            type: "address",
            name: "recipient",
          },
          {
            type: "uint256",
            name: "amount",
          },
        ],
      },
      [owner, initialAmount.toString()]
    );
    await compoundLoop.methods.emergencySubmitTransaction(USDCAddress, data, gasLimit.toString()).send({ from: owner });
    expect(await usdcToken.methods.balanceOf(contractAddress).call()).to.be.bignumber.eq(new BN(0));
    expect(await usdcToken.methods.balanceOf(owner).call()).to.be.bignumber.eq(initialAmount);
  });

  it("enter, exit, claim", async () => {
    const owner = (await hre().web3.eth.getAccounts())[0];

    const initialAmount = to1e6(5_000_000);
    const minAmount = to1e6(50_000);

    const compoundLoop = await compiledContract<CompoundLoop>("CompoundLoop", owner, owner);
    expect(await compoundLoop.methods.CUSDC().call()).eq(CUSDCAddress);

    const usdcToken = await erc20(USDCAddress);
    const compToken = await erc20(compTokenAddress);
    const cusdcToken = await cerc20(CUSDCAddress);

    await impersonate(USDC_HOLDER);
    const contractAddress = compoundLoop.options.address;
    await usdcToken.methods.transfer(contractAddress, initialAmount).send({ from: USDC_HOLDER });

    let res = await compoundLoop.methods.enterPosition(minAmount, 93, 100).send({ from: owner });
    console.log(`enter position: gas used - ${res.gasUsed}`);
    expect(res.gasUsed).to.be.lt(8000000);

    expect(await usdcToken.methods.balanceOf(contractAddress).call()).to.bignumber.eq("0");

    const borrowBalance = await cusdcToken.methods.borrowBalanceStored(contractAddress).call();
    console.log(`contract borrow balance after entering: ${to1e6(borrowBalance)}`);

    const blocks = 5;
    const avgBlockTime = 13;
    await evmIncreaseTime(blocks * avgBlockTime);

    await compoundLoop.methods.claimAndTransferAllCompToOwner().send({ from: owner });
    expect(await compToken.methods.balanceOf(contractAddress).call()).to.bignumber.eq("0");

    const compBalance = bn(await compToken.methods.balanceOf(owner).call());
    console.log(`owner COMP balance after claim: ${compBalance} COMP`);
    const compPerDay = compBalance.divn(blocks * avgBlockTime).muln(60 * 60 * 24);
    console.log(`owner COMP balance after claim: ${compPerDay} COMP/Day`);

    expect(compPerDay).to.bignumber.gte(bn("12000000000000000"));

    res = await compoundLoop.methods.exitPosition(100, 1, 1).send({ from: owner, gas: 10e6 });
    console.log(`exit position: gas used - ${res.gasUsed}`);

    const borrowedBalance = await cusdcToken.methods.borrowBalanceStored(contractAddress).call({ from: owner });
    expect(bn(borrowedBalance)).to.be.bignumber.eq("0");
    expect(await cusdcToken.methods.balanceOf(contractAddress).call()).to.be.bignumber.eq("0");

    const usdcBalanceAfterExit = await usdcToken.methods.balanceOf(contractAddress).call();
    console.log(`contract USDC balance after exit: ${to1e6(usdcBalanceAfterExit)} USDC`);
    expect(usdcBalanceAfterExit).to.be.bignumber.gte(initialAmount);

    await compoundLoop.methods.safeTransferUSDCToOwner().send({ from: owner });
    expect(await usdcToken.methods.balanceOf(contractAddress).call()).to.be.bignumber.eq(new BN(0));

    const usdcBalanceAfterWithdraw = await usdcToken.methods.balanceOf(owner).call();
    console.log(`owner USDC balance after withdraw: ${to1e6(usdcBalanceAfterWithdraw)} USDC`);
    expect(usdcBalanceAfterWithdraw).to.be.bignumber.gte(initialAmount);
  });

  it("enter, enter again with small amount, exit", async function () {
    const owner = (await hre().web3.eth.getAccounts())[1];

    const initialAmount = to1e6(1000000);
    const secondAmount = to1e6(20000);
    const minAmount = to1e6(10000);

    const totalAmount = initialAmount.add(secondAmount);

    const usdcToken = await erc20(USDCAddress);
    const compToken = await erc20(compTokenAddress);
    const cusdcToken = await cerc20(CUSDCAddress);

    const compoundLoop = await compiledContract<CompoundLoop>("CompoundLoop", owner, owner);
    const contractAddress = compoundLoop.options.address;
    await impersonate(USDC_HOLDER);
    await usdcToken.methods.transfer(contractAddress, initialAmount).send({ from: USDC_HOLDER });

    let res = await compoundLoop.methods.enterPosition(minAmount, 99, 100).send({ from: owner });
    expect(res.gasUsed).to.be.lt(6000000);
    console.log(`enter position (initial): gas used - ${res.gasUsed}`);

    expect(await usdcToken.methods.balanceOf(contractAddress).call()).to.be.bignumber.eq(new BN(0));

    let borrowBalance = await cusdcToken.methods.borrowBalanceStored(contractAddress).call();
    console.log(`contract borrow balance after initial entering: ${to1e6(borrowBalance)}`);
    expect(new BN(borrowBalance)).to.be.bignumber.gt(to1e6(2976136));
    expect(new BN(borrowBalance)).to.be.bignumber.lt(to1e6(2976137));

    await usdcToken.methods.transfer(contractAddress, secondAmount).send({ from: USDC_HOLDER });

    res = await compoundLoop.methods.enterPosition(minAmount, 99, 100).send({ from: owner });
    expect(res.gasUsed).to.be.lt(6000000);
    console.log(`enter position (second): gas used - ${res.gasUsed}`);

    expect(await usdcToken.methods.balanceOf(contractAddress).call()).to.be.bignumber.eq(new BN(0));

    borrowBalance = await cusdcToken.methods.borrowBalanceStored(contractAddress).call();
    console.log(`contract borrow balance after initial entering: ${to1e6(borrowBalance)}`);
    expect(new BN(borrowBalance)).to.be.bignumber.gt(to1e6(3033109));
    expect(new BN(borrowBalance)).to.be.bignumber.lt(to1e6(3043110));

    const blocks = 5;
    const avgBlockTime = 13;
    await evmIncreaseTime(blocks * avgBlockTime);

    res = await compoundLoop.methods.exitPosition(100, 1, 1).send({ from: owner });
    console.log(`exit position: gas used - ${res.gasUsed}`);

    expect(await cusdcToken.methods.borrowBalanceStored(contractAddress).call()).to.be.bignumber.eq(new BN(0));
    expect(await cusdcToken.methods.balanceOf(contractAddress).call()).to.be.bignumber.eq(new BN(0));

    const usdcBalanceAfterExit = await usdcToken.methods.balanceOf(contractAddress).call();
    console.log(`contract USDC balance after exit: ${to1e6(usdcBalanceAfterExit)} USDC`);
    expect(usdcBalanceAfterExit).to.be.bignumber.gte(totalAmount);

    await compoundLoop.methods.safeTransferUSDCToOwner().send({ from: owner });
    expect(await usdcToken.methods.balanceOf(contractAddress).call()).to.be.bignumber.eq(new BN(0));

    const usdcBalanceAfterWithdraw = await usdcToken.methods.balanceOf(owner).call();
    console.log(`owner USDC balance after withdraw: ${to1e6(usdcBalanceAfterWithdraw)} USDC`);
    expect(usdcBalanceAfterWithdraw).to.be.bignumber.gte(totalAmount);
  });

  it("enter, exit manually", async function () {
    const owner = (await hre().web3.eth.getAccounts())[2];

    const initialAmount = to1e6(1000000);
    const minAmount = to1e6(10000);

    const compoundLoop = await compiledContract<CompoundLoop>("CompoundLoop", owner, owner);
    expect(await compoundLoop.methods.CUSDC().call()).eq(CUSDCAddress);

    const usdcToken = await erc20(USDCAddress);
    const compToken = await erc20(compTokenAddress);
    const cusdcToken = await cerc20(CUSDCAddress);

    await impersonate(USDC_HOLDER);
    const contractAddress = compoundLoop.options.address;
    await usdcToken.methods.transfer(contractAddress, initialAmount).send({ from: USDC_HOLDER });

    const res = await compoundLoop.methods.enterPosition(minAmount, 99, 100).send({ from: owner });
    expect(res.gasUsed).to.be.lt(6000000);
    console.log(`enter position: gas used - ${res.gasUsed}`);

    expect(await usdcToken.methods.balanceOf(contractAddress).call()).to.be.bignumber.eq(new BN(0));

    const borrowBalance = await cusdcToken.methods.borrowBalanceStored(contractAddress).call();
    console.log(`contract borrow balance after initial entering: ${to1e6(borrowBalance)}`);
    expect(new BN(borrowBalance)).to.be.bignumber.gt(to1e6(2976136));
    expect(new BN(borrowBalance)).to.be.bignumber.lt(to1e6(2976137));

    // exit manually here
    await compoundLoop.methods.setApprove().send({ from: owner });
    let redeemAmount = new BN(5_000_000_000);
    while (true) {
      redeemAmount = redeemAmount.muln(5).divn(4);

      const borrowBalance = new BN(await cusdcToken.methods.borrowBalanceStored(contractAddress).call());
      if (borrowBalance.eq(new BN(0))) {
        break;
      }

      await compoundLoop.methods.redeemUnderlying(redeemAmount.toString()).send({ from: owner });
      const usdcBalance = await usdcToken.methods.balanceOf(contractAddress).call();
      console.log(`borrow balance: ${borrowBalance} usdc balance: ${usdcBalance} redeemAmount: ${redeemAmount}`);
      await compoundLoop.methods.repayBorrowAll().send({ from: owner });
    }

    let usdcBalance = await cusdcToken.methods.balanceOf(contractAddress).call();
    await compoundLoop.methods.redeemCToken(usdcBalance).send({
      from: owner,
    });
    usdcBalance = await cusdcToken.methods.balanceOf(contractAddress).call();
    expect(usdcBalance).to.bignumber.eq(new BN(0));

    const usdcBalanceAfterExit = await usdcToken.methods.balanceOf(contractAddress).call();
    console.log(`contract USDC balance after exit: ${to1e6(usdcBalanceAfterExit)} USDC`);
    expect(usdcBalanceAfterExit).to.be.bignumber.gte(initialAmount);

    await compoundLoop.methods.safeTransferUSDCToOwner().send({ from: owner });
    expect(await usdcToken.methods.balanceOf(contractAddress).call()).to.be.bignumber.eq(new BN(0));

    const usdcBalanceAfterWithdraw = await usdcToken.methods.balanceOf(owner).call();
    console.log(`owner USDC balance after withdraw: ${to1e6(usdcBalanceAfterWithdraw)} USDC`);
    expect(usdcBalanceAfterWithdraw).to.be.bignumber.gte(initialAmount);
  });

  it("account liquidity", async () => {
    const owner = (await hre().web3.eth.getAccounts())[4];

    const initialAmount = to1e6(5_000_000);
    const minAmount = to1e6(50_000);

    const compoundLoop = await compiledContract<CompoundLoop>("CompoundLoop", owner, owner);
    expect(await compoundLoop.methods.CUSDC().call()).eq(CUSDCAddress);

    const usdcToken = await erc20(USDCAddress);
    const compToken = await erc20(compTokenAddress);
    const cusdcToken = await cerc20(CUSDCAddress);

    await impersonate(USDC_HOLDER);
    const contractAddress = compoundLoop.options.address;
    await usdcToken.methods.transfer(contractAddress, initialAmount).send({ from: USDC_HOLDER });

    const res = await compoundLoop.methods.enterPosition(minAmount, 93, 100).send({ from: owner });
    console.log(`enter position: gas used - ${res.gasUsed}`);
    const liquidity1 = await compoundLoop.methods.getAccountLiquidityWithInterest().call({ from: owner });
    console.log(liquidity1);

    const blocks = 50;
    const avgBlockTime = 13;
    await evmIncreaseTime(blocks * avgBlockTime);
    const liquidity2 = await compoundLoop.methods.getAccountLiquidityWithInterest().call({ from: owner });
    console.log(liquidity2);

    expect(liquidity2.accountLiquidity).to.bignumber.lt(bn(liquidity1.accountLiquidity));
  });

  it("cTokenBalance comforms to redeem", async () => {
    const owner = (await hre().web3.eth.getAccounts())[5];

    const initialAmount = to1e6(5_000_000);
    const minAmount = to1e6(50_000);

    const compoundLoop = await compiledContract<CompoundLoop>("CompoundLoop", owner, owner);
    const usdcToken = await erc20(USDCAddress);
    const compToken = await erc20(compTokenAddress);
    const cusdcToken = await cerc20(CUSDCAddress);

    await impersonate(USDC_HOLDER);
    const contractAddress = compoundLoop.options.address;
    await usdcToken.methods.transfer(contractAddress, initialAmount).send({ from: USDC_HOLDER });

    await compoundLoop.methods.enterPosition(minAmount, 93, 100).send({ from: owner });

    const cTokenBalance = await compoundLoop.methods.cTokenBalance().call({ from: owner });
    const ctokenBalanceOf = await cusdcToken.methods.balanceOf(contractAddress).call();
    expect(ctokenBalanceOf).to.bignumber.eq(cTokenBalance);
  });
});
