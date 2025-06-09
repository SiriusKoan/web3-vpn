import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import { serializeUsage, Usage } from './common';
import { verifyMessage } from 'viem';
import { SignableMessage } from 'viem';
import { privateKeyToAccount } from 'viem/accounts'
import { Provider } from './provider';
const fs = require('fs');

// Type declarations for Koa context and next function
type KoaContext = any;
type KoaNext = () => Promise<void>;

export class VpnServer {
  private app: any;
  private router: any;
  private provider: any;
  private port: number;
  private serverInstance: any = null;
  private web3PrivateKey: `0x${string}`;

  constructor(port: number, web3PrivateKeyFile: string) {
    this.port = port;
    this.app = new Koa();
    this.router = new Router();
    this.provider = new Provider('../wg-test/provider', '../wg-test/provider/publickey', '../wg-test/provider/privatekey');

    try {
      let key = fs.readFileSync(web3PrivateKeyFile, 'utf8').trim();
      if (!key.startsWith('0x')) {
        key = '0x' + key;
      }
      this.web3PrivateKey = key;
    } catch (err) {
      throw new Error(`Failed to read private key file: ${err}`);
    }

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(bodyParser());

    // Error handling middleware
    this.app.use(async (ctx: KoaContext, next: KoaNext) => {
      try {
        await next();
      } catch (error: any) {
        ctx.status = error.status || 500;
        ctx.body = {
          success: false,
          message: error.message || 'Internal Server Error',
          error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        };
        ctx.app.emit('error', error, ctx);
      }
    });

    // Logger middleware
    this.app.use(async (ctx: KoaContext, next: KoaNext) => {
      const start = Date.now();
      await next();
      const ms = Date.now() - start;
      console.log(`${ctx.method} ${ctx.url} - ${ms}ms - ${ctx.status}`);
    });
  }

  private async verifySignature(address: `0x${string}`, signature: `0x${string}`, message: SignableMessage): Promise<boolean> {
    try {
      const isValid = await verifyMessage({
        address,
        message,
        signature,
      });
      return isValid;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  private setupRoutes() {
    // Get server address
    this.router.get('/address', async (ctx: KoaContext) => {
      try {
        const account = privateKeyToAccount(this.web3PrivateKey);
        const serverAddress = account.address;
        ctx.body = {
          success: true,
          address: serverAddress
        };
      } catch (error: any) {
        ctx.status = 500;
        ctx.body = { success: false, message: error.message };
      }
    });

    // Start VPN service
    this.router.post('/vpn/start', async (ctx: KoaContext) => {
      const { vpnId, clientPublicKey, address, signature } = ctx.request.body;

      if (!vpnId) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'VPN ID is required' };
        return;
      }

      if (!address || !signature) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Ethereum address and signature are required' };
        return;
      }

      // Verify signature before proceeding
      const isValidSignature = await this.verifySignature(address, signature, `It is ${address}`);
      if (!isValidSignature) {
        ctx.status = 401;
        ctx.body = { success: false, message: 'Invalid signature' };
        return;
      }
      console.log("Signature verified successfully");

      try {
        // Check if the VPN is already running by calling status
        const status = await this.provider.status(vpnId);
        if (status && status.running) {
          ctx.status = 400;
          ctx.body = { success: false, message: `VPN instance with ID ${vpnId} is already running` };
          return;
        }

        await this.provider.start(vpnId, clientPublicKey);
        ctx.body = {
          success: true,
          serverPublicKey: this.provider.serverPublicKey,
          message: `VPN service with ID ${vpnId} started successfully`,
        };
      } catch (error: any) {
        ctx.status = 500;
        ctx.body = { success: false, message: error.message };
      }
    });

    // Stop VPN service
    this.router.post('/vpn/stop', async (ctx: KoaContext) => {
      console.log(ctx.request.body);
      const { vpnId, address, signature, clientUsage, clientSignature }: { vpnId: string; address: `0x${string}`; signature: `0x${string}`; clientUsage: {[key: string]: string}; clientSignature: `0x${string}` } = ctx.request.body;

      if (!vpnId) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'VPN ID is required' };
        return;
      }

