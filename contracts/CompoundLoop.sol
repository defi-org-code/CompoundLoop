// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./Exponential.sol";
import "./Interfaces.sol";

contract CompoundLoop is Ownable, Exponential {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // --- fields ---
    address public constant UNITROLLER = address(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
    address public constant CUSDC = address(0x39AA39c021dfbaE8faC545936693aC917d5E7563);
    address public manager;

    // --- events ---
    event ManagerUpdated(address prevManager, address newManager);
    event LogMint(address token, address owner, uint256 tokenAmount);
    event LogBorrow(address token, address owner, uint256 tokenAmount);
    event LogRedeem(address token, address owner, uint256 tokenAmount);
    event LogRedeemUnderlying(address token, address owner, uint256 tokenAmount);
    event LogRepay(address token, address owner, uint256 tokenAmount);

    // --- modifiers ---
    modifier onlyManagerOrOwner() {
        require(msg.sender == manager || msg.sender == owner(), "Caller is not manager or owner");
        _;
    }

    constructor(address _manager) {
        setManager(_manager);
    }

    // --- views ---

    function cTokenBalance() public view returns (uint256) {
        return IERC20(CUSDC).balanceOf(address(this));
    }

    function underlyingBalance() public view returns (uint256) {
        address underlying = CERC20(CUSDC).underlying();
        return IERC20(underlying).balanceOf(address(this));
    }

    function compBalance() public view returns (uint256) {
        return IERC20(Comptroller(UNITROLLER).getCompAddress()).balanceOf(address(this));
    }

    function getAccountLiquidity()
        public
        view
        returns (
            uint256 err,
            uint256 accountLiquidity,
            uint256 accountShortfall
        )
    {
        return Comptroller(UNITROLLER).getAccountLiquidity(address(this));
    }

    // --- unrestricted actions ---

    function claimComp() public {
        Comptroller(UNITROLLER).claimComp(address(this));
    }

    function claimComp(
        address[] memory holders,
        address[] memory cTokens,
        bool borrowers,
        bool suppliers
    ) public {
        Comptroller(UNITROLLER).claimComp(holders, cTokens, borrowers, suppliers);
    }

    // --- main ---

    // 3 typical cases:
    // minAmountIn = amountIn (this goes for one iteration: mint, borrow, mint)
    // minAmountIn < amountIn (this goes for multiple iterations: mint, borrow, mint, borrow, ..., mint until the last mint was for a sum smaller than minAmountIn)
    // minAmountIn = uint(-1) (this goes for zero iterations: mint)
    function enterPosition(
        uint256 amountIn,
        uint256 minAmountIn,
        uint256 borrowRatioNum,
        uint256 borrowRatioDenom
    ) external onlyManagerOrOwner {
        (bool isListed, ) = Comptroller(UNITROLLER).markets(CUSDC);
        require(isListed, "cToken not listed");
        address usdc = CERC20(CUSDC).underlying();
        // approve token for mint
        if (IERC20(usdc).allowance(address(this), CUSDC) != uint256(-1)) {
            IERC20(usdc).approve(CUSDC, uint256(-1));
        }

        // enable cToken as collateral
        address[] memory arrayForEnterMarkets = new address[](1);
        arrayForEnterMarkets[0] = CUSDC;
        Comptroller(UNITROLLER).enterMarkets(arrayForEnterMarkets);

        require(IERC20(usdc).balanceOf(address(this)) >= amountIn, "not enough tokens");
        uint256 _amountIn = amountIn;
        if (_amountIn == 0) {
            _amountIn = IERC20(usdc).balanceOf(address(this));
        }

        uint256 amountToBorrowMantissa;
        uint256 amountInCurr = _amountIn;
        while (amountInCurr >= minAmountIn) {
            require(CERC20(CUSDC).mint(amountInCurr) == 0, "mint has failed");
            (, amountToBorrowMantissa, ) = Comptroller(UNITROLLER).getAccountLiquidity(address(this)); // 18 decimals
            uint256 amountToBorrow = mantissaToUSDC(amountToBorrowMantissa); // 6 decimals

            // keep tokens aside
            amountToBorrow = amountToBorrow.mul(borrowRatioNum).div(borrowRatioDenom);

            require(CERC20(CUSDC).borrow(amountToBorrow) == 0, "borrow has failed");

            amountInCurr = IERC20(usdc).balanceOf(address(this));
        }
        require(CERC20(CUSDC).mint(amountInCurr) == 0, "mint has failed");
    }

    function exitPosition(
        uint256 iterationsLimit,
        uint256 redeemRatioNum,
        uint256 redeemRatioDenom
    ) external onlyManagerOrOwner {
        require(IERC20(CUSDC).balanceOf(address(this)) > 0, "cUSDC balance = 0");

        address usdc = CERC20(CUSDC).underlying();
        // approve USDC for repayBorrow
        if (IERC20(usdc).allowance(address(this), CUSDC) != uint256(-1)) {
            IERC20(usdc).approve(CUSDC, uint256(-1));
        }

        (, uint256 collateralFactorMantissa) = Comptroller(UNITROLLER).markets(CUSDC);

        uint256 amountToRepayFirst = IERC20(usdc).balanceOf(address(this));
        uint256 borrowBalance = CERC20(CUSDC).borrowBalanceCurrent(address(this));

        uint256 currentIteration = 0;

        while (borrowBalance > 0 && currentIteration < iterationsLimit) {
            (, uint256 accountLiquidityMantissa, ) = Comptroller(UNITROLLER).getAccountLiquidity(address(this));
            (, Exp memory amountToRedeemExp) = getExp(accountLiquidityMantissa, collateralFactorMantissa);
            uint256 amountToRedeem = mantissaToUSDC(amountToRedeemExp.mantissa);
            amountToRedeem = amountToRedeem.mul(redeemRatioNum).div(redeemRatioDenom);

            require(CERC20(CUSDC).redeemUnderlying(amountToRedeem) == 0, "something went wrong");
            if (amountToRedeem.add(amountToRepayFirst) > borrowBalance) {
                require(CERC20(CUSDC).repayBorrow(uint256(-1)) == 0, "approved first");
            } else {
                require(CERC20(CUSDC).repayBorrow(amountToRedeem.add(amountToRepayFirst)) == 0, "approved first");
            }
            amountToRepayFirst = 0;
            borrowBalance = CERC20(CUSDC).borrowBalanceCurrent(address(this));
            currentIteration = currentIteration + 1;
        }

        if (borrowBalance == 0) {
            uint256 cTokenToRedeem = IERC20(CUSDC).balanceOf(address(this));
            require(CERC20(CUSDC).redeem(cTokenToRedeem) == 0, "something went wrong");
        }
    }

    // --- internal ---

    function mantissaToUSDC(uint256 amountMantissa) internal pure returns (uint256) {
        return amountMantissa.div(10**12);
    }

    // --- withdraw assets by owner ---

    function claimAndTransferAllComp(address to_) public onlyOwner {
        claimComp();
        IERC20 compToken = IERC20(Comptroller(UNITROLLER).getCompAddress());
        uint256 balance = compToken.balanceOf(address(this));
        compToken.safeTransfer(to_, balance);
    }

    function transferFrom(address src_, uint256 amount_) public onlyOwner {
        IERC20(CERC20(CUSDC).underlying()).transferFrom(src_, address(this), amount_);
    }

    function transferAsset(
        address asset_,
        address to_,
        uint256 amount_
    ) public onlyOwner {
        IERC20(asset_).transfer(to_, amount_);
    }

    function safeTransferAsset(
        address asset_,
        address to_,
        uint256 amount_
    ) public onlyOwner {
        IERC20(asset_).safeTransfer(to_, amount_);
    }

    // --- administration ---

    function setManager(address _newManager) public onlyOwner {
        require(_newManager != address(0), "_newManager is null");
        emit ManagerUpdated(manager, _newManager);
        manager = _newManager;
    }

    function approve() public onlyManagerOrOwner {
        address usdc = CERC20(CUSDC).underlying();
        if (IERC20(usdc).allowance(address(this), CUSDC) != uint256(-1)) {
            IERC20(usdc).approve(CUSDC, uint256(-1));
        }
    }

    function enterMarkets() external onlyManagerOrOwner {
        address[] memory arrayForEnterMarkets = new address[](1);
        arrayForEnterMarkets[0] = CUSDC;
        Comptroller(UNITROLLER).enterMarkets(arrayForEnterMarkets);
    }

    function mintCToken(uint256 tokenAmount) external onlyManagerOrOwner {
        require(CERC20(CUSDC).mint(tokenAmount) == 0, "mint has failed");
        emit LogMint(CUSDC, address(this), tokenAmount);
    }

    function borrow(uint256 tokenAmount) external onlyManagerOrOwner {
        require(CERC20(CUSDC).borrow(tokenAmount) == 0, "borrow has failed");
        emit LogBorrow(CUSDC, address(this), tokenAmount);
    }

    function redeemCToken(uint256 tokenAmount) external onlyManagerOrOwner {
        require(CERC20(CUSDC).redeem(tokenAmount) == 0, "something went wrong");
        emit LogRedeem(CUSDC, address(this), tokenAmount);
    }

    function redeemUnderlying(uint256 tokenAmount) external onlyManagerOrOwner {
        require(CERC20(CUSDC).redeemUnderlying(tokenAmount) == 0, "something went wrong");
        emit LogRedeemUnderlying(CUSDC, address(this), tokenAmount);
    }

    function repayBorrowRaw(uint256 amount) external onlyManagerOrOwner {
        require(CERC20(CUSDC).repayBorrow(amount) == 0, "approve first");
        emit LogRepay(CUSDC, address(this), amount);
    }

    function repayBorrow() external onlyManagerOrOwner {
        uint256 contractUSDCBalance = IERC20(CERC20(CUSDC).underlying()).balanceOf(address(this));
        uint256 borrowBalance = CERC20(CUSDC).borrowBalanceCurrent(address(this));
        if (contractUSDCBalance > borrowBalance) {
            require(CERC20(CUSDC).repayBorrow(uint256(-1)) == 0, "approve first");
            emit LogRepay(CUSDC, address(this), uint256(-1));
        } else {
            require(CERC20(CUSDC).repayBorrow(contractUSDCBalance) == 0, "approve first");
            emit LogRepay(CUSDC, address(this), contractUSDCBalance);
        }
    }

    // --- emergency ---

    function emergencyTransferAll(address[] memory tokens_, address to_) public onlyOwner {
        uint256 ercLen = tokens_.length;
        for (uint256 i = 0; i < ercLen; i++) {
            IERC20 erc = IERC20(tokens_[i]);
            uint256 balance = erc.balanceOf(address(this));
            if (balance > 0) {
                erc.safeTransfer(to_, balance);
            }
        }
    }

    function emergencySubmitTransaction(
        address destination,
        bytes memory data,
        uint256 gasLimit
    ) public onlyOwner returns (bool) {
        uint256 dataLength = data.length;
        bool result;
        // solhint-disable-next-line
        assembly {
            let x := mload(0x40) // memory for output
            let d := add(data, 32) // first 32 bytes are the padded length of data, so exclude that
            result := call(
                gasLimit,
                destination,
                0, // value is ignored
                d,
                dataLength,
                x,
                0 // output is ignored
            )
        }
        return result;
    }
}
