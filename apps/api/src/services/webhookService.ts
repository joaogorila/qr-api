import { Queue } from 'bullmq'
import prisma from '../prisma'
import { QrApiError } from '@flipt/qr-api-core'
import type { RegisterWebhookInput, UpdateWebhookInput } from '@flipt/qr-api-core'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
export const webhookQueue = new Queue('qr-api:webhook', { connection: { url: redisUrl } })

export async function registerWebhook(tenantId: string, input: RegisterWebhookInput) {
  // Verifica que a instancia pertence ao tenant
  const instance = await prisma.qrApiInstance.findFirst({
    where: { id: input.instanceId, tenantId, revokedAt: null },
  })
  if (!instance) throw QrApiError.notFound('Instancia')

  return prisma.qrApiWebhook.create({
    data: {
      tenantId,
      instanceId: input.instanceId,
      url: input.url,
      secret: input.secret,
      events: input.events ?? ['*'],
      active: input.active ?? true,
    },
  })
}

export async function listWebhooks(tenantId: string) {
  return prisma.qrApiWebhook.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function updateWebhook(tenantId: string, webhookId: string, input: UpdateWebhookInput) {
  const wh = await prisma.qrApiWebhook.findFirst({ where: { id: webhookId, tenantId } })
  if (!wh) throw QrApiError.notFound('Webhook')
  return prisma.qrApiWebhook.update({
    where: { id: webhookId },
    data: {
      ...(input.url ? { url: input.url } : {}),
      ...(input.secret ? { secret: input.secret } : {}),
      ...(input.events ? { events: input.events } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  })
}

export async function deleteWebhook(tenantId: string, webhookId: string) {
  const wh = await prisma.qrApiWebhook.findFirst({ where: { id: webhookId, tenantId } })
  if (!wh) throw QrApiError.notFound('Webhook')
  await prisma.qrApiWebhook.delete({ where: { id: webhookId } })
  return { id: webhookId, deleted: true }
}

export async function listDeliveries(tenantId: string, webhookId: string, limit = 50) {
  const wh = await prisma.qrApiWebhook.findFirst({ where: { id: webhookId, tenantId } })
  if (!wh) throw QrApiError.notFound('Webhook')

  return prisma.qrApiWebhookDelivery.findMany({
    where: { webhookId },
    take: limit,
    orderBy: { createdAt: 'desc' },
  })
}

export async function retryDelivery(tenantId: string, webhookId: string, deliveryId: string) {
  const wh = await prisma.qrApiWebhook.findFirst({ where: { id: webhookId, tenantId } })
  if (!wh) throw QrApiError.notFound('Webhook')

  const delivery = await prisma.qrApiWebhookDelivery.findFirst({ where: { id: deliveryId, webhookId } })
  if (!delivery) throw QrApiError.notFound('Delivery')

  await webhookQueue.add('deliver', {
    webhookId,
    deliveryId,
    url: wh.url,
    secret: wh.secret,
    event: delivery.event,
    payload: delivery.payload,
  })

  return { id: deliveryId, queued: true }
}

/**
 * Enfileira entrega de evento para todos os webhooks ativos de uma instancia.
 */
export async function dispatchEvent(
  instanceId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const webhooks = await prisma.qrApiWebhook.findMany({
    where: {
      instanceId,
      active: true,
    },
  })

  for (const wh of webhooks) {
    if (!wh.events.includes('*') && !wh.events.includes(event)) continue

    const delivery = await prisma.qrApiWebhookDelivery.create({
      data: { webhookId: wh.id, event, payload: payload as any, status: 'pending' },
    })

    await webhookQueue.add('deliver', {
      webhookId: wh.id,
      deliveryId: delivery.id,
      url: wh.url,
      secret: wh.secret,
      event,
      payload,
    }, {
      attempts: 8,
      backoff: { type: 'exponential', delay: 1000 },
    })
  }
}
