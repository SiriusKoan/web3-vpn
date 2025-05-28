// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {Web3VPNToken} from "../src/Token.sol";
import {Web3VPN} from "../src/Web3VPN.sol";

contract Web3VPNTest is Test {
    Web3VPNToken token;
    Web3VPN public vpn;

    function setUp() public {
        token = new Web3VPNToken();
        vpn = new Web3VPN(address(token));
    }
}
