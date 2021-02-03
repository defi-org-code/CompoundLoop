const { accounts, contract } = require('@openzeppelin/test-environment');
const { BN, time } = require('@openzeppelin/test-helpers');

const { expect } = require('chai');

const USDC_HOLDER = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";
const USDC_ADDR = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const CUSDC_ADDR = "0x39AA39c021dfbaE8faC545936693aC917d5E7563";
const COMP_ADDR = "0xc00e94Cb662C3520282E6f5717214004A7f26888";

const CompoundMultiple = contract.fromArtifact('CompoundMultiple'); // Loads a compiled contract
const ERC20 = contract.fromArtifact('IERC20'); // Loads a compiled contract
const CERC20 = contract.fromArtifact('ICErc20'); // Loads a compiled contract
const Exponential = contract.fromArtifact('Exponential'); // Loads a compiled contract

const fromUsd = x => new BN(x).mul(new BN(1000000));
const toUsd = x => new BN(x).div(new BN(1000000));

const toComp = x => new BN(x).div(new BN(10).pow(new BN(18)));
const fromComp = x => new BN(x).mul(new BN(10).pow(new BN(18)));

let curAccount = 0;
const nextAccount = () => accounts[curAccount++];

describe('CompoundMultiple', function () {

    it('enter, exit, claim', async function () {
        const owner = nextAccount();

        const initialAmount = fromUsd(5000000);
        const minAmount = fromUsd(10000);

        const compoundMultiple = await CompoundMultiple.new(owner, { from: owner });

        const usdcToken = await ERC20.at(USDC_ADDR);
        const compToken = await ERC20.at(COMP_ADDR);
        const cusdcToken = await CERC20.at(CUSDC_ADDR);
        const cusdcTokenERC20 = await ERC20.at(CUSDC_ADDR);

        await usdcToken.transfer(compoundMultiple.address, initialAmount, {from: USDC_HOLDER});

        let res = await compoundMultiple.enterPosition(initialAmount, minAmount, 93, 100, {from: owner});
        console.log(`enter position: gas used - ${res.receipt.gasUsed}`);
        expect(parseInt(res.receipt.gasUsed)).to.be.lt(8000000);

        expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));

        const borrowBalance = await cusdcToken.borrowBalanceStored(compoundMultiple.address);
        console.log(`contract borrow balance after entering: ${toUsd(borrowBalance)}`);
        expect(new BN(borrowBalance)).to.be.bignumber.gt(fromUsd(14970000));
        expect(new BN(borrowBalance)).to.be.bignumber.lt(fromUsd(14980000));

        const avgBlockTime = 13
        const blocks = 5;

        for (let i = 0; i < blocks; i++) {
            await time.advanceBlock();
        }

        await compoundMultiple.claimAndTransferAllComp(owner, {from: owner});
        expect(await compToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));

        const compBalance = await compToken.balanceOf(owner);
        console.log(`owner COMP balance after claim: ${compBalance} COMP*1e18, ${toComp(compBalance.mul(new BN(60 * 60 * 24).div(new BN(blocks * avgBlockTime))))} COMP/day`);
        expect(compBalance).to.bignumber.gte("12000000000000000");

        res = await compoundMultiple.exitPosition({from: owner});
        console.log(`exit position: gas used - ${res.receipt.gasUsed}`);

        expect(await cusdcToken.borrowBalanceStored(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));
        expect(await cusdcTokenERC20.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));

        const usdcBalanceAfterExit = await usdcToken.balanceOf(compoundMultiple.address);
        console.log(`contract USDC balance after exit: ${toUsd(usdcBalanceAfterExit)} USDC`);
        expect(usdcBalanceAfterExit).to.be.bignumber.gte(initialAmount);

        await compoundMultiple.transferAsset(usdcToken.address, owner, usdcBalanceAfterExit, {from: owner});
        expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));

        let usdcBalanceAfterWithdraw = await usdcToken.balanceOf(owner)
        console.log(`owner USDC balance after withdraw: ${toUsd(usdcBalanceAfterWithdraw)} USDC`);
        expect(usdcBalanceAfterWithdraw).to.be.bignumber.gte(initialAmount);
    });

    it('enter, enter again with small amount, exit', async function () {
        const owner = nextAccount();

        const initialAmount = fromUsd(1000000);
        const secondAmount = fromUsd(20000);
        const minAmount = fromUsd(10000);

        const totalAmount = initialAmount.add(secondAmount);

        const compoundMultiple = await CompoundMultiple.new(owner, { from: owner });

        const usdcToken = await ERC20.at(USDC_ADDR);
        const cusdcToken = await CERC20.at(CUSDC_ADDR);
        const cusdcTokenERC20 = await ERC20.at(CUSDC_ADDR);

        await usdcToken.transfer(compoundMultiple.address, initialAmount, {from: USDC_HOLDER});

        let res = await compoundMultiple.enterPosition(initialAmount, minAmount, 99, 100, {from: owner});
        expect(parseInt(res.receipt.gasUsed)).to.be.lt(6000000);
        console.log(`enter position (initial): gas used - ${res.receipt.gasUsed}`);

        expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));

        let borrowBalance = await cusdcToken.borrowBalanceStored(compoundMultiple.address);
        console.log(`contract borrow balance after initial entering: ${toUsd(borrowBalance)}`);
        expect(new BN(borrowBalance)).to.be.bignumber.gt(fromUsd(2976136));
        expect(new BN(borrowBalance)).to.be.bignumber.lt(fromUsd(2976137));

        await usdcToken.transfer(compoundMultiple.address, secondAmount, {from: USDC_HOLDER});

        res = await compoundMultiple.enterPosition(secondAmount, minAmount, 99, 100, {from: owner});
        expect(parseInt(res.receipt.gasUsed)).to.be.lt(6000000);
        console.log(`enter position (second): gas used - ${res.receipt.gasUsed}`);

        expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));

        borrowBalance = await cusdcToken.borrowBalanceStored(compoundMultiple.address);
        console.log(`contract borrow balance after initial entering: ${toUsd(borrowBalance)}`);
        expect(new BN(borrowBalance)).to.be.bignumber.gt(fromUsd(3033109));
        expect(new BN(borrowBalance)).to.be.bignumber.lt(fromUsd(3043110));

        const blocks = 5;
        for (let i = 0; i < blocks; i++) {
            await time.advanceBlock();
        }

        res = await compoundMultiple.exitPosition({from: owner});
        console.log(`exit position: gas used - ${res.receipt.gasUsed}`);

        expect(await cusdcToken.borrowBalanceStored(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));
        expect(await cusdcTokenERC20.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));

        const usdcBalanceAfterExit = await usdcToken.balanceOf(compoundMultiple.address);
        console.log(`contract USDC balance after exit: ${toUsd(usdcBalanceAfterExit)} USDC`);
        expect(usdcBalanceAfterExit).to.be.bignumber.gte(totalAmount);

        await compoundMultiple.transferAsset(usdcToken.address, owner, usdcBalanceAfterExit, {from: owner});
        expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));

        let usdcBalanceAfterWithdraw = await usdcToken.balanceOf(owner)
        console.log(`owner USDC balance after withdraw: ${toUsd(usdcBalanceAfterWithdraw)} USDC`);
        expect(usdcBalanceAfterWithdraw).to.be.bignumber.gte(totalAmount);
    });

    it('enter, exit manually', async function () {
        const owner = nextAccount();

        const initialAmount = fromUsd(1000000);
        const minAmount = fromUsd(10000);

        const compoundMultiple = await CompoundMultiple.new(owner, { from: owner });

        const usdcToken = await ERC20.at(USDC_ADDR);
        const cusdcToken = await CERC20.at(CUSDC_ADDR);
        const cusdcTokenERC20 = await ERC20.at(CUSDC_ADDR);

        await usdcToken.transfer(compoundMultiple.address, initialAmount, {from: USDC_HOLDER});

        let res = await compoundMultiple.enterPosition(initialAmount, minAmount, 99, 100, {from: owner});
        expect(parseInt(res.receipt.gasUsed)).to.be.lt(6000000);
        console.log(`enter position: gas used - ${res.receipt.gasUsed}`);

        expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));

        let borrowBalance = await cusdcToken.borrowBalanceStored(compoundMultiple.address);
        console.log(`contract borrow balance after initial entering: ${toUsd(borrowBalance)}`);
        expect(new BN(borrowBalance)).to.be.bignumber.gt(fromUsd(2976136));
        expect(new BN(borrowBalance)).to.be.bignumber.lt(fromUsd(2976137));

        const blocks = 5;
        for (let i = 0; i < blocks; i++) {
            await time.advanceBlock();
        }

        // exit manually here
        await compoundMultiple.setApproval({from: owner});
        let redeemAmount = new BN(5000000000);
        while (true) {
            redeemAmount = redeemAmount.mul(new BN(5)).div(new BN(4));

            const borrowBalance = new BN(await cusdcToken.borrowBalanceStored(compoundMultiple.address));
            if (borrowBalance.eq(new BN(0))) {
                break;
            }

            await compoundMultiple.redeemUnderlying(redeemAmount, {from: owner});
            const usdcBalance = await usdcToken.balanceOf(compoundMultiple.address);
            console.log(`borrow balance: ${borrowBalance} usdc balance: ${usdcBalance} redeemAmount: ${redeemAmount}`);
            await compoundMultiple.repayBorrow(0, {from: owner});
        }

        await compoundMultiple.redeemCToken(new BN(await cusdcTokenERC20.balanceOf(compoundMultiple.address)), {from: owner});
        expect(new BN(await cusdcTokenERC20.balanceOf(compoundMultiple.address))).to.bignumber.eq(new BN(0));

        const usdcBalanceAfterExit = await usdcToken.balanceOf(compoundMultiple.address);
        console.log(`contract USDC balance after exit: ${toUsd(usdcBalanceAfterExit)} USDC`);
        expect(usdcBalanceAfterExit).to.be.bignumber.gte(initialAmount);

        await compoundMultiple.transferAsset(usdcToken.address, owner, usdcBalanceAfterExit, {from: owner});
        expect(await usdcToken.balanceOf(compoundMultiple.address)).to.be.bignumber.eq(new BN(0));

        let usdcBalanceAfterWithdraw = await usdcToken.balanceOf(owner)
        console.log(`owner USDC balance after withdraw: ${toUsd(usdcBalanceAfterWithdraw)} USDC`);
        expect(usdcBalanceAfterWithdraw).to.be.bignumber.gte(initialAmount);
    });

});