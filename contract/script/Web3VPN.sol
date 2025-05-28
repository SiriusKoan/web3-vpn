// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Web3VPNToken} from "../src/Token.sol";
import {Web3VPN} from "../src/Web3VPN.sol";

contract Web3VPNDeploy is Script {
    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        Web3VPNToken token = new Web3VPNToken();
        console.log("Web3VPNToken deployed at:", address(token));

        Web3VPN web3VPN = new Web3VPN(address(token));
        console.log("Web3VPN deployed at:", address(web3VPN));

        vm.stopBroadcast();
    }
}
