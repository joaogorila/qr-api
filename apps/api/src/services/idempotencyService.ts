import { createHash } from 'crypto'
import prisma from '../prisma'
import { QrApiError } from '@flipt/qr-api-core'

const TTL_HOURS = 24

export function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex')
}

export type IdempotencyResult =
  | { hit: true; responseCode: number; responseBody: unknown }
  | { hit: false }

/**
 * Verifica ou reserva uma chave de idempotencia.
 * Lanca QrApiError.idempotency() se a key foi reutilizada com corpo diferente.
 */
export async function checkOrReserve(
  tenantId: string,
  instanceId: string,
  idempotencyKey: string,
  bodyHash: string,
): Promise<IdempotencyResult> {
  const existing = await prisma.qrApiIdempotencyKey.findUnique({
    where: { instanceId_key: { instanceId, key: idempotencyKey } },
  })

  if (existing) {
    // Expirou: trata como nova
    if (existing.expiresAt < new Date()) {
      await prisma.qrApiIdempotencyKey.delete({ where: { id: existing.id } })
    } else if (existing.requestHash !== bodyHash) {
      throw QrApiError.idempotency()
    } else if (existing.status === 'completed' && existing.responseCode !== null) {
      return { hit: true, responseCode: existing.responseCode, responseBody: existing.responseBody }
    } else {
      // still processing — cliente pode tentar de novo mais tarde
      return { hit: false }
    }
  }

  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000)
  await prisma.qrApiIdempotencyKey.create({
    data: { tenantId, instanceId, key: idempotencyKey, requestHash: bodyHash, expiresAt },
  })

  return { hit: false }
}

export async function complete(
  instanceId: string,
  idempotencyKey: string,
  responseCode: number,
  responseBody: unknown,
): Promise<void> {
  await prisma.qrApiIdempotencyKey.updateMany({
    where: { instanceId, key: idempotencyKey },
    data: { status: 'completed', responseCode, responseBody: responseBody as any },
  })
}
