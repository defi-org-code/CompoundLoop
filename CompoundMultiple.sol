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

    function cTokenBalance(address cToken)
        public
        view
        returns (uint)
    {
        return IERC20(cToken).balanceOf(address(this));
    }

    function underlyingBalance(address cToken)
        public
        view
        returns (uint)
    {
        address underlying = CErc20Interface(cToken).underlying();
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

    // 3 typical cases:
    // minAmountIn = 15000$ (this goes for multiple iterations: mint, borrow, mint, borrow, ..., mint until the last mint was for a sum smaller than 15000$)
    // minAmountIn = amountIn (this goes for one iteration: mint, borrow, mint)
    // minAmountIn = uint(-1) (this goes for zero iterations: mint)
    function mintMultiple(address cToken, uint amountIn, uint minAmountIn, uint _collateralFactor, uint _amountToBorrowNum, uint _amountToBorrowDenom) 
        external
        onlyOwner
    {
        (bool isListed, uint collateralFactor) = ComptrollerInterface(UNITROLLER).markets(cToken);
        require(isListed, "cToken not listed");
        require(collateralFactor == _collateralFactor, "unexpected collateral factor");

        address underlying = CErc20Interface(cToken).underlying();
        // approve token for mint
        if (IERC20(underlying).allowance(address(this), cToken) != uint(-1)) {
            IERC20(underlying).approve(cToken, uint(-1));
        }
            
        // enable cToken as collateral
        address[] memory arrayForEnterMarkets = new address[](1);
        arrayForEnterMarkets[0] = cToken;
        ComptrollerInterface(UNITROLLER).enterMarkets(arrayForEnterMarkets);
        
        require(IERC20(underlying).balanceOf(address(this)) >= amountIn, "not enough tokens");
        uint _amountIn = amountIn;
        if (_amountIn == 0) {
            _amountIn = IERC20(underlying).balanceOf(address(this));
        }
        
        uint decimals;
        if (IERC20Detailed(underlying).decimals() == 18) {
            decimals = 18;
        } else if (IERC20Detailed(underlying).decimals() == 6) {
            decimals = 6;
        } else {
            require(false, "decimals must be 18 or 6");
        }
        uint amountToBorrowMantissa;
        uint amountInCurr = _amountIn;
        while (amountInCurr >= minAmountIn) {
            CErc20Interface(cToken).mint(amountInCurr);
            (, amountToBorrowMantissa, ) = ComptrollerInterface(UNITROLLER).getAccountLiquidity(address(this));
            uint amountToBorrow;
            if (decimals == 18) {
                amountToBorrow = amountToBorrowMantissa;
            } else {
                amountToBorrow = MantissaToUSDC(amountToBorrowMantissa);
            }
            // keep tokens aside
            amountToBorrow = amountToBorrow.mul(_amountToBorrowNum).div(_amountToBorrowDenom);
            CErc20Interface(cToken).borrow(amountToBorrow);
            amountInCurr = IERC20(underlying).balanceOf(address(this));
        }
        CErc20Interface(cToken).mint(amountInCurr);
    }

    function redeemMultiple(address cToken)
        external
        onlyOwner
    {
        require(IERC20(cToken).balanceOf(address(this)) > 0, "cToken balance = 0");
        
        address underlying = CErc20Interface(cToken).underlying();
        // approve USDC for repayBorrow
        if (IERC20(underlying).allowance(address(this), cToken) != uint(-1)) {
            IERC20(underlying).approve(cToken, uint(-1));
        }
        
        (, uint collateralFactorMantissa) = ComptrollerInterface(UNITROLLER).markets(cToken);
        
        uint decimals;
        if (IERC20Detailed(underlying).decimals() == 18) {
            decimals = 18;
        } else if (IERC20Detailed(underlying).decimals() == 6) {
            decimals = 6;
        } else {
            require(false, "decimals must be 18 or 6");
        }
        uint amountToRepayFirst = IERC20(underlying).balanceOf(address(this));
        uint borrowBalance = CErc20Interface(cToken).borrowBalanceCurrent(address(this));
        while (borrowBalance > 0) {
            (, uint accountLiquidityMantissa, ) = ComptrollerInterface(UNITROLLER).getAccountLiquidity(address(this));
            (, Exp memory amountToRedeemExp) = getExp(accountLiquidityMantissa, collateralFactorMantissa);
            uint amountToRedeemMantissa = amountToRedeemExp.mantissa;
            uint amountToRedeem;
            if (decimals == 18) {
                amountToRedeem = amountToRedeemMantissa;
            } else {
                amountToRedeem = MantissaToUSDC(amountToRedeemMantissa);
            }
            CErc20Interface(cToken).redeemUnderlying(amountToRedeem);
            if (amountToRedeem.add(amountToRepayFirst) > borrowBalance) {
                CErc20Interface(cToken).repayBorrow(uint(-1));
            } else {
                CErc20Interface(cToken).repayBorrow(amountToRedeem.add(amountToRepayFirst));
            }
            amountToRepayFirst = 0;
            borrowBalance = CErc20Interface(cToken).borrowBalanceCurrent(address(this));
        }
        uint cTokenToRedeem = IERC20(cToken).balanceOf(address(this));
        CErc20Interface(cToken).redeem(cTokenToRedeem);
    }
    
    function MantissaToUSDC(uint amountMantissa) 
        internal
        pure
        returns (uint)
    {
        return amountMantissa.div(10**12);
    }
}