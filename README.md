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

Owner can withdraw funds and manager and enter/exit the position in Compound. For simplicity, can leave both roles as the deployer Trezor account.

## Management

Recommended to take the ABI created during test/deployment and upload it as private [custom ABI](https://info.etherscan.com/custom-abi/) to Etherscan and this way we can easily use Etherscan read/write interface without publishing the contract source.

## Emergencies

If `exitPosition` fails, exit can be done manually:

1. Using multiple manual rollback transactions, see [test #3](https://github.com/defi-org-code/CompoundLoop/issues/4).

2. The owner contract can also execute an arbitrary transaction using `emergencySubmitTransaction`.
