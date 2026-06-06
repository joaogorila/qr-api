// Tipos compartilhados entre deploys (embedded + standalone)

export type InboundMode = 'off' | 'webhook' | 'followfy'

export type InstanceStatus =
  | 'provisioning'
  | 'qr_pending'
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'banned'

export type MessageStatus =
  | 'queued'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'cancelled'

export type KeyMode = 'test' | 'live'

// Eventos emitidos via webhook de saida
export type WebhookEventType =
  | 'message.received'
  | 'message.status'
  | 'instance.connected'
  | 'instance.disconnected'
  | 'instance.health'
  | 'instance.qr_updated'

export interface WebhookEvent {
  event: WebhookEventType
  instanceId: string
  tenantId: string
  timestamp: string // ISO8601
  data: Record<string, unknown>
}

// Paginacao cursor (padrao em todas as listagens)
export interface CursorPage<T> {
  data: T[]
  has_more: boolean
  next_cursor: string | null
}

// Sinais para calculo do health score
export interface HealthSignals {
  messagesSentToday: number
  dailyLimit: number
  inboundRatio: number        // recebidas/enviadas (0-1+)
  blocksReported: number      // denuncias/bloqueios (estimativa)
  connectionDrops24h: number  // quedas nas ultimas 24h
  warmupDaysRemaining: number // 0 = ja maduro
}
