#!/usr/bin/env node

import { Command } from 'commander';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CONTRACT_ADDRESS, Server, Web3VPNABI, serializeUsage, signUsage } from './common'
import { generateClientConfig } from './client';
import * as fs from 'fs';
import * as path from 'path';

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
  .option('--server <serverAddr>', 'VPN server address', 'http://127.0.0.1:3000')
  .option('--wg-dir <directory>', 'WireGuard directory', DEFAULT_WG_DIR)
  .option('--wg-public-key <filename>', 'WireGuard public key filename', DEFAULT_WG_PUBLIC_KEY_FILENAME)
  .option('--wg-private-key <filename>', 'WireGuard private key filename', DEFAULT_WG_PRIVATE_KEY_FILENAME)
  .option('--private-key <filename>', 'Web3 private key filename', DEFAULT_WEB3_PRIVATE_KEY_FILENAME)

// Define commands
program
  .command('connect')
  .description('Connect to a VPN server')
  .action(async () => {
    const server = program.opts().server;
    const privateKeyFilename = program.opts().privateKey || DEFAULT_WEB3_PRIVATE_KEY_FILENAME;
    const wgPrivateKeyFilename = program.opts().wgPrivateKey || DEFAULT_WG_PRIVATE_KEY_FILENAME;
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

    // Read WireGuard private key
    let wgPrivateKey: string;
    try {
      wgPrivateKey = fs.readFileSync(wgPrivateKeyFilename, 'utf8').trim();
    } catch (error: any) {
      console.error('Failed to read WireGuard private key:', error);
      return;
    }

    // Read WireGuard public key
    let wgPublicKey: string;
    try {
      wgPublicKey = fs.readFileSync(wgPublicKeyFilename, 'utf8').trim();
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
    console.log(`Using client public key: ${wgPublicKey}`);

    const httpModule = require('http');
    const querystring = require('querystring');

    const postData = querystring.stringify({
      vpnId: vpnId,
      clientPublicKey: wgPublicKey,
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
            const serverPublicKey = response.serverPublicKey;
            try {
              // Generate WireGuard config
              const wgDir = program.opts().wgDir || DEFAULT_WG_DIR;
              const vpnInterface = `wg${vpnId}`;
              const configPath = path.join(wgDir, `${vpnInterface}.conf`);

              const config = generateClientConfig(
                vpnId,
                serverPublicKey,
                wgPrivateKey,
                server.split(':')[0] + ':' + (50000 + vpnId),
              );

              // Ensure wgDir exists
              if (!fs.existsSync(wgDir)) {
                fs.mkdirSync(wgDir, { recursive: true });
              }

              // Write config to file
              fs.writeFileSync(configPath, config, { mode: 0o600 });
              console.log(`WireGuard config written to ${configPath}`);

              // Launch connection using wg-quick
              const { exec } = require('child_process');
              exec(`wg-quick up ${configPath}`, (error: any, stdout: string, stderr: string) => {
                if (error) {
                  console.error(`Failed to launch WireGuard connection: ${error.message}`);
                  console.error(stderr);
                  return;
                }
                console.log(`WireGuard connection established:\n${stdout}`);
              });
            } catch (err: any) {
              console.error('Failed to generate or launch WireGuard config:', err);
            }
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
  .action(async () => {
    console.log('Disconnecting from VPN...');
    const serverAddr = program.opts().server;
    const wgDir = program.opts().wgDir || DEFAULT_WG_DIR;
    const privateKeyFilename = program.opts().privateKey || DEFAULT_WEB3_PRIVATE_KEY_FILENAME;

    // Read private key for signing
    let privateKey: `0x${string}`;
    try {
      const rawPrivateKey = fs.readFileSync(privateKeyFilename, 'utf8').trim();
      privateKey = rawPrivateKey.startsWith('0x') ? rawPrivateKey as `0x${string}` : `0x${rawPrivateKey}`;
    } catch (error: any) {
      console.error('Failed to read private key:', error);
      return;
    }

    // Create wallet client for signing
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: garfieldTestnet,
      transport: http(),
    });

    // Get list of wireguard interfaces
    const { execSync } = require('child_process');

    try {
      // Extract wireguard interface names
      const ipLinkOutput = execSync('ip link show | grep -o "wg[0-9]*"').toString().trim();
      const wgInterfaces = ipLinkOutput.split('\n');

      if (wgInterfaces.length === 0 || (wgInterfaces.length === 1 && wgInterfaces[0] === '')) {
        console.log('No active WireGuard interfaces found. VPN is already disconnected.');
        return;
      }

      // Disconnect first interface found
      const wgInterface = wgInterfaces[0];
      const vpnId = wgInterface.replace('wg', '');
      console.log(`Disconnecting from interface: ${wgInterface} (VPN ID: ${vpnId})`);

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

      // Get server address
      let clientUsage;
      try {
        // Make HTTP request to get server address
        const getServerAddress = () => {
          return new Promise<string>((resolve, reject) => {
            const httpModule = require('http');
            const options = {
              hostname: serverAddr.split(':')[0],
              port: parseInt(serverAddr.split(':')[1]) || 3000,
              path: '/address',
              method: 'GET',
            };
            const req = httpModule.request(options, (res: any) => {
              let data = '';

              res.on('data', (chunk: any) => {
                data += chunk;
              });

              res.on('end', () => {
                if (res.statusCode === 200) {
                  try {
                    const response = JSON.parse(data);
                    resolve(response.address);
                  } catch (error) {
                    reject(new Error(`Failed to parse server address: ${error}`));
                  }
                } else {
                  reject(new Error(`Failed to get server address: HTTP ${res.statusCode}`));
                }
              });
            });

            req.on('error', (error: any) => {
              reject(error);
            });

            req.end();
          });
        };

        const serverWeb3Addr = await getServerAddress();
        console.log(`Retrieved server address: ${serverWeb3Addr}`);

        // Get bytesUsed from wg show <interface> transfer
        let bytesUsed = BigInt(0);
        try {
          const wgDetails = execSync(`wg show ${wgInterface} transfer`, { encoding: 'utf8' }).split(/\s+/);
          // wgDetails[1] = rx, wgDetails[2] = tx
          const inbound = parseInt(wgDetails[1], 10);
          const outbound = parseInt(wgDetails[2], 10);
          bytesUsed = BigInt(inbound + outbound);
        } catch (err: any) {
          console.error(`Failed to get transfer stats for ${wgInterface}:`, err);
          // fallback to 0
          bytesUsed = BigInt(0);
        }

        clientUsage = {
          serverAddr: serverWeb3Addr as `0x${string}`,
          clientAddr: account.address,
          bytesUsed: bytesUsed,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        };
      } catch (error: any) {
        console.error('Failed to get server address:', error.message);
        return;
      }

      // Sign client usage
      let clientSignature;
      try {
        clientSignature = await signUsage(clientUsage, account);
        console.log(`Client usage signature generated`);
      } catch (error: any) {
        console.error('Failed to sign client usage:', error);
        return;
      }

      // Make HTTP POST request to stop the VPN
      const httpModule = require('http');
      const querystring = require('querystring');

      console.log(`clientUsage: ${serializeUsage(clientUsage)}, clientSignature: ${clientSignature}`);
      const postData = querystring.stringify({
        vpnId: vpnId,
        address: account.address,
        signature: signature,
        clientUsageRaw: serializeUsage(clientUsage),
        clientSignature: clientSignature
      });

      const requestOptions = {
        hostname: serverAddr.split(':')[0],
        port: parseInt(serverAddr.split(':')[1]) || 3000,
        path: '/vpn/stop',
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
              console.log('VPN disconnected successfully!');
              console.log('Server response:', response);
            } catch (error: unknown) {
              console.error('Error parsing server response:', error);
            }
          } else {
            console.error(`Failed to disconnect: HTTP ${res.statusCode}`);
            console.error('Response:', data);
          }
        });
      });

      req.on('error', (error: any) => {
        console.error('Disconnection request failed:', error.message);
      });

      req.write(postData);
      req.end();

      // Bring down the WireGuard interface using wg-quick
      try {
        const { execSync } = require('child_process');
        const configPath = path.join(wgDir, `${wgInterface}.conf`);
        execSync(`wg-quick down ${configPath}`);
        console.log(`WireGuard interface ${wgInterface} brought down successfully using config ${configPath}.`);
      } catch (err: any) {
        console.error(`Failed to bring down WireGuard interface ${wgInterface}:`, err.message);
      }

    } catch (error: any) {
      console.error('Failed to disconnect:', error);
    }
  });

