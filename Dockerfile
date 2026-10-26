# syntax=docker/dockerfile:1

# ---- build --------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the package's own `prepare` (svelte-kit sync and the
# message compile) needs the source, which is not copied yet; the build below
# does both itself. No dependency needs an install script (see the runtime
# stage's note).
RUN npm ci --ignore-scripts
COPY . .
# adapter-node's postbuild "analyse" step imports server modules (including
# db.ts) to statically analyze the app; db.ts throws at import time if
# DATABASE_URL is unset. postgres.js connects lazily on first query, so this
# placeholder never actually connects — it only satisfies that import-time
# check. Not present in the runtime stage (each stage's ENV is isolated).
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
# The client half of the build needs more than the ~2 GB heap Node gives
# itself in a container (it stops with "JavaScript heap out of memory"); the
# build stage's memory is the Docker VM's (docs/guides/deployment.md, "Prerequisites").
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# ---- runtime --------------------------------------------------------------
# Shared by all three app-derived compose services (app, mcp, migrate) —
# each just supplies a different `command:`. mcp/migrate run their
# TypeScript entrypoints directly via tsx (a production dependency), since
# they aren't part of the adapter-node build output.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system app && useradd --system --gid app --home /app app

# Where this image's source code is offered (AGPL-3.0 §13): the app's About
# page links it (/-/about, behind the footer's info icon) and the MCP server
# names it (platform/source.server.ts). An
# image built from modified code passes its own repository and the commit:
#   docker build --build-arg SOURCE_URL=https://… --build-arg SOURCE_REVISION=$(git rev-parse HEAD) .
# (docs/guides/deployment.md, "Source code for network users").
# Unset (or empty, as compose passes them by default), the app falls back to
# the upstream repository and `dev`.
ARG SOURCE_URL
ARG SOURCE_REVISION
ENV SOURCE_URL=${SOURCE_URL} SOURCE_REVISION=${SOURCE_REVISION}
LABEL org.opencontainers.image.title="owlgraph" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.source=${SOURCE_URL:-https://github.com/owlgraph-dev/owlgraph} \
      org.opencontainers.image.revision=${SOURCE_REVISION:-dev}
# The licence, its plugin exception and the notices travel with the code they
# cover (the app serves the first two at /-/license from its build); the
# dependencies' licence texts are in build/ (static/licenses.txt, served at
# /licenses.txt).
COPY LICENSE PLUGIN-EXCEPTION.md THIRD-PARTY-NOTICES.md ./

COPY package.json package-lock.json ./
# --ignore-scripts: the production tree still contains vite (bits-ui -> runed
# has an optional peer on @sveltejs/kit, which requires vite — npm treats that
# edge as production-reachable) and with it a nested esbuild whose platform
# binaries are dev-only, so its postinstall aborts on a version mismatch with
# the hoisted esbuild tsx uses. No production dependency needs an install
# script: esbuild's only optimizes its bin shim (the API resolves
# @esbuild/<platform> itself), fsevents is macOS-only, and canvas is an
# optional pdfjs dependency that text extraction does not use.
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/build ./build
# From the build stage, not the build context: the build generates
# src/lib/paraglide (gitignored, and excluded from the context by
# .dockerignore), which the MCP server and scripts import through tsx.
COPY --from=build /app/src ./src
COPY scripts ./scripts
# tsx resolves `$lib/…` through this file (the app's tsconfig.json extends the
# generated .svelte-kit/tsconfig.json, which is not shipped) — see the
# `--tsconfig tsconfig.tsx.json` in every compose command and npm script.
COPY tsconfig.tsx.json ./tsconfig.tsx.json
COPY migrations ./migrations
COPY schema.sql ./schema.sql

USER app
EXPOSE 3000 3030
# No CMD — each compose service supplies its own `command:`.
