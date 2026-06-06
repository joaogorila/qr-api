import { Queue } from 'bullmq'
import prisma from '../prisma'
import { QrApiError, withinDailyLimit } from '@flipt/qr-api-core'
import type { SendMessageInput } from '@flipt/qr-api-core'
import { meteringService } from '../billing/meteringService'
import { assertActiveForSend } from './subscriptionService'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
const sendQueue = new Queue('qr-api:send', { connection: { url: redisUrl } })

export { sendQueue }

export async function enqueueMessage(
  tenantId: string,
  input: SendMessageInput,
  idempotencyKey?: string,
) {
  // Gate de billing: bloqueia envio se a assinatura nao estiver utilizavel
  await assertActiveForSend(tenantId)

  const instance = await prisma.qrApiInstance.findFirst({
    where: { id: input.instanceId, tenantId, revokedAt: null },
  })

  if (!instance) throw QrApiError.notFound('Instancia')
  if (instance.status === 'BANNED') throw QrApiError.instance('instance_banned', 'Esta instancia foi banida.')
  if (instance.status === 'PROVISIONING') throw QrApiError.instance('instance_provisioning', 'Instancia ainda sendo provisionada.')
  if (instance.status !== 'CONNECTED' && instance.status !== 'DEGRADED') {
    throw QrApiError.instance('instance_not_connected', `Instancia esta ${instance.status.toLowerCase()}. Conecte primeiro.`)
  }

  // Verifica daily limit
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
  const countToday = await prisma.qrApiMessage.count({
    where: {
      instanceId: instance.id,
      createdAt: { gte: startOfDay },
      status: { notIn: ['CANCELLED', 'FAILED'] },
    },
  })

  if (!withinDailyLimit(countToday, instance.dailyLimit)) {
    throw QrApiError.rateLimit('daily_limit_reached', `Limite diario de ${instance.dailyLimit} mensagens atingido.`)
  }

  // Cria o registro da mensagem
  const message = await prisma.qrApiMessage.create({
    data: {
      tenantId,
      instanceId: instance.id,
      to: input.to,
      type: input.type,
      payload: input as any,
      status: input.scheduledAt ? 'SCHEDULED' : 'QUEUED',
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      externalId: input.externalId,
    },
  })

  // Enfileira no BullMQ
  const delay = input.scheduledAt
    ? Math.max(0, new Date(input.scheduledAt).getTime() - Date.now())
    : 0

  await sendQueue.add(
    'send',
    { messageId: message.id, instanceId: instance.id, evolutionInstanceId: instance.evolutionInstanceId, payload: input },
    {
      delay,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      jobId: idempotencyKey ? `idem_${idempotencyKey}` : undefined,
    },
  )

  return message
}

export async function getMessage(tenantId: string, messageId: string) {
  const msg = await prisma.qrApiMessage.findFirst({ where: { id: messageId, tenantId } })
  if (!msg) throw QrApiError.notFound('Mensagem')
  return msg
}

export async function listMessages(
  tenantId: string,
  filters: { instanceId?: string; status?: string; to?: string },
  limit = 20,
  startingAfter?: string,
) {
  const cursor = startingAfter ? { id: startingAfter } : undefined
  const items = await prisma.qrApiMessage.findMany({
    where: {
      tenantId,
      ...(filters.instanceId ? { instanceId: filters.instanceId } : {}),
      ...(filters.status ? { status: filters.status.toUpperCase() as any } : {}),
      ...(filters.to ? { to: filters.to } : {}),
    },
    take: limit + 1,
    skip: cursor ? 1 : 0,
    cursor,
    orderBy: { createdAt: 'desc' },
  })
  const hasMore = items.length > limit
  return { data: items.slice(0, limit), has_more: hasMore, next_cursor: hasMore ? items[limit - 1]?.id ?? null : null }
}

export async function cancelMessage(tenantId: string, messageId: string) {
  const msg = await getMessage(tenantId, messageId)
  if (msg.status !== 'QUEUED' && msg.status !== 'SCHEDULED') {
    throw QrApiError.invalidRequest('invalid_parameter', `Mensagem em status ${msg.status} nao pode ser cancelada.`, 'id')
  }
  return prisma.qrApiMessage.update({ where: { id: messageId }, data: { status: 'CANCELLED' } })
}

export async function markRead(tenantId: string, messageId: string) {
  await getMessage(tenantId, messageId)
  return prisma.qrApiMessage.update({ where: { id: messageId }, data: { readAt: new Date(), status: 'READ' } })
}
