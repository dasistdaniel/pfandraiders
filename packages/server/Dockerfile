FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY packages/core packages/core
COPY packages/server packages/server
RUN npm run build -w @pfandraiders/server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/packages/server/dist/server.cjs ./server.cjs
USER node
EXPOSE 8080
# TCP-Check: der Server spricht nur WebSocket, HTTP-GET liefert 426 (wget wertet das als Fehler)
HEALTHCHECK --interval=30s --timeout=3s CMD nc -z 127.0.0.1 8080 || exit 1
CMD ["node", "server.cjs"]
