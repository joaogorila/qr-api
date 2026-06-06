// Metricas de observabilidade por instancia (Onda 3).
// Espelha o embedded qrApiMetrics.service.ts, com prisma tipado do standalone.

import prisma from '../prisma'
import { QrApiError } from '@flipt/qr-api-core'
import { getInstanceHealth } from './healthService'

function todayUtc(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

async function getTodayUsage(instanceId: string): Promise<{
  messagesSent: number
  messagesFailed: number
  webhooksDelivered: number
}> {
  const date = todayUtc()
  const record = await prisma.qrApiUsageRecord.findUnique({
    where: { instanceId_date: { instanceId, date } },
  })
  return {
    messagesSent: record?.messagesSent ?? 0,
    messagesFailed: record?.messagesFailed ?? 0,
    webhooksDelivered: record?.webhooksDelivered ?? 0,
  }
}

/**
 * Metricas por instancia: latencia (fila->enviado, enviado->entregue), taxas de
 * entrega/leitura/falha, uso de hoje, health e historico dos ultimos N dias.
 */
export async function getInstanceMetrics(tenantId: string, instanceId: string, days = 7) {
  const instance = await prisma.qrApiInstance.findFirst({
    where: { id: instanceId, tenantId, revokedAt: null },
    select: { id: true, name: true, status: true, dailyLimit: true, healthScore: true, warmupUntil: true, createdAt: true },
  })
  if (!instance) throw QrApiError.notFound('Instancia')

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const recent = await prisma.qrApiMessage.findMany({
    where: { instanceId, createdAt: { gte: since } },
    select: { status: true, createdAt: true, sentAt: true, deliveredAt: true, readAt: true },
    take: 5000,
    orderBy: { createdAt: 'desc' },
  })

  const counts = { total: recent.length, sent: 0, delivered: 0, read: 0, failed: 0 }
  let queueLatencySum = 0, queueLatencyN = 0
  let deliveryLatencySum = 0, deliveryLatencyN = 0

  for (const m of recent) {
    if (m.status === 'FAILED') counts.failed++
    if (m.sentAt) {
      counts.sent++
      queueLatencySum += m.sentAt.getTime() - m.createdAt.getTime()
      queueLatencyN++
    }
    if (m.deliveredAt) {
      counts.delivered++
      if (m.sentAt) {
        deliveryLatencySum += m.deliveredAt.getTime() - m.sentAt.getTime()
        deliveryLatencyN++
      }
    }
    if (m.readAt) counts.read++
  }

  const usage = await getTodayUsage(instanceId)
  const health = await getInstanceHealth(instanceId, tenantId)

  const sinceDays = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const history = await prisma.qrApiUsageRecord.findMany({
    where: { instanceId, date: { gte: sinceDays } },
    select: { date: true, messagesSent: true, messagesFailed: true, webhooksDelivered: true },
    orderBy: { date: 'asc' },
  })

  const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)

  return {
    object: 'instance_metrics',
    instanceId: instance.id,
    name: instance.name,
    status: instance.status,
    connected: instance.status === 'CONNECTED',
    health: health
      ? { score: health.score, level: health.level, reasons: health.reasons }
      : { score: instance.healthScore, level: null, reasons: [] },
    today: {
      messagesSent: usage.messagesSent,
      messagesFailed: usage.messagesFailed,
      webhooksDelivered: usage.webhooksDelivered,
      dailyLimit: instance.dailyLimit,
      remaining: Math.max(0, instance.dailyLimit - usage.messagesSent),
    },
    last24h: {
      total: counts.total,
      sent: counts.sent,
      delivered: counts.delivered,
      read: counts.read,
      failed: counts.failed,
      deliveryRate: rate(counts.delivered, counts.sent),
      readRate: rate(counts.read, counts.sent),
      failureRate: rate(counts.failed, counts.total),
    },
    latency: {
      queueMs: queueLatencyN > 0 ? Math.round(queueLatencySum / queueLatencyN) : null,
      deliveryMs: deliveryLatencyN > 0 ? Math.round(deliveryLatencySum / deliveryLatencyN) : null,
    },
    history,
  }
}

/**
 * Resumo agregado de todas as instancias do tenant (visao geral do dashboard).
 */
export async function getAccountMetricsSummary(tenantId: string) {
  const instances = await prisma.qrApiInstance.findMany({
    where: { tenantId, revokedAt: null },
    select: { id: true, status: true, healthScore: true },
  })

  const byStatus: Record<string, number> = {}
  let healthSum = 0
  for (const i of instances) {
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1
    healthSum += i.healthScore ?? 0
  }

  const usageToday = await prisma.qrApiUsageRecord.aggregate({
    where: { tenantId, date: todayUtc() },
    _sum: { messagesSent: true, messagesFailed: true, webhooksDelivered: true },
  })

  return {
    object: 'account_metrics',
    instances: {
      total: instances.length,
      connected: byStatus['CONNECTED'] ?? 0,
      byStatus,
    },
    avgHealthScore: instances.length > 0 ? Math.round(healthSum / instances.length) : 100,
    today: {
      messagesSent: usageToday._sum.messagesSent ?? 0,
      messagesFailed: usageToday._sum.messagesFailed ?? 0,
      webhooksDelivered: usageToday._sum.webhooksDelivered ?? 0,
    },
  }
}
