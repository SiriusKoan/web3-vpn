import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import { Server, Usage } from './common';
import * as fs from 'fs';
import * as path from 'path';

// Import the Provider class from provider.ts
const Provider = require('./provider').Provider;

// Type declarations for Koa context and next function
type KoaContext = any;
type KoaNext = () => Promise<void>;

export class VpnServer {
  private app: any;
  private router: any;
  private provider: any;
  private port: number;
  private serverInstance: any = null;

  constructor(port: number) {
    this.port = port;
    this.app = new Koa();
    this.router = new Router();
    this.provider = new Provider('../wg-test', '../wg-test/privatekey');

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

  private setupRoutes() {
    // Start VPN service
    this.router.post('/vpn/start', async (ctx: KoaContext) => {
      const { vpnId, clientPublicKey } = ctx.request.body;

      if (!vpnId) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'VPN ID is required' };
        return;
      }

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
          message: `VPN service with ID ${vpnId} started successfully`,
          vpnId,
          interfaceName: this.provider['interfaceName']
        };
      } catch (error: any) {
        ctx.status = 500;
        ctx.body = { success: false, message: error.message };
      }
    });

    // Stop VPN service
    this.router.post('/vpn/stop', async (ctx: KoaContext) => {
      const { vpnId } = ctx.request.body;

      if (!vpnId) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'VPN ID is required' };
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
        ctx.body = { success: true, message: `VPN service with ID ${vpnId} stopped successfully` };
      } catch (error: any) {
        ctx.status = 500;
        ctx.body = { success: false, message: error.message };
      }
    });

    // Get VPN status
    this.router.get('/vpn/status', async (ctx: KoaContext) => {
      const vpnId = ctx.query.vpnId;

      if (!vpnId) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'VPN ID is required' };
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

      if (!vpnId) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'VPN ID is required' };
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
export async function createServer(port: number): Promise<VpnServer> {
  const server = new VpnServer(port);
  await server.start();
  return server;
}
