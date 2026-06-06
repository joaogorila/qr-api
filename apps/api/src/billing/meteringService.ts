// Metering por instancia — grava UsageRecord diario agregado
// TODO: Integrar Stripe Metered Billing ou PIX para cobranca

import prisma from '../prisma'
import logger from '../logger'

function startOfDayUTC(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export const meteringService = {
  async incrementSent(tenantId: string, instanceId: string): Promise<void> {
    const date = startOfDayUTC()
    try {
      await prisma.qrApiUsageRecord.upsert({
        where: { instanceId_date: { instanceId, date } },
        update: { messagesSent: { increment: 1 } },
        create: { tenantId, instanceId, date, messagesSent: 1 },
      })
    } catch (err) {
      logger.warn({ err, instanceId }, '[metering] falha ao incrementar messagesSent')
    }
  },

  async incrementFailed(tenantId: string, instanceId: string): Promise<void> {
    const date = startOfDayUTC()
    try {
      await prisma.qrApiUsageRecord.upsert({
        where: { instanceId_date: { instanceId, date } },
        update: { messagesFailed: { increment: 1 } },
        create: { tenantId, instanceId, date, messagesFailed: 1 },
      })
    } catch (err) {
      logger.warn({ err, instanceId }, '[metering] falha ao incrementar messagesFailed')
    }
  },

  async incrementWebhookDelivered(tenantId: string, instanceId: string): Promise<void> {
    const date = startOfDayUTC()
    try {
      await prisma.qrApiUsageRecord.upsert({
        where: { instanceId_date: { instanceId, date } },
        update: { webhooksDelivered: { increment: 1 } },
        create: { tenantId, instanceId, date, webhooksDelivered: 1 },
      })
    } catch (err) {
      logger.warn({ err, instanceId }, '[metering] falha ao incrementar webhooksDelivered')
    }
  },

  async getUsage(tenantId: string, instanceId: string, days = 30) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    return prisma.qrApiUsageRecord.findMany({
      where: { tenantId, instanceId, date: { gte: since } },
      orderBy: { date: 'asc' },
    })
  },
}
