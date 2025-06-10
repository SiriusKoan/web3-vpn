FROM node:23

RUN apt update && apt install -y wireguard iproute2 iptables iputils-ping

WORKDIR /app

COPY package.json package-lock.json /app

RUN npm i

COPY . /app

# gen key for WG
RUN mkdir -p /opt/web3vpn/wg

WORKDIR /opt/web3vpn/wg

RUN umask 077 && \
    wg genkey | tee /opt/web3vpn/wg/privatekey | wg pubkey > /opt/web3vpn/wg/publickey && \
    chmod 600 /opt/web3vpn/wg/privatekey && \
    chmod 644 /opt/web3vpn/wg/publickey

WORKDIR /app

CMD sleep infinity
