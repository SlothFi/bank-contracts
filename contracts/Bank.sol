// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// The Bank is full of rewards and MON.
// The longer you stay, the more MON you end up with when you leave.
// This contract handles swapping to and from xMON <> MON
contract Bank is ERC20, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    IERC20 public govToken;

    // Define the Bank token contract
    constructor(
      string memory _name,
      string memory _symbol,
      IERC20 _govToken
    ) public ERC20(_name, _symbol) {
        govToken = _govToken;
    }

    // Locks GovernanceToken and mints xGovernanceToken
    function enter(uint256 _amount) public nonReentrant {
        // Gets the amount of GovernanceToken locked in the contract
        uint256 totalGovernanceToken = govToken.balanceOf(address(this));
        // Gets the amount of xGovernanceToken in existence
        uint256 totalShares = totalSupply();
        // If no xGovernanceToken exists, mint it 1:1 to the amount put in
        if (totalShares == 0 || totalGovernanceToken == 0) {
            _mint(msg.sender, _amount);
        }
        // Calculate and mint the amount of xGovernanceToken the GovernanceToken is worth. The ratio will change overtime, as xGovernanceToken is burned/minted and GovernanceToken deposited + gained from fees / withdrawn.
        else {
            uint256 what = _amount.mul(totalShares).div(totalGovernanceToken);
            _mint(msg.sender, what);
        }
        // Lock the GovernanceToken in the contract
        govToken.safeTransferFrom(msg.sender, address(this), _amount);
    }

    // Leave the bar. Claim back your MON.
    // Unclocks the staked + gained GovernanceToken and burns xGovernanceToken
    function leave(uint256 _share) public nonReentrant {
        // Gets the amount of xGovernanceToken in existence
        uint256 totalShares = totalSupply();
        // Gets the amount of Governance Tokens in the contract
        uint256 govBalance = govToken.balanceOf(address(this));
        //govBalance / totalShares = ratio of Gov tokens to xTokens

        // Calculates the amount of GovernanceToken the xGovernanceToken is worth
        uint256 bal =_share.mul(govBalance).div(totalShares);

        _burn(msg.sender, _share);
        govToken.safeTransfer(msg.sender, bal);
    }

}
