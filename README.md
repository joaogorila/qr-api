# qr-api

Monorepo do QR-API: WhatsApp API nao-oficial (QR/Web via Evolution/Baileys).

## Estrutura

```
qr-api/
  packages/
    core/         @flipt/qr-api-core  — logica framework-free (schemas Zod, erros, pacing, health, HMAC)
    sdk-node/     @flipt/qr-api       — SDK oficial Node/TS (a ser criado)
    mcp/          @flipt/qr-api-mcp   — MCP server para Claude Code/Cursor/Cline (a ser criado)
  apps/
    api/          @flipt/qr-api-standalone — produto SaaS standalone (Express + Prisma + BullMQ)
  docs/           OpenAPI + llms.txt + guias por ferramenta (a ser criado)
```

## Rodar localmente

```bash
# Instalar dependencias
pnpm install

# Build do core
pnpm -C packages/core build

# Gerar Prisma client (requer DATABASE_URL no .env)
pnpm -C apps/api prisma:generate

# Dev standalone (requer .env com DATABASE_URL + REDIS_URL + EVOLUTION_API_URL)
pnpm -C apps/api dev
```

## Variaveis de ambiente

Copie `apps/api/.env.example` para `apps/api/.env` e preencha.

## Porta padrao

`4500` (configuravel via `PORT` no .env).

## Contrato de rotas

Ver `packages/core/src/schemas.ts` e a doc em `docs/` (a ser criada).
