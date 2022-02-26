// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@slothfi/bank-core/contracts/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IGovernanceToken.sol";
import "./interfaces/IMasterBanker.sol";

contract GovernanceVote {
  using SafeMath for uint256;

  string private _name;
  string private _symbol;
  uint8 private _decimals;
  uint8 private _poolId;
  uint8 private _lpMultiplier;
  uint8 private _singleStakingMultiplier;
  uint8 private _govTokenReservePosition;

  IGovernanceToken public govToken;
  IMasterBanker public masterBanker;
  IUniswapV2Pair public lpPair;
  IERC20 public bank;

  constructor(
    string memory name_,
    string memory symbol_,
    IGovernanceToken govToken_,
    IERC20 bank_,
    IMasterBanker masterBanker_,
    uint8 poolId_,
    IUniswapV2Pair lpPair_,
    uint8 govTokenReservePosition_,
    uint8 lpMultiplier_,
    uint8 singleStakingMultiplier_
  ) public {
    _name = name_;
    _symbol = symbol_;
    _decimals = 18;
    govToken = govToken_;
    bank = bank_;
    masterBanker = masterBanker_;
    _poolId = poolId_;
    lpPair = lpPair_;
    _govTokenReservePosition = govTokenReservePosition_;
    _lpMultiplier = lpMultiplier_;
    _singleStakingMultiplier = singleStakingMultiplier_;
  }

  function name() public view virtual returns (string memory) {
      return _name;
  }

  function symbol() public view virtual returns (string memory) {
      return _symbol;
  }

  function decimals() public view virtual returns (uint8) {
      return _decimals;
  }

  function allowance(address, address) public pure returns (uint256) { return 0; }
  function transfer(address, uint256) public pure returns (bool) { return false; }
  function approve(address, uint256) public pure returns (bool) { return false; }
  function transferFrom(address, address, uint256) public pure returns (bool) { return false; }

  function govTokenReserve() public view returns (uint256) {
    (uint256 reserve0, uint256 reserve1,) = lpPair.getReserves();
    uint256 _govTokenReserve = 0;

    if (_govTokenReservePosition == 0) {
      _govTokenReserve = reserve0;
    } else if (_govTokenReservePosition == 1) {
      _govTokenReserve = reserve1;
    }

    return _govTokenReserve;
  }

  function bankRatio() public view returns (uint256) {
    uint256 bankTotalSupply = bank.totalSupply();
    uint256 govTokenBankBalance = govToken.balanceOf(address(bank));
    if (bankTotalSupply > 0 && govTokenBankBalance > 0) {
      return govTokenBankBalance.mul(10 ** 18).div(bankTotalSupply);
    }
    return uint256(1).mul(10 ** 18);
  }

  function adjustedBankValue(uint256 value) public view returns (uint256) {
    return value.mul(bankRatio()).div(10 ** 18);
  }

  function totalSupply() public view returns (uint256) {
    uint256 govTokenCurrentReserve = govTokenReserve();
    uint256 bankTotalSupply = bank.totalSupply();
    uint256 unlockedTotal = govToken.unlockedSupply();
    uint256 lockedTotal = govToken.totalLock();

    uint256 calculatedTotalSupply = 0;

    // govTokenCurrentReserve x _lpMultiplier (e.g. 4) tokens are added to the total supply
    if (govTokenCurrentReserve > 0) {
      calculatedTotalSupply = govTokenCurrentReserve.mul(_lpMultiplier);
    }

    // bankTotalSupply x _singleStakingMultiplier (e.g. 2) tokens are added to the total supply
    if (bankTotalSupply > 0) {
      calculatedTotalSupply = calculatedTotalSupply.add(
        adjustedBankValue(bankTotalSupply).mul(_singleStakingMultiplier)
      );
    }

    // 33% of locked tokens are added to the total supply
    if (lockedTotal > 0) {
      calculatedTotalSupply = calculatedTotalSupply.add(lockedTotal.mul(33).div(100));
    }

    // 25% of unlocked tokens are added to the total supply
    if (unlockedTotal > 0) {
      calculatedTotalSupply = calculatedTotalSupply.add(unlockedTotal.mul(25).div(100));
    }

    return calculatedTotalSupply;
  }

  function balanceOf(address owner) public view returns (uint256) {    
    uint256 votingPower = 0;

    uint256 govTokenCurrentReserve = govTokenReserve();

    (uint256 userLpTokenAmountInPool, ) = masterBanker.userInfo(_poolId, owner);
    uint256 pairTotal = lpPair.totalSupply();
    
    // Calculate lp share voting power
    uint256 userShare = userLpTokenAmountInPool.mul(1e12).div(pairTotal);
    uint256 pairUnderlying = govTokenCurrentReserve.mul(userShare).div(1e12);
    votingPower = pairUnderlying.mul(_lpMultiplier);

    // Add single-staking voting power
    uint256 bankBalance = bank.balanceOf(owner);
    if (bankBalance > 0) {
      votingPower = votingPower.add(
        adjustedBankValue(bankBalance).mul(_singleStakingMultiplier)
      );
    }
    
    // Add locked balance
    uint256 lockedBalance = govToken.lockOf(owner);
    if (lockedBalance > 0) {
      votingPower = votingPower.add(lockedBalance.mul(33).div(100));
    }
    
    // Add unlocked balance
    uint256 govTokenBalance = govToken.balanceOf(owner);
    if (govTokenBalance > 0) {
      votingPower = votingPower.add(govTokenBalance.mul(25).div(100));
    }
    
    return votingPower;
  }
}
