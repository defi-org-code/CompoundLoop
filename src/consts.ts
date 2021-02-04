import { config } from "./config";

export const ethChainId = 0x1;
export const ethInfuraRpcUrl = "https://mainnet.infura.io/v3/" + config().infuraKey;
export const ethAlchemyRpcUrl = "https://eth-mainnet.alchemyapi.io/v2/" + config().alchemyKey;

export const etherscanApiBaseUrl = "https://api.etherscan.io/api";
export const etherscanKey = config().etherscanKey;

export const cUSDCAddress = "0x39AA39c021dfbaE8faC545936693aC917d5E7563";
export const compoundLensAddress = "0xd513d22422a3062Bd342Ae374b4b9c20E0a9a074";
