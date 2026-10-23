FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=package_ca \
    if [ -f /run/secrets/package_ca ]; then export npm_config_cafile=/run/secrets/package_ca; fi; \
    npm ci --cache /tmp/npm-cache --no-audit
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DB_PATH=/app/.data/pairon.sqlite
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=package_ca \
    if [ -f /run/secrets/package_ca ]; then export npm_config_cafile=/run/secrets/package_ca; fi; \
    npm ci --omit=dev --cache /tmp/npm-cache --no-audit && mkdir .data && chown node:node .data
COPY --chown=node:node server ./server
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3001
VOLUME ["/app/.data"]
CMD ["node", "server/index.mjs"]
