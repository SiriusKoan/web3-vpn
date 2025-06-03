import { createServer } from './server';
import * as path from 'path';
import { Command } from 'commander';

const program = new Command();

program
  .name('web3-vpn-provider')
  .description('Web3 VPN Provider Server')
  .version('1.0.0');

program
  .option('-p, --port <number>', 'HTTP server port', '3000')
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const server = await createServer(port);

      // Graceful shutdown
      const handleShutdown = async () => {
        console.log('\nReceived shutdown signal. Shutting down server...');
        try {
          await server.stop();
          console.log('Server stopped successfully.');
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      };

      process.on('SIGINT', handleShutdown);
      process.on('SIGTERM', handleShutdown);

      console.log(`Server is running on http://localhost:${port}`);
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

// Execute the program
program.parse();
