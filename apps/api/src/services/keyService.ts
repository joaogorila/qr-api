import { createHash, randomBytes } from 'crypto'
import prisma from '../prisma'
import type { CreateKeyInput } from '@flipt/qr-api-core'

function generateRawKey(mode: 'test' | 'live'): string {
  const rand = randomBytes(24).toString('base64url')
  return `sk_${mode}_${rand}`
}

export async function createApiKey(tenantId: string, input: CreateKeyInput) {
  const rawKey = generateRawKey(input.mode ?? 'live')
  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 14) + '...'

  const key = await prisma.qrApiKey.create({
    data: {
      tenantId,
      name: input.name,
      keyHash,
      keyPrefix,
      mode: (input.mode ?? 'live').toUpperCase() as 'LIVE' | 'TEST',
      scopes: input.scopes ?? [],
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  })

  return { ...key, rawKey }  // rawKey exibido so na criacao
}

export async function listApiKeys(tenantId: string) {
  return prisma.qrApiKey.findMany({
    where: { tenantId, revokedAt: null },
    select: {
      id: true, name: true, keyPrefix: true, mode: true,
      scopes: true, lastUsedAt: true, expiresAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function revokeApiKey(tenantId: string, keyId: string) {
  return prisma.qrApiKey.updateMany({
    where: { id: keyId, tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
