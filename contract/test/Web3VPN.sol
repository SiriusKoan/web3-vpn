// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {Web3VPNToken} from "../src/Token.sol";
import {Web3VPN, Server, Usage, UsageUploaded} from "../src/Web3VPN.sol";
import "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";

contract Web3VPNTest is Test {
    Web3VPN public vpn;
    Web3VPNToken public token;

    address public deployer;
    address public serverOwner;
    address public client;

    uint256 public serverOwnerPrivateKey;
    uint256 public clientPrivateKey;

    uint256 public initialTokenAmount = 1000000 * 1e18;
    uint256 public depositAmount = 10000 * 1e18;

    // Sample server data
    string public serverEndpoint = "https://vpn-server.example.com";
    string public serverName = "Test VPN Server";

    function setUp() public {
        vm.warp(1000000);

        // Setting up accounts
        deployer = address(this);

        // Create server owner and client accounts with private keys for signing
        serverOwnerPrivateKey = 0x1234;
        serverOwner = vm.addr(serverOwnerPrivateKey);

        clientPrivateKey = 0x5678;
        client = vm.addr(clientPrivateKey);

        token = new Web3VPNToken();
        vpn = new Web3VPN(address(token), 120);

        // Fund accounts with tokens
        token.transfer(serverOwner, initialTokenAmount);
        token.transfer(client, initialTokenAmount);

        // Set up vm labels for better trace output
        vm.label(address(vpn), "Web3VPN");
        vm.label(address(token), "Web3VPNToken");
        vm.label(serverOwner, "Server Owner");
        vm.label(client, "Client");
    }

    function registerTestServer() public {
        vm.startPrank(serverOwner);
        vpn.registerServer(serverEndpoint, serverName);
        vm.stopPrank();
    }

    function depositTokens(address user, uint256 amount) public {
        vm.startPrank(user);
        token.approve(address(vpn), amount);
        vpn.deposit(amount);
        vm.stopPrank();
    }

    // Helper function to create a signature for a usage report
    function signUsage(Usage memory usage, uint256 signerPrivateKey) public view returns (bytes memory) {
        bytes32 USAGE_TYPEHASH = keccak256("Usage(address serverAddr,address clientAddr,uint256 bytesUsed,uint256 timestamp)");

        bytes32 structHash = keccak256(abi.encode(USAGE_TYPEHASH, usage.serverAddr, usage.clientAddr, usage.bytesUsed, usage.timestamp));

        // EIP712 domain separator is handled by the _hashTypedDataV4 function in the contract
        bytes32 digest = _hashTypedDataV4(structHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Usage")),
                keccak256(bytes("1")),
                block.chainid,
                address(vpn)
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function createUsage(address _server, address _client, uint256 bytesUsed, uint256 timestamp)
        public
        pure
        returns (Usage memory)
    {
        return Usage({serverAddr: _server, clientAddr: _client, bytesUsed: bytesUsed, timestamp: timestamp});
    }

    function testSetupComplete() public view {
        assertEq(token.balanceOf(serverOwner), initialTokenAmount);
        assertEq(token.balanceOf(client), initialTokenAmount);

        assertEq(vpn.tokenAddress(), address(token));
    }

    function testServerRegistration() public {
        registerTestServer();

        Server[] memory allServers = vpn.getServers();
        assertEq(allServers.length, 1);
        assertEq(allServers[0].endpoint, serverEndpoint);
        assertEq(allServers[0].name, serverName);
        assertEq(allServers[0].owner, serverOwner);
    }

    function testGetBytePrice() public view {
        uint256 bytePrice = vpn.getBytePrice();
        assertEq(bytePrice, 1e18);
    }

    function testGetMaxUsage() public {
        depositTokens(client, depositAmount);

        uint256 maxUsage = vpn.getMaxUsage(client);
        assertEq(maxUsage, depositAmount / vpn.getBytePrice());
    }

    function testDeposit() public {
        assertEq(vpn.balances(client), 0);

        depositTokens(client, depositAmount);
        assertEq(vpn.balances(client), depositAmount);
    }

    function testSubmitUsageReport() public {
        // Init
        registerTestServer();
        depositTokens(client, depositAmount);

        // Create matching usage reports from server and client
        uint256 bytesUsed = 5000;
        Usage memory serverUsage = createUsage(serverOwner, client, bytesUsed, block.timestamp);
        Usage memory clientUsage = createUsage(serverOwner, client, bytesUsed, block.timestamp);

        // Sign the usage reports
        bytes memory serverSignature = signUsage(serverUsage, serverOwnerPrivateKey);
        bytes memory clientSignature = signUsage(clientUsage, clientPrivateKey);

        // Record balances before usage report
        uint256 serverBalanceBefore = vpn.balances(serverOwner);
        uint256 clientBalanceBefore = vpn.balances(client);

        // Submit the usage report
        vm.startPrank(serverOwner);
        vm.expectEmit(true, true, false, true);
        emit UsageUploaded(serverOwner, client, bytesUsed);
        vpn.submitUsageReport(serverUsage, clientUsage, serverSignature, clientSignature);
        vm.stopPrank();

        // Verify balances after usage report
        uint256 paymentAmount = bytesUsed * vpn.getBytePrice();
        assertEq(vpn.balances(serverOwner), serverBalanceBefore + paymentAmount);
        assertEq(vpn.balances(client), clientBalanceBefore - paymentAmount);
    }

    function testSubmitUsageReportMismatch() public {
        // Init
        registerTestServer();
        depositTokens(client, depositAmount);

        // Create matching usage reports from server and client
        Usage memory serverUsage = createUsage(serverOwner, client, 6000, block.timestamp);
        Usage memory clientUsage = createUsage(serverOwner, client, 4000, block.timestamp);

        // Sign the usage reports
        bytes memory serverSignature = signUsage(serverUsage, serverOwnerPrivateKey);
        bytes memory clientSignature = signUsage(clientUsage, clientPrivateKey);

        // Submit the usage report and expect revert due to usage mismatch
        vm.startPrank(serverOwner);
        vm.expectRevert("Usage mismatch exceeds allowed threshold");
        vpn.submitUsageReport(serverUsage, clientUsage, serverSignature, clientSignature);
        vm.stopPrank();
    }

    function testSubmitUsageReportWithinInterval() public {
        // Init
        registerTestServer();
        depositTokens(client, depositAmount);

        // Create matching usage reports from server and client
        uint256 bytesUsed = 5000;
        Usage memory serverUsage = createUsage(serverOwner, client, bytesUsed, block.timestamp);
        Usage memory clientUsage = createUsage(serverOwner, client, bytesUsed, block.timestamp);

        // Sign the usage reports
        bytes memory serverSignature = signUsage(serverUsage, serverOwnerPrivateKey);
        bytes memory clientSignature = signUsage(clientUsage, clientPrivateKey);

        // Record balances before usage report
        uint256 serverBalanceBefore = vpn.balances(serverOwner);
        uint256 clientBalanceBefore = vpn.balances(client);

        // Submit the usage report
        vm.startPrank(serverOwner);
        vm.expectEmit(true, true, false, true);
        emit UsageUploaded(serverOwner, client, bytesUsed);
        vpn.submitUsageReport(serverUsage, clientUsage, serverSignature, clientSignature);
        vm.stopPrank();

        // Verify balances after usage report
        uint256 paymentAmount = bytesUsed * vpn.getBytePrice();
        assertEq(vpn.balances(serverOwner), serverBalanceBefore + paymentAmount);
        assertEq(vpn.balances(client), clientBalanceBefore - paymentAmount);

        // Attempt to submit again within the interval
        vm.startPrank(serverOwner);
        vm.expectRevert("Must wait for the submit interval");
        vpn.submitUsageReport(serverUsage, clientUsage, serverSignature, clientSignature);
        vm.stopPrank();

        vm.startPrank(client);
        vm.expectRevert("Must wait for the submit interval");
        vpn.submitUsageReport(serverUsage, clientUsage, serverSignature, clientSignature);
        vm.stopPrank();
    }

    function testSubmitUsageReportTooOld() public {
        // Init
        registerTestServer();
        depositTokens(client, depositAmount);

        // Create usage reports with timestamps too old
        uint256 bytesUsed = 5000;
        Usage memory serverUsage = createUsage(serverOwner, client, bytesUsed, block.timestamp - 200);
        Usage memory clientUsage = createUsage(serverOwner, client, bytesUsed, block.timestamp - 200);

        // Sign the usage reports
        bytes memory serverSignature = signUsage(serverUsage, serverOwnerPrivateKey);
        bytes memory clientSignature = signUsage(clientUsage, clientPrivateKey);

        // Attempt to submit the usage report and expect revert
        vm.startPrank(serverOwner);
        vm.expectRevert("Server timestamp too old");
        vpn.submitUsageReport(serverUsage, clientUsage, serverSignature, clientSignature);
        vm.stopPrank();
    }

    function testWithdraw() public {
        depositTokens(serverOwner, depositAmount);

        uint256 tokenBalanceBefore = token.balanceOf(serverOwner);

        uint256 withdrawAmount = 50 * 1e18;
        vm.startPrank(serverOwner);
        vpn.withdraw(withdrawAmount);
        vm.stopPrank();

        assertEq(vpn.balances(serverOwner), depositAmount - withdrawAmount);
        assertEq(token.balanceOf(serverOwner), tokenBalanceBefore + withdrawAmount);
    }

    function testWithdrawFail() public {
        uint256 withdrawAmount = 50 * 1e18;

        vm.startPrank(serverOwner);
        vm.expectRevert("Insufficient balance");
        vpn.withdraw(withdrawAmount);
        vm.stopPrank();
    }
}
