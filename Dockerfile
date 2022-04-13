FROM node:alpine as builder
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY package*.json ./
# RUN npm config set unsafe-perm true
RUN npm -v 
RUN npm install -g typescript
RUN npm install -g ts-node
RUN npm install 
USER node
COPY --chown=node:node . .
RUN npm run build

FROM node:alpine
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY package*.json ./
RUN npm install --production
USER node
COPY --from=builder /home/node/app/dist ./dist
# COPY --chown=node:node .env .
# COPY --chown=node:node  /config ./config
# COPY --chown=node:node  /public ./public
EXPOSE 2222/udp
CMD [ "node", "dist/index.js" ]
