// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Web3VPNToken} from "./Token.sol";
import "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";

struct Server {
    string endpoint;
    string name;
    address owner;
    uint256 registrationTime;
}

struct Usage {
    address serverAddr;
    address clientAddr;
    uint256 bytesUsed;
    uint256 timestamp;
}

event UsageUploaded(address indexed serverAddr, address indexed clientAddr, uint256 bytesUsed);

contract Web3VPN is EIP712 {
    bytes32 private constant USAGE_TYPEHASH =
        keccak256("Usage(address serverAddr,address clientAddr,uint256 bytesUsed,uint256 timestamp)");

    address public tokenAddress;
    uint256 public submitInterval;
    Server[] public servers;
    mapping(address => uint256) public balances;
    mapping(address => uint256) public lastSubmitTime;

    constructor(address _tokenAddress, uint256 _submitInterval) EIP712("Usage", "1") {
        tokenAddress = _tokenAddress;
        submitInterval = _submitInterval;
    }

    modifier onlyAfterInterval() {
        require(block.timestamp >= lastSubmitTime[msg.sender] + submitInterval, "Must wait for the submit interval");
        _;
    }

    function getServers() public view returns (Server[] memory) {
        return servers;
    }

    function checkClientValid(address owner) public view returns (bool) {
        return balances[owner] >= 1000 * 1e18;
    }

    function getBytePrice() public pure returns (uint256) {
        return 1e18;
    }

    function getMaxUsage(address user) public view returns (uint256) {
        return balances[user] / getBytePrice();
    }

    function _composeServerInfo(string memory _endpoint, string memory _name) internal view returns (Server memory) {
        return Server({endpoint: _endpoint, name: _name, owner: msg.sender, registrationTime: block.timestamp});
    }

    function registerServer(string memory _endpoint, string memory _name) public {
        Server memory newServer = _composeServerInfo(_endpoint, _name);
        servers.push(newServer);
    }

    function deposit(uint256 amount) public {
        require(amount > 0, "Must deposit a positive amount");
        Web3VPNToken(tokenAddress).approve(address(this), amount);
        Web3VPNToken(tokenAddress).transferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
    }

    function withdraw(uint256 amount) public {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        Web3VPNToken(tokenAddress).transfer(msg.sender, amount);
    }

    function submitUsageReport(
        Usage calldata serverUsage,
        Usage calldata clientUsage,
        bytes calldata serverSignature,
        bytes calldata clientSignature
    ) public onlyAfterInterval {
        // Basic validation checks
        require(msg.sender == clientUsage.clientAddr || msg.sender == serverUsage.serverAddr, "Unauthorized sender");
        require(serverUsage.bytesUsed > 0, "Server usage must be greater than zero");
        require(clientUsage.bytesUsed > 0, "Client usage must be greater than zero");
        require(serverUsage.serverAddr == clientUsage.serverAddr, "Server address mismatch");
        require(clientUsage.clientAddr == serverUsage.clientAddr, "Client address mismatch");
        // Check that timestamps are within 20 seconds of each other
        require(serverUsage.timestamp > 0 && clientUsage.timestamp > 0, "Timestamps must be positive");
        require(
            serverUsage.timestamp <= clientUsage.timestamp + 20 && serverUsage.timestamp >= clientUsage.timestamp - 20,
            "Timestamps must be within 20 seconds of each other"
        );
        // Check that both timestamps are within the submit interval
        require(serverUsage.timestamp >= block.timestamp - submitInterval, "Server timestamp too old");
        require(clientUsage.timestamp >= block.timestamp - submitInterval, "Client timestamp too old");

        address serverOwner = serverUsage.serverAddr;
        address clientOwner = clientUsage.clientAddr;

        // Verify signatures
        require(_verifySignature(serverUsage, serverSignature) == serverOwner, "Invalid server signature");
        require(_verifySignature(clientUsage, clientSignature) == clientOwner, "Invalid client signature");

        // Check the difference in bytes used is within 1% or 1000 bytes
        uint256 maxDifference = (serverUsage.bytesUsed * 1) / 100 + 1000;
        require(
            serverUsage.bytesUsed <= clientUsage.bytesUsed + maxDifference
                && serverUsage.bytesUsed >= clientUsage.bytesUsed - maxDifference,
            "Usage mismatch exceeds allowed threshold"
        );

        // Pay the server for the usage
        uint256 bytesUsed = (serverUsage.bytesUsed + clientUsage.bytesUsed) / 2;
        uint256 paymentAmount = bytesUsed * getBytePrice();
        _payToServer(serverOwner, clientOwner, paymentAmount);
        emit UsageUploaded(serverOwner, clientOwner, bytesUsed);
        lastSubmitTime[serverOwner] = block.timestamp;
        lastSubmitTime[clientOwner] = block.timestamp;
    }

    function _verifySignature(Usage calldata usage, bytes calldata signature) internal view returns (address) {
        bytes32 structHash = keccak256(abi.encode(USAGE_TYPEHASH, usage.serverAddr, usage.clientAddr, usage.bytesUsed, usage.timestamp));
        bytes32 digest = _hashTypedDataV4(structHash);
        return ECDSA.recover(digest, signature);
    }

    function _payToServer(address serverOwner, address clientOwner, uint256 amount) internal {
        require(balances[clientOwner] >= amount, "Insufficient balance");
        balances[clientOwner] -= amount;
        balances[serverOwner] += amount;
    }
}