      if (!address || !signature) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Ethereum address and signature are required' };
        return;
      }

      if (!clientUsage || !clientSignature) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Client usage data and signature are required' };
        return;
      }

      // Verify signature before proceeding
      const isValidSignature = await this.verifySignature(address, signature, `It is ${address}`);
      if (!isValidSignature) {
        ctx.status = 401;
        ctx.body = { success: false, message: 'Invalid signature' };
        return;
      }

      try {
        // Check if the VPN is running
        const status = await this.provider.status(vpnId);
        if (!status || !status.running) {
          ctx.status = 400;
          ctx.body = { success: false, message: `VPN instance with ID ${vpnId} is not running` };
          return;
        }

        await this.provider.stop(vpnId);

        if (await this.verifySignature(address, clientSignature, serializeUsage(clientUsage))) {
          console.log("Submitting verified usage to contract");
          try {
            const serverUsage = {
              serverAddr: this.provider.getServerAddress() as `0x${string}`,
              clientAddr: address,
              bytesUsed: clientUsage.bytesUsed.toString(),
              timestamp: BigInt(Math.floor(Date.now() / 1000)).toString(),
            };
            const serverSignature = await this.provider.signUsage(serializeUsage(serverUsage));

            // await this.provider.submitUsageReport(
            //   serverUsage,
            //   clientUsage,
            //   serverSignature,
            //   clientSignature
            // );

            console.log(`Usage report submitted for client ${address} with ${clientUsage.bytesUsed} bytes used`);
          } catch (error) {
            console.error("Failed to submit usage report:", error);
          }
        }

        ctx.body = { success: true, message: `VPN service with ID ${vpnId} stopped successfully` };
      } catch (error: any) {
        ctx.status = 500;
        ctx.body = { success: false, message: error.message };
      }
    });

    // Get VPN status
    this.router.get('/vpn/status', async (ctx: KoaContext) => {
      const vpnId = ctx.query.vpnId;
      const address = ctx.query.address;
      const signature = ctx.query.signature;

      if (!vpnId) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'VPN ID is required' };
        return;
      }

      if (!address || !signature) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Ethereum address and signature are required' };
        return;
      }

      // Verify signature before proceeding
      const isValidSignature = await this.verifySignature(address as `0x${string}`, signature as `0x${string}`, `It is ${address}`);
      if (!isValidSignature) {
        ctx.status = 401;
        ctx.body = { success: false, message: 'Invalid signature' };
        return;
      }

      try {
        const status = await this.provider.status(vpnId);
        const isRunning = status && status.running;

        ctx.body = {
          success: true,
          vpnId,
          running: isRunning,
          status: status,
          interfaceName: this.provider['interfaceName']
        };
      } catch (error: any) {
        ctx.status = 500;
        ctx.body = { success: false, message: error.message };
      }
    });

    // Get VPN traffic transfer
    this.router.get('/vpn/transfer', async (ctx: KoaContext) => {
      const vpnId = ctx.query.vpnId;
      const address = ctx.query.address;
      const signature = ctx.query.signature;

      if (!vpnId) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'VPN ID is required' };
        return;
      }

      if (!address || !signature) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Ethereum address and signature are required' };
        return;
      }

      // Verify signature before proceeding
      const isValidSignature = await this.verifySignature(address as `0x${string}`, signature as `0x${string}`, `It is ${address}`);
      if (!isValidSignature) {
        ctx.status = 401;
        ctx.body = { success: false, message: 'Invalid signature' };
        return;
      }

      try {
        const transfer = await this.provider.transfer(vpnId);

        ctx.body = {
          success: true,
          vpnId,
          transfer: transfer,
          interfaceName: this.provider['interfaceName']
        };
      } catch (error: any) {
        ctx.status = 500;
        ctx.body = { success: false, message: error.message };
      }
    });

    // Register routes
    this.app.use(this.router.routes()).use(this.router.allowedMethods());
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.serverInstance = this.app.listen(this.port, () => {
          console.log(`VPN HTTP server is running on port ${this.port}`);
          resolve();
        });
      } catch (error) {
        console.error('Failed to start HTTP server:', error);
        reject(error);
      }
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.serverInstance) {
        this.serverInstance.close((err: any) => {
          if (err) {
            console.error('Error closing HTTP server:', err);
            reject(err);
          } else {
            console.log('HTTP server closed successfully');
            this.serverInstance = null;
            resolve();
          }
        });
      } else {
        console.log('HTTP server is not running');
        resolve();
      }
    });
  }
}

// Export a function to create and start the server
export async function createServer(port: number, web3PrivateKeyFile: string): Promise<VpnServer> {
  const server = new VpnServer(port, web3PrivateKeyFile);
  await server.start();
  return server;
}
