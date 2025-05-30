#!/usr/bin/env node

import { Command } from 'commander';
import { createPublicClient, http, defineChain } from 'viem'
import { Server, Usage, Web3VPNABI, Web3VPNTokenABI } from './common'
import * as fs from 'fs';
import * as path from 'path';

const CONTRACT_ADDRESS = '0xe07d9c6Ceffda8fA63cEc941E88cee1036f11DE4';

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
  .version(packageJson.version || '1.0.0');

// Define commands
program
  .command('connect')
  .description('Connect to a VPN server')
  .argument('<server>', 'VPN server to connect to')
  .option('-p, --password <password>', 'Password for authentication')
  .option('--password-file <file>', 'File containing the password')
  .action((server, options) => {
    console.log(`Connecting to ${server}...`);
    if (!options.password && !options.passwordFile) {
      console.error('Error: Password or password file must be provided.');
      process.exit(1);
    }
    // Implement VPN connection logic here
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
    // Implement status check logic here
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
