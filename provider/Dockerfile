FROM node:23

RUN apt update && apt install -y wireguard iproute2 iptables

WORKDIR /app

COPY package.json package-lock.json /app

RUN npm i

COPY . /app

CMD npm run dev
