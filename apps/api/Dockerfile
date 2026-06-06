FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@10.18.0

# Copia workspace inteiro (garante que todas as deps de sub-pacotes sejam instaladas)
COPY . .

# Instala TODAS as deps do workspace (root + packages + apps)
RUN pnpm install --frozen-lockfile

# Compila o core
RUN cd packages/core && pnpm run build

# Gera Prisma client e compila a API
RUN cd apps/api && npx prisma generate && pnpm run build

FROM node:20-alpine AS runner
WORKDIR /app

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
