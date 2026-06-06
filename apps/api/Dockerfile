FROM node:20-alpine AS builder
WORKDIR /app

# Instala pnpm
RUN npm install -g pnpm@10.18.0

# Copia workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/core/src ./packages/core/src
COPY packages/core/tsconfig.json ./packages/core/

# Instala dependencias
RUN pnpm install --frozen-lockfile

# Compila o core
RUN cd packages/core && pnpm run build

# Copia e compila a API
COPY apps/api ./apps/api
RUN cd apps/api && pnpm run prisma:generate && pnpm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm@10.18.0

# Copia artifacts necessarios
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
