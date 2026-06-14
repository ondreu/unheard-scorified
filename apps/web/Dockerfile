# Multi-stage build pro SvelteKit (adapter-node) v pnpm monorepu.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @game/shared build && pnpm --filter @game/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/web/build apps/web/build
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["node", "build/index.js"]
