// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./Exponential.sol";

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

    address public manager;

    event ManagerUpdated(address _prevManager, address _newManager);
    event LogMint(address _token, address _owner, uint tokenAmount);
    event LogBorrow(address _token, address _owner, uint tokenAmount);
    event LogRedeem(address _token, address _owner, uint tokenAmount);
    event LogRedeemUnderlying(address _token, address _owner, uint tokenAmount);
    event LogRepay(address _token, address _owner, uint tokenAmount);

    modifier onlyManagerOrOwner() {
        require(msg.sender == manager || msg.sender == owner(), "Caller is not manager or owner");
        _;
    }

    constructor(address _manager) public
    {
        setManager(_manager);
    }

    function setManager(address _newManager)
        public
        onlyOwner
    {
        require(_newManager != address(0), "role cannot be null address");
        emit ManagerUpdated(manager, _newManager);
        manager = _newManager;
    }

    function cTokenBalance()
        public
        view
        returns (uint)
    {
        return IERC20(CUSDC).balanceOf(address(this));
    }

    function underlyingBalance()
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
    
    function getAccountLiquidity()
        public
        view
        returns (uint accountLiquidity, uint accountShortfall)
    {
        (, accountLiquidity, accountShortfall) = ComptrollerInterface(UNITROLLER).getAccountLiquidity(address(this));
    }        

    function mantissaToUSDC(uint amountMantissa) 
        internal
        pure
        returns (uint)
    {
        return amountMantissa.div(10**12);
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
    {
        ComptrollerInterface(UNITROLLER).claimComp(holders, cTokens, borrowers, suppliers);
    }

    function claimComp()
        public
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

    function setApproval()
        external
        onlyManagerOrOwner
    {
        if (IERC20(CErc20Interface(CUSDC).underlying()).allowance(address(this), CUSDC) != uint(-1)) {
            IERC20(CErc20Interface(CUSDC).underlying()).approve(CUSDC, uint(-1));
        }
    }

    function enterMarkets()
        external
        onlyManagerOrOwner
    {
        address[] memory arrayForEnterMarkets = new address[](1);
        arrayForEnterMarkets[0] = CUSDC;
        ComptrollerInterface(UNITROLLER).enterMarkets(arrayForEnterMarkets);
    }

    function mintCToken(uint tokenAmount)
        external
        onlyManagerOrOwner
    {
        require(CErc20Interface(CUSDC).mint(tokenAmount) == 0, "mint has failed");
        emit LogMint(CUSDC, address(this), tokenAmount);
    }

    function borrow(uint tokenAmount)
        external
        onlyManagerOrOwner
    {
        require(CErc20Interface(CUSDC).borrow(tokenAmount) == 0, "borrow has failed");
        emit LogBorrow(CUSDC, address(this), tokenAmount);
    }

    function redeemCToken(uint tokenAmount)
        external
        onlyManagerOrOwner
    {
        require(CErc20Interface(CUSDC).redeem(tokenAmount) == 0, "something went wrong");
        emit LogRedeem(CUSDC, address(this), tokenAmount);
    }

    function redeemUnderlying(uint tokenAmount)
        external
        onlyManagerOrOwner
    {
        require(CErc20Interface(CUSDC).redeemUnderlying(tokenAmount) == 0, "something went wrong");
        emit LogRedeemUnderlying(CUSDC, address(this), tokenAmount);
    }

    function repayBorrow(uint tokenAmount)
        external
        onlyManagerOrOwner
    {
        uint amountToRepayFirst = IERC20(CErc20Interface(CUSDC).underlying()).balanceOf(address(this));
        uint borrowBalance = CErc20Interface(CUSDC).borrowBalanceCurrent(address(this));   
        if (tokenAmount.add(amountToRepayFirst) > borrowBalance) {
            require(CErc20Interface(CUSDC).repayBorrow(uint(-1)) == 0, "approve first");
            emit LogRepay(CUSDC, address(this), uint(-1));
        } else {
            require(CErc20Interface(CUSDC).repayBorrow(tokenAmount.add(amountToRepayFirst)) == 0, "approve first");
            emit LogRepay(CUSDC, address(this), tokenAmount.add(amountToRepayFirst));
        }
    }

    // 3 typical cases:
    // minAmountIn = 15000$ (this goes for multiple iterations: mint, borrow, mint, borrow, ..., mint until the last mint was for a sum smaller than 15000$)
    // minAmountIn = amountIn (this goes for one iteration: mint, borrow, mint)
    // minAmountIn = uint(-1) (this goes for zero iterations: mint)
    function enterPosition(uint amountIn, uint minAmountIn, uint _amountToBorrowNum, uint _amountToBorrowDenom) 
        external
        onlyManagerOrOwner
    {
        (bool isListed, ) = ComptrollerInterface(UNITROLLER).markets(CUSDC);
        require(isListed, "cToken not listed");
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

        uint amountToBorrowMantissa;
        uint amountInCurr = _amountIn;
        while (amountInCurr >= minAmountIn) {
            require(CErc20Interface(CUSDC).mint(amountInCurr) == 0, "mint has failed");
            (, amountToBorrowMantissa, ) = ComptrollerInterface(UNITROLLER).getAccountLiquidity(address(this)); // 18 decimals
            uint amountToBorrow = mantissaToUSDC(amountToBorrowMantissa); // 6 decimals

            // keep tokens aside
            amountToBorrow = amountToBorrow.mul(_amountToBorrowNum).div(_amountToBorrowDenom);

            require(CErc20Interface(CUSDC).borrow(amountToBorrow) == 0, "borrow has failed");

            amountInCurr = IERC20(usdc).balanceOf(address(this));
        }
        require(CErc20Interface(CUSDC).mint(amountInCurr) == 0, "mint has failed");
    }

    function exitPosition()
        external
        onlyManagerOrOwner
    {
        require(IERC20(CUSDC).balanceOf(address(this)) > 0, "cUSDC balance = 0");

        address usdc = CErc20Interface(CUSDC).underlying();
        // approve USDC for repayBorrow
        if (IERC20(usdc).allowance(address(this), CUSDC) != uint(-1)) {
            IERC20(usdc).approve(CUSDC, uint(-1));
        }
        
        (, uint collateralFactorMantissa) = ComptrollerInterface(UNITROLLER).markets(CUSDC);
        
        uint amountToRepayFirst = IERC20(usdc).balanceOf(address(this));
        uint borrowBalance = CErc20Interface(CUSDC).borrowBalanceCurrent(address(this));
        while (borrowBalance > 0) {
            (, uint accountLiquidityMantissa, ) = ComptrollerInterface(UNITROLLER).getAccountLiquidity(address(this));
            (, Exp memory amountToRedeemExp) = getExp(accountLiquidityMantissa, collateralFactorMantissa);
            
            uint amountToRedeem = mantissaToUSDC(amountToRedeemExp.mantissa);

            require(CErc20Interface(CUSDC).redeemUnderlying(amountToRedeem) == 0, "something went wrong");
            if (amountToRedeem.add(amountToRepayFirst) > borrowBalance) {
                require(CErc20Interface(CUSDC).repayBorrow(uint(-1)) == 0, "approved first");
            } else {
                require(CErc20Interface(CUSDC).repayBorrow(amountToRedeem.add(amountToRepayFirst)) == 0, "approved first");
            }
            amountToRepayFirst = 0;
            borrowBalance = CErc20Interface(CUSDC).borrowBalanceCurrent(address(this));
        }
        uint cTokenToRedeem = IERC20(CUSDC).balanceOf(address(this));
        require(CErc20Interface(CUSDC).redeem(cTokenToRedeem) == 0, "something went wrong");
    }
    
    function emergencySubmitTransaction(address destination, bytes memory data, uint gasLimit)
        public
        onlyOwner
        returns (bool)
    {
        uint dataLength = data.length;
        bool result;
        assembly {
            let x := mload(0x40)   // memory for output
            let d := add(data, 32) // first 32 bytes are the padded length of data, so exclude that
            result := call(
                gasLimit,
                destination,
                0,                  // value is ignored
                d,
                dataLength,
                x,
                0                  // output is ignored
            )
        }
        return result;
    }
}
