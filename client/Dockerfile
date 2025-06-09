FROM node:23

RUN apt update && apt install -y wireguard iproute2 iptables iputils-ping

WORKDIR /app

COPY package.json package-lock.json /app

RUN npm i

COPY . /app

CMD sleep infinity
