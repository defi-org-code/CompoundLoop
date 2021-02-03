const { getBalance } = require("./src/balance");

const owner = "0x39AA39c021dfbaE8faC545936693aC917d5E7563" // TODO change to deployed contract address

async function main() {
	const b = await getBalance(owner);
	console.log(b)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

