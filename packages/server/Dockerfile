FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY packages/core packages/core
COPY packages/server packages/server
# .git liegt nicht im Build-Kontext: Hash und Nummer kommen als Build-Argumente (siehe deploy/update.sh).
# Erst nach npm ci, damit ein neuer Hash den npm-Cache nicht ungültig macht.
ARG GIT_SHA=""
ARG BUILD_NUMBER="dev"
ENV GIT_SHA=$GIT_SHA BUILD_NUMBER=$BUILD_NUMBER
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
