import { Worker } from 'bullmq'
import prisma from '../prisma'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
import { sign } from '@flipt/qr-api-core'
import { meteringService } from '../billing/meteringService'
import logger from '../logger'

interface WebhookJobData {
  webhookId: string
  deliveryId: string
  url: string
  secret: string
  event: string
  payload: unknown
}

const MAX_ATTEMPTS = 8
const TIMEOUT_MS = 10_000

async function processWebhook(data: WebhookJobData): Promise<void> {
  const { webhookId, deliveryId, url, secret, event, payload } = data

  const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() })
  const signature = sign(body, secret)
  const timestamp = new Date().toISOString()

  await prisma.qrApiWebhookDelivery.update({
    where: { id: deliveryId },
    data: { attempts: { increment: 1 } },
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Qr-Signature': signature,
        'X-Qr-Timestamp': timestamp,
        'X-Qr-Event': event,
      },
      body,
      signal: controller.signal,
    })

    if (!res.ok) {
      throw Object.assign(new Error(`Webhook ${url} respondeu ${res.status}`), { httpStatus: res.status })
    }

    await prisma.qrApiWebhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'delivered', deliveredAt: new Date(), lastStatus: res.status },
    })

    // Metering: busca instanceId pelo webhook
    const wh = await prisma.qrApiWebhook.findUnique({ where: { id: webhookId }, select: { instanceId: true } })
    if (wh) {
      const inst = await prisma.qrApiInstance.findUnique({ where: { id: wh.instanceId }, select: { tenantId: true } })
      if (inst) await meteringService.incrementWebhookDelivered(inst.tenantId, wh.instanceId)
    }

    logger.info({ deliveryId, url, event }, '[webhookWorker] entregue')
  } catch (err: unknown) {
    const httpStatus = (err as any).httpStatus as number | undefined
    const nextRetryAt = new Date(Date.now() + 60_000)  // BullMQ controla o backoff real

    await prisma.qrApiWebhookDelivery.update({
      where: { id: deliveryId },
      data: {
        lastError: String(err),
        lastStatus: httpStatus,
        nextRetryAt,
      },
    })
    logger.warn({ err, deliveryId, url }, '[webhookWorker] falha ao entregar')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export function createWebhookWorker() {
  const worker = new Worker<WebhookJobData>(
    'qr-api:webhook',
    async (job) => processWebhook(job.data),
    {
      connection: { url: redisUrl },
      concurrency: 10,
    },
  )

  worker.on('failed', async (job, err) => {
    if (job && job.attemptsMade >= MAX_ATTEMPTS) {
      logger.error({ deliveryId: job.data.deliveryId }, '[webhookWorker] DLQ — max tentativas atingido')
      await prisma.qrApiWebhookDelivery.update({
        where: { id: job.data.deliveryId },
        data: { status: 'dead' },
      }).catch(() => { /* nao critico */ })
    }
  })

  return worker
}
