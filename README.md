# CompoundLoop

## What is this

DeFi strategy to invest USDC in [Compound](https://compound.finance/) in a loop in order to earn COMP rewards for approx x7 of the initial investment.

## E2E Tests

The tests are explained [here](https://github.com/defi-org-code/CompoundLoop/issues/4). Run them on a ganache mainnet fork:

```
npm install
npm run test
```

## Deployment

Recommended to use [Remix](https://remix.ethereum.org/) to deploy the contract using Trezor.

## Roles

*Owner* can withdraw funds and *manager* can enter/exit the position in Compound. For simplicity, can leave both roles as the deployer Trezor account since handling the contract can be manual (no bot needed).

## Management

Recommended to take the ABI created during test/deployment and upload it as private [custom ABI](https://info.etherscan.com/custom-abi/) to Etherscan and this way we can easily use Etherscan read/write interface without publishing the contract source.

## Gas

Exiting with $1M inside takes 5.5M gas, existing with $5M inside takes 7.5M gas.

## Monitoring

Call `getAccountLiquidity` to see that the liquidity is not dropping to zero (approaching liquidation). The liquidity should usually increase over time since combined interest rate should be positive.

*Review: might need to improve this to a state updating function since this may not take into account changes over time*

## Emergencies

If `exitPosition` fails, exit can be done manually:

1. Using multiple manual rollback transactions, see [test #3](https://github.com/defi-org-code/CompoundLoop/issues/4).

2. The owner contract can also execute an arbitrary transaction using `emergencySubmitTransaction`.

3. By sending more USDC to the contract before running `exitPosition` again, this will reduce the numebr of exit iterations.
