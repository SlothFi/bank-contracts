// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import "./deps/IERC20.sol";
import "./deps/ERC20.sol";
import "./deps/SafeMath.sol";
import "./deps/SafeERC20.sol";
import "./deps/ReentrancyGuard.sol";

// The Bank is full of rewards and SLOTH.
// The longer you stay, the more SLOTH you end up with when you leave.
// This contract handles swapping to and from xSLOTH <> SLOTH
contract Bank is ERC20, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    IERC20 public govToken;

    mapping (address => uint256) public timeLocks;

    uint256 EARLY_WITHDRAWL_FEE = 100; // To determine the fee we do x / 10000 so for 1% it's 100/10000
    uint256 WITHDRAWL_FEE_MAX = 10000;
    uint256 FEE_TIMER = 10800; //3 hours

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

        //Write down what time the user can leave with no fee 
        timeLocks[msg.sender] = block.timestamp + FEE_TIMER;
    }

    // Leave the bar. Claim back your SLOTH.
    // Unclocks the staked + gained GovernanceToken and burns xGovernanceToken
    function leave(uint256 _share) public nonReentrant {
        // Gets the amount of xGovernanceToken in existence
        uint256 totalShares = totalSupply();
        // Gets the amount of Governance Tokens in the contract
        uint256 govBalance = govToken.balanceOf(address(this));
        //govBalance / totalShares = ratio of Gov tokens to xTokens

        // Calculates the amount of GovernanceToken the xGovernanceToken is worth
        uint256 bal =_share.mul(govBalance).div(totalShares);

        if(timeLocks[msg.sender] <= block.timestamp) {
            //User takes a withdrawl fee
            uint256 withdrawlFee = EARLY_WITHDRAWL_FEE.div(WITHDRAWL_FEE_MAX);
            bal = bal.sub(withdrawlFee);
        }
        _burn(msg.sender, _share);
        govToken.safeTransfer(msg.sender, bal);
    }

}