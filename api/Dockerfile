FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY migrations ./migrations
COPY src ./src

EXPOSE 18081

CMD ["npx", "tsx", "src/main-api.ts"]
