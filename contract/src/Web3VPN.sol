// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

struct Server {
    string endpoint;
    string name;
    address owner;
    uint256 registrationTime;
}

contract Web3VPN {
    address public tokenAddress;
    Server[] public servers;
    Server[] public verifiers;

    constructor(address _tokenAddress) {
        tokenAddress = _tokenAddress;
    }

    function getServers() public view returns (Server[] memory) {
        return servers;
    }

    function getVerifiers() public view returns (Server[] memory) {
        return verifiers;
    }

    function composeServerInfo(string memory _endpoint, string memory _name) internal view returns (Server memory) {
        return Server({
            endpoint: _endpoint,
            name: _name,
            owner: msg.sender,
            registrationTime: block.timestamp
        });
    }

    function registerServer(string memory _endpoint, string memory _name) public {
        Server memory newServer = composeServerInfo(_endpoint, _name);
        servers.push(newServer);
    }

    function registerVerifier(string memory _endpoint, string memory _name) public {
        Server memory newVerifier = composeServerInfo(_endpoint, _name);
        verifiers.push(newVerifier);
    }
}
