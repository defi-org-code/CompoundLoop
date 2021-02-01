// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;
//import "@openzeppelin/contracts/access/Ownable.sol";
//import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./Exponential.sol";

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/contracts/access/Ownable.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/contracts/token/ERC20/SafeERC20.sol";

interface IERC20Detailed {
    function decimals() external view returns (uint8);
}

interface ComptrollerInterface {
    function enterMarkets(address[] calldata cTokens) external returns (uint[] memory);
    function markets(address) external view returns (bool, uint);
    function getAssetsIn(address) external view returns (address[] memory);
    function getAccountLiquidity(address) external view returns (uint, uint, uint);
    function claimComp(address[] memory holders, address[] memory cTokens, bool borrowers, bool suppliers) external;
    function claimComp(address holder) external;
    function getCompAddress() external view returns (address);
}   

interface CErc20Interface {
    function mint(uint mintAmount) external returns (uint);
    function borrow(uint borrowAmount) external returns (uint);
    function redeem(uint redeemTokens) external returns (uint);
    function redeemUnderlying(uint redeemAmount) external returns (uint);
    function repayBorrow(uint repayAmount) external returns (uint);
    function borrowBalanceCurrent(address account) external returns (uint);
    function underlying() external view returns (address);
}

contract CompoundMultiple is Ownable, Exponential {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public constant UNITROLLER = address(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
    address public constant CUSDC = address(0x39AA39c021dfbaE8faC545936693aC917d5E7563);

    function cTokenBalance()
        public
        view
        returns (uint)
    {
        return IERC20(CUSDC).balanceOf(address(this));
    }

    function underlyingBalance(CUSDC)
        public
        view
        returns (uint)
    {
        address underlying = CErc20Interface(CUSDC).underlying();
        return IERC20(underlying).balanceOf(address(this));
    }

    function compBalance()
        public
        view
        returns (uint)
    {
        return IERC20(ComptrollerInterface(UNITROLLER).getCompAddress()).balanceOf(address(this));
    }
    
    function transferAsset(address asset_, address to_, uint256 amount_)
        public
        onlyOwner
    {
        IERC20(asset_).transfer(to_, amount_);
    }

    function safeTransferAsset(address asset_, address to_, uint256 amount_)
        public
        onlyOwner
    {
        IERC20(asset_).safeTransfer(to_, amount_);
    }

    function claimComp(address[] memory holders, address[] memory cTokens, bool borrowers, bool suppliers)
        public
        onlyOwner
    {
        ComptrollerInterface(UNITROLLER).claimComp(holders, cTokens, borrowers, suppliers);
    }

    function claimComp()
        public
        onlyOwner
    {
        ComptrollerInterface(UNITROLLER).claimComp(address(this));
    }

    function claimAndTransferAllComp(address to_)
        public
        onlyOwner
    {
        claimComp();
        IERC20 compToken = IERC20(ComptrollerInterface(UNITROLLER).getCompAddress());
        uint256 balance = compToken.balanceOf(address(this));
        compToken.safeTransfer(to_, balance);
    }

    function emergencyTransferAll(address[] memory tokens_, address to_)
        public
        onlyOwner
    {
        uint ercLen = tokens_.length;
        for (uint i = 0; i < ercLen; i++) {
            IERC20 erc = IERC20(tokens_[i]);
            uint256 balance = erc.balanceOf(address(this));
            if (balance > 0) {
                erc.safeTransfer(to_, balance);
            }
        }
    }

    // function enterMarkets(address[] memory _arrayForEnterMarkets)
    //     public
    //     onlyOwner
    // {
    //     ComptrollerInterface(UNITROLLER).enterMarkets(_arrayForEnterMarkets);
    // }

    // 3 typical cases:
    // minAmountIn = 15000$ (this goes for multiple iterations: mint, borrow, mint, borrow, ..., mint until the last mint was for a sum smaller than 15000$)
    // minAmountIn = amountIn (this goes for one iteration: mint, borrow, mint)
    // minAmountIn = uint(-1) (this goes for zero iterations: mint)
    function mintMultiple(uint amountIn, uint minAmountIn, uint _amountToBorrowNum, uint _amountToBorrowDenom) 
        external
        onlyOwner
    {
        address usdc = CErc20Interface(CUSDC).underlying();
        // approve token for mint
        if (IERC20(usdc).allowance(address(this), CUSDC) != uint(-1)) {
            IERC20(usdc).approve(CUSDC, uint(-1));
        }
            
        // enable cToken as collateral
        address[] memory arrayForEnterMarkets = new address[](1);
        arrayForEnterMarkets[0] = CUSDC;
        ComptrollerInterface(UNITROLLER).enterMarkets(arrayForEnterMarkets);
        
        require(IERC20(usdc).balanceOf(address(this)) >= amountIn, "not enough tokens");
        uint _amountIn = amountIn;
        if (_amountIn == 0) {
            _amountIn = IERC20(usdc).balanceOf(address(this));
        }
        
        uint decimals = 6;

        uint amountToBorrowMantissa;
        uint amountInCurr = _amountIn;
        while (amountInCurr >= minAmountIn) {
            CErc20Interface(CUSDC).mint(amountInCurr);
            (, amountToBorrowMantissa, ) = ComptrollerInterface(UNITROLLER).getAccountLiquidity(address(this)); // 18 decimals
            uint amountToBorrow = MantissaToUSDC(amountToBorrowMantissa); // 6 decimals TODO make sure that's actuall 6
            
            // keep tokens aside
            amountToBorrow = amountToBorrow.mul(_amountToBorrowNum).div(_amountToBorrowDenom);

            CErc20Interface(CUSDC).borrow(amountToBorrow);

            amountInCurr = IERC20(usdc).balanceOf(address(this));
        }
        CErc20Interface(CUSDC).mint(amountInCurr);
    }

    function redeemMultiple()
        external
        onlyOwner
    {
        require(IERC20(CUSDC).balanceOf(address(this)) > 0, "cUSDC balance = 0");
        
        address usdc = CErc20Interface(CUSDC).underlying();
        // approve USDC for repayBorrow
        if (IERC20(usdc).allowance(address(this), CUSDC) != uint(-1)) {
            IERC20(usdc).approve(CUSDC, uint(-1));
        }
        
        (, uint collateralFactorMantissa) = ComptrollerInterface(UNITROLLER).markets(CUSDC);
        
        uint decimals = 6;

        uint amountToRepayFirst = IERC20(usdc).balanceOf(address(this));
        uint borrowBalance = CErc20Interface(CUSDC).borrowBalanceCurrent(address(this));
        while (borrowBalance > 0) {
            (, uint accountLiquidityMantissa, ) = ComptrollerInterface(UNITROLLER).getAccountLiquidity(address(this));
            (, Exp memory amountToRedeemExp) = getExp(accountLiquidityMantissa, collateralFactorMantissa);
            
            uint amountToRedeem = MantissaToUSDC(amountToRedeemExp.mantissa);
            
            CErc20Interface(CUSDC).redeemUnderlying(amountToRedeem);
            if (amountToRedeem.add(amountToRepayFirst) > borrowBalance) {
                CErc20Interface(CUSDC).repayBorrow(uint(-1));
            } else {
                CErc20Interface(CUSDC).repayBorrow(amountToRedeem.add(amountToRepayFirst));
            }
            amountToRepayFirst = 0;
            borrowBalance = CErc20Interface(CUSDC).borrowBalanceCurrent(address(this));
        }
        uint cTokenToRedeem = IERC20(CUSDC).balanceOf(address(this));
        CErc20Interface(CUSDC).redeem(cTokenToRedeem);
    }
    
    function MantissaToUSDC(uint amountMantissa) 
        internal
        pure
        returns (uint)
    {
        return amountMantissa.div(10**12);
    }
}