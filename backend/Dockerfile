FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM build AS migration
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM build AS production-deps
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /var/lib/dearly/attachments && chown -R node:node /var/lib/dearly
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 STORAGE_ROOT=/var/lib/dearly/attachments
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=8s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start:production"]
