function generateClientConfig(ID: number, serverPublicKey: string, privateKey: string, endpoint: string) {
  const config = `[Interface]
PrivateKey = ${privateKey}
Address = 10.0.${ID}.2/32
ListenPort = ${50000 + ID}

[Peer]
PublicKey = ${serverPublicKey}
AllowedIPs = 0.0.0.0/0
Endpoint = ${endpoint}`;

  return config;
}

export { generateClientConfig };
