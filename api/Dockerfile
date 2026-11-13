FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY tsconfig.json ./
COPY migrations ./migrations
COPY src ./src

RUN chown -R node:node /app
USER node

EXPOSE 18081

CMD ["npx", "tsx", "src/main-api.ts"]
