// Pacing anti-ban: jitter + pausa periodica
// Replicado em embedded e standalone via este pacote core.

const MIN_DELAY_MS = 3_000
const MAX_DELAY_MS = 8_000
const PAUSE_EVERY_N = 100      // pausa longa a cada N mensagens
const PAUSE_DURATION_MS = 30_000  // 30s de respiro

/**
 * Calcula o delay (ms) a aguardar antes do proximo envio.
 * Aplica jitter aleatorio 3-8s e pausa de 30s a cada 100 mensagens.
 * Opcionalmente aplica fator de warmup (dia 1-7) e throttle preditivo por saude.
 *
 * @param countToday     Total de mensagens ja enviadas hoje por esta instancia.
 * @param warmupDay       Opcional: dia do aquecimento (1-7). undefined = madura.
 * @param healthThrottle  Multiplicador por saude (1 = normal, >1 desacelera).
 */
export function nextSendDelay(countToday: number, warmupDay?: number, healthThrottle = 1): number {
  // Pausa longa a cada PAUSE_EVERY_N
  let delay = (countToday > 0 && countToday % PAUSE_EVERY_N === 0)
    ? PAUSE_DURATION_MS
    : Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS

  // Warmup: multiplica pelo fator de aquecimento (dia 1 = 3x, dia 7 = 1x)
  if (warmupDay && warmupDay >= 1 && warmupDay <= 7) {
    const factor = Math.max(1, 4 - Math.floor(warmupDay / 2))
    delay = delay * factor
  }

  // Throttle preditivo por saude: instancia em risco envia mais devagar.
  if (healthThrottle > 1) {
    delay = delay * healthThrottle
  }

  return delay
}

/**
 * Verifica se a instancia ainda pode enviar mensagens hoje.
 *
 * @param countToday Mensagens enviadas hoje.
 * @param dailyLimit Limite configurado na instancia.
 */
export function withinDailyLimit(countToday: number, dailyLimit: number): boolean {
  return countToday < dailyLimit
}

/**
 * Calcula o limite diario para um numero em warmup.
 * Rampa de 5 dias: dia 1 = 20% do limite, cresce linearmente.
 *
 * @param warmupDaysRemaining Dias restantes de warmup (0 = maduro).
 * @param targetLimit Limite alvo apos o warmup.
 */
export function warmupDailyLimit(warmupDaysRemaining: number, targetLimit: number): number {
  if (warmupDaysRemaining <= 0) return targetLimit
  const totalWarmupDays = 5
  const elapsed = totalWarmupDays - warmupDaysRemaining
  const ratio = Math.max(0.2, elapsed / totalWarmupDays)
  return Math.floor(targetLimit * ratio)
}
