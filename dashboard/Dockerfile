FROM node:22-alpine
WORKDIR /app

# Build tools required by better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