program
  .command('status')
  .description('Check VPN connection status')
  .action(async () => {
    console.log('Checking VPN connection status...');
    const serverAddr = program.opts().server;

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
        // Read private key for signing
        const privateKeyFilename = program.opts().privateKey || DEFAULT_WEB3_PRIVATE_KEY_FILENAME;
        let privateKey: `0x${string}`;
        try {
          const rawPrivateKey = fs.readFileSync(privateKeyFilename, 'utf8').trim();
          privateKey = rawPrivateKey.startsWith('0x') ? rawPrivateKey as `0x${string}` : `0x${rawPrivateKey}`;
        } catch (error: any) {
          console.error('Failed to read private key:', error);
          continue;
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
        let signature;
        try {
          signature = await walletClient.signMessage({
            message,
          });
        } catch (error: any) {
          console.error('Failed to sign message:', error);
          continue;
        }

        const url = `${serverAddr}/vpn/status?vpnId=${vpnId}&address=${encodeURIComponent(account.address)}&signature=${encodeURIComponent(signature)}`;

        httpModule.get(url, (res: any) => {
          console.log(`Get ${url}`)
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
  .command('transfer')
  .description('Query VPN transfer usage for a given VPN ID')
  .action(async () => {
    const serverAddr = program.opts().server;
    // Read private key for signing
    const privateKeyFilename = program.opts().privateKey || DEFAULT_WEB3_PRIVATE_KEY_FILENAME;
    let privateKey: `0x${string}`;
    try {
      const rawPrivateKey = fs.readFileSync(privateKeyFilename, 'utf8').trim();
      privateKey = rawPrivateKey.startsWith('0x') ? rawPrivateKey as `0x${string}` : `0x${rawPrivateKey}`;
    } catch (error: any) {
      console.error('Failed to read private key:', error);
      return;
    }

    // Create wallet client for signing
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: garfieldTestnet,
      transport: http(),
    });

    // Get list of wireguard interfaces
    const { execSync } = require('child_process');
    let vpnId: string | undefined;
    try {
      // Extract wireguard interface names
      const ipLinkOutput = execSync('ip link show | grep -o "wg[0-9]*"').toString().trim();
      const wgInterfaces = ipLinkOutput.split('\n');
      if (wgInterfaces.length === 0 || (wgInterfaces.length === 1 && wgInterfaces[0] === '')) {
        console.log('No active WireGuard interfaces found. VPN is disconnected.');
        return;
      }
      // Use the first interface found
      vpnId = wgInterfaces[0].replace('wg', '');
      console.log(`Using WireGuard interface: ${wgInterfaces[0]} (VPN ID: ${vpnId})`);
    } catch (error: any) {
      console.error('Failed to check WireGuard interfaces:', error);
      return;
    }

    // Sign a message with the wallet
    const message = `It is ${account.address}`;
    let signature;
    try {
      signature = await walletClient.signMessage({
        message,
      });
    } catch (error: any) {
      console.error('Failed to sign message:', error);
      return;
    }

    // Build URL for GET /vpn/transfer
    const url = `${serverAddr}/vpn/transfer?vpnId=${encodeURIComponent(vpnId!)}&address=${encodeURIComponent(account.address)}&signature=${encodeURIComponent(signature)}`;

    const httpModule = require('http');
    httpModule.get(url, (res: any) => {
      console.log(`Get ${url}`)
      let data = '';

      res.on('data', (chunk: any) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            console.log(`Transfer usage for VPN ID ${vpnId}:`);
            console.log(response);
          } catch (error: unknown) {
            console.error('Error parsing server response:', error);
          }
        } else {
          console.error(`Failed to get transfer usage: HTTP ${res.statusCode}`);
          console.error('Response:', data);
        }
      });
    }).on('error', (error: any) => {
      console.error('Transfer usage request failed:', error);
    });
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
