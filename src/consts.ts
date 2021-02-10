import { config } from "./config";

export const ethChainId = 0x1;
export const ethInfuraRpcUrl = "https://mainnet.infura.io/v3/" + config().infuraKey;
export const ethAlchemyRpcUrl = "https://eth-mainnet.alchemyapi.io/v2/" + config().alchemyKey;

export const etherscanApiBaseUrl = "https://api.etherscan.io/api";
export const etherscanKey = config().etherscanKey;

export const coinmarketcapKey = config().coinmarketcapKey;

export const CONTRACT_ADDRESS = "0x0";
export const OWNER = "0x0";

export const USDCAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const unitrollerAddress = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
export const CUSDCAddress = "0x39AA39c021dfbaE8faC545936693aC917d5E7563";
export const compTokenAddress = "0xc00e94Cb662C3520282E6f5717214004A7f26888";
