// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@slothfi/bank-core/contracts/UniswapV2Pair.sol";

contract BankPairMock is UniswapV2Pair {
    constructor() public UniswapV2Pair() {}
}
