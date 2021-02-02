module.exports = {
    accounts: {
        amount: 10, // Number of unlocked accounts
        ether: 100, // Initial balance of unlocked accounts (in ether)
    },

    contracts: {
        type: 'truffle', // Contract abstraction to use: 'truffle' for @truffle/contract or 'web3' for web3-eth-contract
        defaultGas: 6e6, // Maximum gas for contract calls (when unspecified)

        // Options available since v0.1.2
        defaultGasPrice: 20e9, // Gas price for contract calls (when unspecified)
        artifactsDir: 'build/contracts', // Directory where contract artifacts are stored
    },

    node: { // Options passed directly to Ganache client
        gasLimit: 8e6, // Maximum gas per block
        gasPrice: 20e9, // Sets the default gas price for transactions if not otherwise specified.
        // Uncomment and edit to use a mainnet fork
        fork: 'https://mainnet.infura.io/v3/62f4815d28674debbe4703c5eb9d413c',
        unlocked_accounts: [
            "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8",
        ], // Array of addresses specifying which accounts should be unlocked.
    },
};