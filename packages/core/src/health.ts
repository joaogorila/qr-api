import type { HealthSignals } from './types'

export type HealthLevel = 'healthy' | 'attention' | 'risk' | 'critical'

export interface HealthResult {
  score: number      // 0-100
  level: HealthLevel
  factors: string[]  // lista de fatores que reduziram o score (para debug/DX)
}

/**
 * Calcula o health score de uma instancia com base em sinais de risco.
 * Score 80-100: saudavel | 60-79: atencao | 40-59: risco | <40: critico
 */
export function computeHealthScore(signals: HealthSignals): HealthResult {
  let score = 100
  const factors: string[] = []

  // Fator 1: uso do limite diario
  const usageRatio = signals.dailyLimit > 0
    ? signals.messagesSentToday / signals.dailyLimit
    : 0

  if (usageRatio > 0.9) {
    score -= 20
    factors.push('uso_diario_critico')
  } else if (usageRatio > 0.7) {
    score -= 10
    factors.push('uso_diario_alto')
  }

  // Fator 2: razao inbound/outbound (inbound baixo = risco de ban)
  // ideal >= 0.3 (30% de respostas)
  if (signals.inboundRatio < 0.05) {
    score -= 25
    factors.push('inbound_muito_baixo')
  } else if (signals.inboundRatio < 0.15) {
    score -= 15
    factors.push('inbound_baixo')
  } else if (signals.inboundRatio < 0.3) {
    score -= 5
    factors.push('inbound_moderado')
  }

  // Fator 3: denuncias/bloqueios
  if (signals.blocksReported >= 10) {
    score -= 30
    factors.push('bloqueios_criticos')
  } else if (signals.blocksReported >= 5) {
    score -= 15
    factors.push('bloqueios_elevados')
  } else if (signals.blocksReported >= 2) {
    score -= 5
    factors.push('bloqueios_moderados')
  }

  // Fator 4: quedas de conexao
  if (signals.connectionDrops24h >= 5) {
    score -= 15
    factors.push('quedas_frequentes')
  } else if (signals.connectionDrops24h >= 2) {
    score -= 7
    factors.push('quedas_moderadas')
  }

  // Fator 5: warmup ativo = penalidade leve (numero nao maduro)
  if (signals.warmupDaysRemaining > 0) {
    const warmupPenalty = Math.ceil(signals.warmupDaysRemaining * 3)
    score -= warmupPenalty
    factors.push('em_warmup')
  }

  // Garantir intervalo 0-100
  score = Math.max(0, Math.min(100, score))

  let level: HealthLevel
  if (score >= 80) {
    level = 'healthy'
  } else if (score >= 60) {
    level = 'attention'
  } else if (score >= 40) {
    level = 'risk'
  } else {
    level = 'critical'
  }

  return { score, level, factors }
}

// ─── Helpers de faixa/throttle (espelham o embedded) ───────────────────────────
// Faixa de 5 niveis usada pelo throttle preditivo (anti-ban) e pelo webhook
// instance.health. Independente do `level` de 4 niveis acima (DX do health score).

export type HealthBand = 'excellent' | 'good' | 'degraded' | 'critical' | 'offline'

/**
 * Mapeia um score (0-100) para a faixa/banda de 5 niveis. Usado para detectar
 * mudanca de faixa (dispara webhook instance.health) e para o throttle preditivo.
 */
export function levelFromScore(score: number): HealthBand {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'degraded'
  if (score >= 10) return 'critical'
  return 'offline'
}

/**
 * Fator multiplicador de pacing por saude (throttle preditivo).
 * Quanto pior a saude, mais devagar enviamos para evitar ban.
 * excellent/good = 1x, degraded = 2x, critical = 4x, offline = 6x.
 */
export function healthThrottleFactor(score: number): number {
  const band = levelFromScore(score)
  switch (band) {
    case 'excellent':
    case 'good': return 1
    case 'degraded': return 2
    case 'critical': return 4
    case 'offline': return 6
  }
}
