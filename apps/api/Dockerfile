# Multi-stage build pro NestJS API v pnpm monorepu.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Manifesty pro cachovatelnou instalaci.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile
# Zdrojáky + build (shared -> api).
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @game/shared build && pnpm --filter @game/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
# Migrace pro auto-migrate při startu (viz src/db/migrate.ts).
COPY apps/api/drizzle apps/api/drizzle
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
