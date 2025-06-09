export class Provider {
  private serverConfigDir: string = '/opt/web3vpn/wireguard'
  public serverPublicKeyPath: string = '/opt/web3vpn/wireguard/publickey';
  public serverPublicKey: string = '';
  private serverPrivateKeyPath: string = '/opt/web3vpn/wireguard/privatekey';
  private serverPrivateKey: string = '';

  constructor(serverConfigDir: string, serverPublicKeyPath: string, serverPrivateKeyPath: string) {
    this.serverConfigDir = serverConfigDir;
    this.serverPublicKeyPath = serverPublicKeyPath;
    this.serverPrivateKeyPath = serverPrivateKeyPath;
    this.loadKey();
  }

  loadKey() {
    const fs = require('fs');
    try {
      if (fs.existsSync(this.serverPrivateKeyPath)) {
        this.serverPrivateKey = fs.readFileSync(this.serverPrivateKeyPath, 'utf8').trim();
      } else {
        throw new Error(`Private key file not found at ${this.serverPrivateKeyPath}`);
      }

      if (fs.existsSync(this.serverPublicKeyPath)) {
        this.serverPublicKey = fs.readFileSync(this.serverPublicKeyPath, 'utf8').trim();
      } else {
        throw new Error(`Public key file not found at ${this.serverPublicKeyPath}`);
      }
    } catch (error) {
      console.error('Error loading keys:', error);
      throw error;
    }
  }

  /**
   * Checks if this.interfaceName is currently used by the system using the ip command
   * @returns Promise that resolves to true if the interface exists, false otherwise
   */
   isInterfaceExists(interfaceName: string): boolean {
     try {
       const { execSync } = require('child_process');

       try {
         execSync(`ip link show ${interfaceName}`, { stdio: 'ignore' });
         return true;
       } catch (error) {
         return false;
       }
     } catch (error) {
       console.error(`Error checking interface ${interfaceName}:`, error);
       return false;
     }
   }

  start(ID: number, clientPublicKey: string) {
    const interfaceName = `wg${ID}`;
    try {
      const { execSync } = require('child_process');

      const exists = this.isInterfaceExists(interfaceName);
      if (exists) {
        throw new Error(`Interface ${interfaceName} already exists, cannot start`);
      }

      const fs = require('fs');
      const configPath = `${this.serverConfigDir}/${interfaceName}.conf`;
      fs.writeFileSync(configPath, this.generateConfig(ID, interfaceName, clientPublicKey));
      fs.chmodSync(configPath, 0o600); // Set permissions to 600 (read/write for owner only)
      console.log(`Created WireGuard configuration at ${configPath}`);

      const result = execSync(`wg-quick up ${configPath}`, { encoding: 'utf8' });
      console.log(`WireGuard started successfully: ${result}`);
      return true;
    } catch (error) {
      console.error(`Failed to start WireGuard on interface ${interfaceName}:`, error);
      throw error;
    }
  }

  stop(ID: number) {
    const interfaceName = `wg${ID}`;
    try {
      const { execSync } = require('child_process');
      console.log(`Stopping WireGuard on interface ${interfaceName}`);

      const exists = this.isInterfaceExists(interfaceName);
      if (!exists) {
        throw new Error(`Interface ${interfaceName} does not exist, cannot stop`);
      }

      const configPath = `${this.serverConfigDir}/${interfaceName}.conf`;
      const result = execSync(`wg-quick down ${configPath}`, { encoding: 'utf8' });
      console.log(`WireGuard stopped successfully: ${result}`);
      return true;
    } catch (error) {
      console.error(`Failed to stop WireGuard on interface ${interfaceName}:`, error);
      throw error;
    }
  }

  status(ID: number) {
    const interfaceName = `wg${ID}`;
    try {
      const { execSync } = require('child_process');

      // Check if interface exists
      const exists = this.isInterfaceExists(interfaceName);
      if (!exists) {
        return {
          running: false,
          message: `Interface ${interfaceName} is not active`
        };
      }

      // Get WireGuard connection details
      const wgDetails = execSync(`wg show ${interfaceName}`, { encoding: 'utf8' });

      return {
        running: true,
        interface: interfaceName,
        details: wgDetails.trim()
      };
    } catch (error: any) {
      console.error(`Failed to get status for interface ${interfaceName}:`, error);
      return {
        running: false,
        error: error.message
      };
    }
  }

  transfer(ID: number) {
    const interfaceName = `wg${ID}`;
    try {
      const { execSync } = require('child_process');

      // Check if interface exists
      const exists = this.isInterfaceExists(interfaceName);
      if (!exists) {
        throw new Error(`Interface ${interfaceName} does not exist, cannot transfer`);
      }

      // Get WireGuard connection details
      const wgDetails = execSync(`wg show ${interfaceName} transfer`, { encoding: 'utf8' }).split(/\s+/);

      return {
        success: true,
        interface: interfaceName,
        inbound: parseInt(wgDetails[1], 10),
        outbound: parseInt(wgDetails[2], 10),
      };
    } catch (error: any) {
      console.error(`Failed to transfer WireGuard on interface ${interfaceName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generates a WireGuard configuration for a client
   * @param clientPublicKey The public key of the client
   * @returns The generated configuration string
   * @private
   */
  generateConfig(ID: number, interfaceName: string, clientPublicKey: string): string {
    try {
      // Generate a basic WireGuard configuration
      const config = `
[Interface]
PrivateKey = ${this.serverPrivateKey}
Address = 10.0.${ID}.1/32
ListenPort = ${50000 + Number(ID)}
PostUp = iptables -A FORWARD -i ${interfaceName} -j ACCEPT
PostDown = iptables -D FORWARD -i ${interfaceName} -j ACCEPT

[Peer]
PublicKey = ${clientPublicKey}
AllowedIPs = 10.0.${ID}.2/32
      `.trim();

      return config;
    } catch (error) {
      console.error('Failed to generate configuration:', error);
    }
    return '';
  }
}
