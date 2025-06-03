#!/usr/bin/env node

import { Command } from 'commander';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { Server, Web3VPNABI } from './common'
import * as fs from 'fs';
import * as path from 'path';

const CONTRACT_ADDRESS = '0xe07d9c6Ceffda8fA63cEc941E88cee1036f11DE4';
const DEFAULT_WG_DIR = '/opt/web3vpn/wg';
const DEFAULT_WG_PUBLIC_KEY_FILENAME = '/opt/web3vpn/wg/publickey';
const DEFAULT_WG_PRIVATE_KEY_FILENAME = '/opt/web3vpn/wg/privatekey';
const DEFAULT_WEB3_PRIVATE_KEY_FILENAME = '/opt/web3vpn/privatekey';

// Define zircuit garfield testnet
const garfieldTestnet = defineChain({
  id: 48898,
  name: 'Zircuit Garfield Testnet',
  network: 'garfield-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://garfield-testnet.zircuit.com/'],
    },
    public: {
      http: ['https://garfield-testnet.zircuit.com/'],
    },
  },
})

const client = createPublicClient({
  chain: garfieldTestnet,
  transport: http(),
});

// Define the version
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

const program = new Command();

program
  .name('vpn-client')
  .description('A VPN client CLI application')
  .version(packageJson.version || '1.0.0')
  .option('--wg-dir <directory>', 'WireGuard directory', DEFAULT_WG_DIR)
  .option('--wg-public-key <filename>', 'WireGuard public key filename', DEFAULT_WG_PUBLIC_KEY_FILENAME)
  .option('--wg-private-key <filename>', 'WireGuard private key filename', DEFAULT_WG_PRIVATE_KEY_FILENAME)
  .option('--private-key <filename>', 'Web3 private key filename', DEFAULT_WEB3_PRIVATE_KEY_FILENAME)

// Define commands
program
  .command('connect')
  .description('Connect to a VPN server')
  .argument('<server>', 'VPN server to connect to')
  .action(async (server) => {
    const privateKeyFilename = program.opts().privateKey || DEFAULT_WEB3_PRIVATE_KEY_FILENAME;
    const wgPublicKeyFilename = program.opts().wgPublicKey || DEFAULT_WG_PUBLIC_KEY_FILENAME;

    console.log(`Connecting to ${server}...`);
    console.log(`Private key file: ${privateKeyFilename}`);
    console.log(`Public key file: ${wgPublicKeyFilename}`);

    // Read private key for signing
    let privateKey: `0x${string}`;
    try {
      const rawPrivateKey = fs.readFileSync(privateKeyFilename, 'utf8').trim();
      privateKey = rawPrivateKey.startsWith('0x') ? rawPrivateKey as `0x${string}` : `0x${rawPrivateKey}`;
    } catch (error: any) {
      console.error('Failed to read private key:', error);
      return;
    }

    // Read WireGuard public key
    let clientPublicKey: string;
    try {
      clientPublicKey = fs.readFileSync(wgPublicKeyFilename, 'utf8').trim();
    } catch (error: any) {
      console.error('Failed to read WireGuard public key:', error);
      return;
    }

    // Create wallet client for signing
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: garfieldTestnet,
      transport: http(),
    });

    // Sign a message with the wallet
    const message = `It is ${account.address}`;
    console.log(`Signing message: "${message}"`);

    let signature;
    try {
      signature = await walletClient.signMessage({
        message,
      });
      console.log(`Signature generated: ${signature}`);
    } catch (error: any) {
      console.error('Failed to sign message:', error);
      return;
    }

    // Make HTTP POST request to the VPN server
    const vpnId = Math.floor(Math.random() * 250);
    const url = `http://${server}/vpn/start`;

    console.log(`Sending connection request to ${url}`);
    console.log(`Using client public key: ${clientPublicKey}`);

    const httpModule = require('http');
    const querystring = require('querystring');

    const postData = querystring.stringify({
      vpnId: vpnId,
      clientPublicKey: clientPublicKey,
      address: account.address,
      signature: signature,
    });

    const requestOptions = {
      hostname: server.split(':')[0],
      port: parseInt(server.split(':')[1]) || 3000,
      path: '/vpn/start',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = httpModule.request(requestOptions, (res: any) => {
      let data = '';

      res.on('data', (chunk: any) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            console.log('Connection established successfully!');
            console.log('Server response:', response);
          } catch (error: unknown) {
            console.error('Error parsing server response:', error);
          }
        } else {
          console.error(`Failed to connect: HTTP ${res.statusCode}`);
          console.error('Response:', data);
        }
      });
    });

    req.on('error', (error: any) => {
      console.error('Connection failed:', error.message);
    });

    req.write(postData);
    req.end();
  });

program
  .command('disconnect')
  .description('Disconnect from the VPN')
  .action(() => {
    console.log('Disconnecting from VPN...');
    // Implement VPN disconnection logic here
  });

program
  .command('status')
  .description('Check VPN connection status')
  .action(() => {
    console.log('Checking VPN connection status...');

    // Get list of wireguard interfaces
    const { execSync } = require('child_process');

    try {
      // Extract wireguard interface names
      const ipLinkOutput = execSync('ip link show | grep -o "wg[0-9]*"').toString().trim();
      const wgInterfaces = ipLinkOutput.split('\n');

      if (wgInterfaces.length === 0 || (wgInterfaces.length === 1 && wgInterfaces[0] === '')) {
        console.log('No active WireGuard interfaces found. VPN is disconnected.');
        return;
      }

      // For each interface, get the status
      for (const wgInterface of wgInterfaces) {
        const vpnId = wgInterface.replace('wg', '');
        console.log(`Found WireGuard interface: ${wgInterface} (VPN ID: ${vpnId})`);

        // Make HTTP request to check status
        const httpModule = require('http');
        const url = `http://127.0.0.1:3000/vpn/status?vpnId=${vpnId}`;

        httpModule.get(url, (res: any) => {
          let data = '';

          res.on('data', (chunk: any) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const response = JSON.parse(data);
                console.log(`Status for VPN ${vpnId}:`, response);
              } catch (error: unknown) {
                console.error('Error parsing server response:', error);
              }
            } else {
              console.error(`Failed to get status: HTTP ${res.statusCode}`);
              console.error('Response:', data);
            }
          });
        }).on('error', (error: any) => {
          console.error('Status check failed:', error);
        });
      }
    } catch (error: any) {
      console.error('Failed to check WireGuard interfaces:', error);
      console.log('VPN appears to be disconnected.');
    }
  });

program
  .command('list-servers')
  .description('List available VPN servers')
  .option('--full', 'Show full server details')
  .action(async (options) => {
    const results: any = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: Web3VPNABI,
      functionName: 'getServers',
      args: [],
    });
    const servers: Server[] = results.map((server: any) => ({
      endpoint: server.endpoint,
      name: server.name,
      owner: server.owner,
      registrationTime: BigInt(server.registrationTime),
    }));
    console.log('Available VPN Servers:');
    servers.forEach((server) => {
      console.log(`- ${server.name} (${server.endpoint})`);
      if (options.full) {
        console.log(`  Owner: ${server.owner}`);
        console.log(`  Registered: ${new Date(Number(server.registrationTime) * 1000).toLocaleString()}`);
      }
    });
  });

// Parse command line arguments
program.parse(process.argv);

// If no arguments, show help
if (!process.argv.slice(2).length) {
  program.help();
}
