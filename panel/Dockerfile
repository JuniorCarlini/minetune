# syntax=docker/dockerfile:1

# --- Build do frontend --------------------------------------------------------
FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

# --- Runtime -------------------------------------------------------------------
# O backend roda TypeScript direto (type stripping nativo do Node 24): sem etapa de build.
FROM node:24-alpine
RUN apk add --no-cache tini
COPY --from=restic/restic:0.19.1 /usr/bin/restic /usr/local/bin/restic

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY --from=web /app/dist/web ./dist/web

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server/index.ts"]
