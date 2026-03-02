FROM node as builder
RUN uname -a && mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY package*.json ./
RUN npm install
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src ./src
USER node
RUN npx tsc

FROM node:slim
RUN uname -a && mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY package*.json ./
RUN npm install --omit=dev
USER node
COPY --from=builder /home/node/app/dist ./dist
EXPOSE 2222/udp
EXPOSE 8080/tcp
CMD [ "node", "dist/index.js" ]
