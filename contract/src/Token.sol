// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract Web3VPNToken is ERC20 {
    constructor() ERC20("Web3VPNToken", "VPNT") {
        _mint(msg.sender, 100_000_000_000 * (10 ** 18));
    }
}
