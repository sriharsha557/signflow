# ---- dependencies: build tools are only in this stage (better-sqlite3 may compile its native module) ----
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
# Compile against the headers shipped in the image instead of downloading them.
ENV npm_config_nodedir=/usr/local
WORKDIR /app
COPY package.json package-lock.json ./
# --omit=optional skips "canvas" (pulled in by pdfjs-dist for Node rendering, which SignFlow doesn't use)
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund

# ---- runtime ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
RUN apt-get update && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data /backups && chown node:node /data /backups
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Application files stay owned by root (read-only for the app); only /data and /backups are writable.
COPY . .
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
