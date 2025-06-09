FROM node:23

RUN apt update && apt install -y wireguard iproute2 iptables

WORKDIR /app

COPY package.json package-lock.json /app

RUN npm i

COPY . /app

CMD sleep infinity
#CMD npm run dev -- --web3-private-key-file ../web3/server/privatekey
