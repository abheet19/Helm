# =============================================================================
# Helm — Dockerfile
# A single-stage Node image. No build step: the SPA is static and the server is
# plain ESM, so we only need production deps.
# =============================================================================
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy the app.
COPY server ./server
COPY public ./public

# Record a build timestamp the SPA can show (optional, honest metadata).
ARG BUILD_TS
ENV BUILD_TS=${BUILD_TS}

EXPOSE 8080
ENV PORT=8080

# Container-level healthcheck hits Helm's own /health (no network egress).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["node", "server/index.js"]
