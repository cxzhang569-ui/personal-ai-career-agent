FROM node:24.19.0-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN ONNXRUNTIME_NODE_INSTALL=skip pnpm install --frozen-lockfile
COPY . .
RUN pnpm model:prepare && pnpm model:verify && pnpm ingest && pnpm test && pnpm build && pnpm typecheck && pnpm lint && node scripts/prepare-native-runtime.mjs

# This explicitly separate, private test image is never the deployment image.
FROM builder AS validation
ENV NODE_ENV=production RERANKER_ENABLED=false
CMD ["pnpm", "check:rag"]

FROM node:24.19.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 RERANKER_ENABLED=false TRUST_PROXY=false MAX_CONCURRENT_CHATS=2
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/models/bge-small-zh-v1.5 ./models/bge-small-zh-v1.5
COPY --from=builder --chown=node:node /app/knowledge/example ./knowledge/example
COPY --from=builder --chown=node:node /app/data/embeddings.json ./data/embeddings.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
