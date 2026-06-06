# Usa node:20-slim (Debian) pois alpine nao tem libssl 1.1 necessario para Prisma
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.18.0

COPY . .
RUN pnpm install --frozen-lockfile
RUN cd packages/core && pnpm run build
RUN cd apps/api && npx prisma generate && pnpm run build

FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.18.0

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/tsconfig.base.json ./
COPY --from=builder /app/packages/core ./packages/core
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/public ./apps/api/public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 4500
CMD ["node", "dist/index.js"]
