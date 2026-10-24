ARG NODE_IMAGE=node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY examples/demo/package.json examples/demo/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/pipeline/package.json packages/pipeline/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/database/prisma.config.ts packages/database/prisma.config.ts
COPY packages/database/prisma/schema.prisma packages/database/prisma/schema.prisma
RUN --mount=type=cache,id=eventlens-pnpm,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY . .
RUN pnpm db:generate && pnpm -r --filter './packages/*' build
ENV API_URL=http://api:3001
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm -r --filter './apps/*' build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
USER node

FROM runtime AS api
CMD ["node", "apps/api/dist/main.js"]
FROM runtime AS worker
CMD ["node", "apps/worker/dist/main.js"]
FROM runtime AS web
CMD ["node", "apps/web/node_modules/next/dist/bin/next", "start", "apps/web", "--hostname", "0.0.0.0"]
FROM runtime AS migrate
WORKDIR /app/packages/database
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]
