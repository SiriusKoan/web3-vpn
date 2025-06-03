# Web3VPN Provider Server

This project implements a VPN provider server that allows users to establish secure VPN connections using WireGuard. The server includes both a command-line interface and an HTTP API.

## Prerequisites

- Node.js (v14 or later)
- WireGuard installed on the server
- Administrative privileges for network configuration

## Installation

1. Clone the repository
2. Install dependencies:

```bash
cd provider
npm install
```

3. Build the project:

```bash
npm run build
```

## Configuration

Before starting the server, make sure you have:

1. WireGuard properly installed
2. A private key for the server (default location is `/opt/web3vpn/wireguard/privatekey`)

## Usage

### Command-Line Interface

#### Start the VPN Server

```bash
npm start -- start -p 3000 -k /path/to/privatekey -id 1
```

Options:
- `-p, --port <port>`: HTTP server port (default: 3000)
- `-k, --keyPath <keyPath>`: Path to WireGuard private key file (default: /opt/web3vpn/wireguard/privatekey)
- `-id, --providerId <providerId>`: Provider ID (default: 1)

#### Stop the VPN Server

```bash
npm start -- stop -id 1 -k /path/to/privatekey
```

#### Check VPN Status

```bash
npm start -- status -id 1 -k /path/to/privatekey
```

### HTTP API

When the server is running, the following API endpoints are available:

#### Health Check
```
GET /health
```
Returns the health status of the server.

#### Start VPN Service
```
POST /vpn/start
```
Starts the WireGuard VPN service.

#### Stop VPN Service
```
POST /vpn/stop
```
Stops the WireGuard VPN service.

#### Get VPN Status
```
GET /vpn/status
```
Returns the current status of the VPN service.

#### Generate Client Configuration
```
POST /vpn/generate-config
```
Body:
```json
{
  "clientPublicKey": "public_key_here"
}
```
Returns a WireGuard configuration for the client.

## Development

For development, you can use:

```bash
npm run dev -- start -p 3000 -k /path/to/privatekey -id 1
```

## Architecture

The project consists of:

- **Provider**: Core class that manages the WireGuard interface
- **VpnServer**: HTTP server built with Koa.js
- **CLI**: Command-line interface using Commander.js

## License

MIT