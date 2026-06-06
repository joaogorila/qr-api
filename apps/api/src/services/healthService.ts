// Health score por instancia (Onda 3, anti-ban).
// Espelha o embedded qrApiHealth.service.ts. Como o core do standalone tem um
// computeHealthScore com assinatura diferente (sinais de uso/inbound), portamos
// aqui o calculo baseado em STATUS/falha/circuit (igual embedded) e reusamos
// levelFromScore/healthThrottleFactor do core para a faixa de 5 niveis.

import prisma from '../prisma'
import { levelFromScore } from '@flipt/qr-api-core'
import type { HealthBand } from '@flipt/qr-api-core'
import { getEvolutionCircuitState } from './evolutionClient'
import { dispatchEvent } from './webhookService'
import logger from '../logger'

interface HealthSignals {
  status: 'PROVISIONING' | 'QR_PENDING' | 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED' | 'BANNED'
  failureRatePercent?: number
  inWarmup?: boolean
  circuitBreakerOpen?: boolean
}

interface HealthResult {
  score: number
  level: HealthBand
  reasons: string[]
}

/** Computa o healthScore (0-100) e a faixa a partir dos sinais (igual embedded). */
function computeHealth(signals: HealthSignals): HealthResult {
  const reasons: string[] = []
  let score = 100

  switch (signals.status) {
    case 'BANNED':
      return { score: 0, level: 'offline', reasons: ['Numero banido pelo WhatsApp'] }
    case 'DISCONNECTED':
      score -= 60
      reasons.push('Instancia desconectada')
      break
    case 'DEGRADED':
      score -= 30
      reasons.push('Instancia degradada')
      break
    case 'QR_PENDING':
      score -= 10
      reasons.push('Aguardando escaneamento do QR code')
      break
    case 'PROVISIONING':
      score -= 20
      reasons.push('Provisionando instancia')
      break
    case 'CONNECTED':
      break
  }

  if (signals.failureRatePercent !== undefined) {
    if (signals.failureRatePercent > 50) {
      score -= 30
      reasons.push(`Taxa de falha critica: ${signals.failureRatePercent.toFixed(1)}%`)
    } else if (signals.failureRatePercent > 20) {
      score -= 15
      reasons.push(`Taxa de falha elevada: ${signals.failureRatePercent.toFixed(1)}%`)
    } else if (signals.failureRatePercent > 5) {
      score -= 5
      reasons.push(`Taxa de falha: ${signals.failureRatePercent.toFixed(1)}%`)
    }
  }

  if (signals.circuitBreakerOpen) {
    score -= 25
    reasons.push('Evolution API indisponivel (circuit breaker aberto)')
  }

  if (signals.inWarmup) {
    score = Math.min(score, 80)
    reasons.push('Em periodo de aquecimento (dailyLimit reduzido)')
  }

  score = Math.max(0, Math.min(100, score))
  return { score, level: levelFromScore(score), reasons }
}

function todayUtc(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

async function getTodayUsage(instanceId: string): Promise<{ messagesSent: number; messagesFailed: number }> {
  const record = await prisma.qrApiUsageRecord.findUnique({
    where: { instanceId_date: { instanceId, date: todayUtc() } },
    select: { messagesSent: true, messagesFailed: true },
  })
  return { messagesSent: record?.messagesSent ?? 0, messagesFailed: record?.messagesFailed ?? 0 }
}

/**
 * Recalcula e persiste o healthScore. Se a FAIXA mudar (ex: good -> degraded),
 * dispara o webhook instance.health (alerta preditivo).
 */
export async function recalculateHealth(instanceId: string): Promise<number> {
  const instance = await prisma.qrApiInstance.findUnique({
    where: { id: instanceId },
    select: { id: true, status: true, warmupUntil: true, tenantId: true, healthScore: true },
  })
  if (!instance) return 0

  const { state: cbState } = getEvolutionCircuitState()
  const usage = await getTodayUsage(instanceId)
  const total = usage.messagesSent + usage.messagesFailed
  const failureRatePercent = total > 0 ? (usage.messagesFailed / total) * 100 : 0
  const inWarmup = instance.warmupUntil ? new Date(instance.warmupUntil) > new Date() : false

  const result = computeHealth({
    status: instance.status,
    failureRatePercent,
    inWarmup,
    circuitBreakerOpen: cbState === 'OPEN',
  })

  const previousLevel = levelFromScore(instance.healthScore ?? 100)

  await prisma.qrApiInstance.update({
    where: { id: instanceId },
    data: { healthScore: result.score },
  }).catch((err: any) => {
    logger.warn({ instanceId, err: err?.message }, '[health] falha ao atualizar healthScore')
  })

  if (result.level !== previousLevel) {
    logger.info({ instanceId, from: previousLevel, to: result.level, score: result.score }, '[health] faixa de saude mudou')
    await dispatchEvent(instanceId, 'instance.health', {
      instanceId,
      healthScore: result.score,
      level: result.level,
      previousLevel,
      reasons: result.reasons,
      timestamp: new Date().toISOString(),
    }).catch(() => {})
  }

  return result.score
}

/** Retorna o healthScore e nivel para exibicao na API. */
export async function getInstanceHealth(instanceId: string, tenantId: string): Promise<HealthResult | null> {
  const instance = await prisma.qrApiInstance.findFirst({
    where: { id: instanceId, tenantId },
    select: { status: true, warmupUntil: true },
  })
  if (!instance) return null

  const { state: cbState } = getEvolutionCircuitState()
  const usage = await getTodayUsage(instanceId)
  const total = usage.messagesSent + usage.messagesFailed
  const failureRatePercent = total > 0 ? (usage.messagesFailed / total) * 100 : 0
  const inWarmup = instance.warmupUntil ? new Date(instance.warmupUntil) > new Date() : false

  return computeHealth({
    status: instance.status,
    failureRatePercent,
    inWarmup,
    circuitBreakerOpen: cbState === 'OPEN',
  })
}
