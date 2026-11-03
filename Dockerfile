# syntax=docker/dockerfile:1
#
# Two images from one file:
#   --target web    the Next.js app (standalone output), small, runs as the non-root `node` user
#   --target tools  full dependencies + source, for migrations, scripts and the jobs scheduler
#
# Nothing secret is needed to build: configuration comes from the environment at run time.

ARG NODE_IMAGE=node:26.13.0-alpine

# --- base: Node + pnpm ----------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
# Node 25+ no longer ships corepack, so install the pnpm version package.json pins.
RUN npm install --global pnpm@12.16.1 && npm cache clean --force
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# --- deps: all dependencies (dev ones are needed to build and for the tools image) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# --- build: compile the app -----------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm build

# --- tools: migrations (pnpm db:migrate), pnpm user:create, pnpm jobs:run, ... ---------
FROM base AS tools
ENV NODE_ENV=production
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json drizzle.config.ts ./
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
USER node
CMD ["pnpm", "db:migrate"]

# --- web: the app ---------------------------------------------------------------------
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
# Liveness only (no database): see src/app/api/health/live/route.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health/live || exit 1
CMD ["node", "server.js"]
