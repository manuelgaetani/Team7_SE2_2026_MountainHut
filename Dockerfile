
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci

COPY . .
RUN npm run prisma:generate -w @mountain-hut/api \
 && npm run build

FROM node:24-alpine AS production
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_PATH=/app/apps/web/dist \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci --omit=dev -w @mountain-hut/api -w @mountain-hut/shared --include-workspace-root=false \
 && npm cache clean --force

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
# Migrations are applied by the container itself on every start (see CMD).
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/

USER node
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
# Then, with SEED_DEMO_DATA=true, a database without users gets the demo accounts and slots
# (see src/seed.ts); a database that already has users is left as it is.
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && node dist/seed.js --on-start && exec node dist/main.js"]
