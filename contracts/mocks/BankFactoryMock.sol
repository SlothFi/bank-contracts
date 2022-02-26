// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@slothfi/bank-core/contracts/UniswapV2Factory.sol";

contract BankFactoryMock is UniswapV2Factory {
    constructor(address _feeToSetter) public UniswapV2Factory(_feeToSetter) {}
}
