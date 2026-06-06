// Worker de health + warmup (Onda 3). Espelha o embedded qrApiWarmup.worker.ts.
// - tickWarmup (a cada 6h): sobe o dailyLimit de instancias em aquecimento (rampa)
//   e limpa idempotency keys expiradas.
// - tickHealth (a cada 15min): recalcula healthScore e dispara webhook instance.health
//   quando a faixa muda.

import prisma from '../prisma'
import { recalculateHealth } from '../services/healthService'
import logger from '../logger'

const WARMUP_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h
const HEALTH_INTERVAL_MS = 15 * 60 * 1000      // 15 min

let _warmupInterval: ReturnType<typeof setInterval> | undefined
let _healthInterval: ReturnType<typeof setInterval> | undefined

async function tickWarmup(): Promise<void> {
  const now = new Date()
  const warmupInstances = await prisma.qrApiInstance.findMany({
    where: { warmupUntil: { gte: now }, revokedAt: null, status: 'CONNECTED' },
    select: { id: true, dailyLimit: true, createdAt: true },
  })

  for (const inst of warmupInstances) {
    const warmupDays = parseInt(process.env.QR_API_WARMUP_DAYS ?? '5', 10)
    const defaultLimit = parseInt(process.env.QR_API_DEFAULT_DAILY_LIMIT ?? '1000', 10)
    const elapsed = now.getTime() - inst.createdAt.getTime()
    const daysPassed = Math.min(elapsed / (24 * 60 * 60 * 1000), warmupDays)
    const progress = daysPassed / warmupDays

    // Rampa: comeca em 20% do limite e vai a 100% no fim do warmup.
    const targetLimit = Math.round(defaultLimit * (0.2 + 0.8 * progress))

    if (targetLimit > inst.dailyLimit) {
      await prisma.qrApiInstance.update({
        where: { id: inst.id },
        data: { dailyLimit: targetLimit },
      }).catch(() => {})
      logger.info({ instanceId: inst.id, newLimit: targetLimit, progress: Math.round(progress * 100) }, '[health] dailyLimit (warmup) atualizado')
    }
  }

  // Limpeza de idempotency keys expiradas.
  await prisma.qrApiIdempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {})
}

async function tickHealth(): Promise<void> {
  const instances = await prisma.qrApiInstance.findMany({
    where: { revokedAt: null, status: { notIn: ['BANNED', 'DISCONNECTED'] } },
    select: { id: true },
    take: 100,
  })
  for (const inst of instances) {
    await recalculateHealth(inst.id).catch(() => {})
  }
}

export function startHealthWorker(): void {
  // Tick imediato no boot.
  tickWarmup().catch(() => {})
  tickHealth().catch(() => {})

  _warmupInterval = setInterval(() => {
    tickWarmup().catch((err) => logger.warn({ err: err?.message }, '[health] erro no tick warmup'))
  }, WARMUP_INTERVAL_MS)

  _healthInterval = setInterval(() => {
    tickHealth().catch((err) => logger.warn({ err: err?.message }, '[health] erro no tick health'))
  }, HEALTH_INTERVAL_MS)

  _warmupInterval.unref?.()
  _healthInterval.unref?.()

  logger.info('[health] worker iniciado (warmup 6h, health 15min)')
}

export function stopHealthWorker(): void {
  if (_warmupInterval) { clearInterval(_warmupInterval); _warmupInterval = undefined }
  if (_healthInterval) { clearInterval(_healthInterval); _healthInterval = undefined }
}
