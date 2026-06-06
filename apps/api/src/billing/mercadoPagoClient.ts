// Cliente Mercado Pago minimalista via REST (fetch), sem SDK.
// Assinatura recorrente via Preapproval (cartao + PIX no checkout do MP).
// Sem MERCADOPAGO_ACCESS_TOKEN, opera em modo "mock" (URL fake) para dev.
import { createHmac, timingSafeEqual } from 'crypto'
import logger from '../logger'

const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN ?? ''
const MP_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? ''
const BASE = 'https://api.mercadopago.com'

export const mercadoPagoEnabled = !!MP_TOKEN

async function mpFetch(method: string, path: string, body?: Record<string, any>): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    logger.error({ status: res.status, path, error: json }, '[mercadopago] erro')
    throw new Error(json?.message ?? `Mercado Pago ${path} -> ${res.status}`)
  }
  return json
}

export const mercadoPago = {
  /**
   * Cria uma assinatura (preapproval) recorrente mensal. Retorna o init_point
   * (URL do checkout MP, onde o cliente paga com cartao ou PIX).
   * O valor ja vem multiplicado pela quantidade de numeros.
   */
  async createSubscriptionCheckout(opts: {
    payerEmail: string
    amountBRL: number
    reason: string
    accountId: string
    planId: string
    quantity: number
    backUrl: string
  }): Promise<{ url: string; id: string }> {
    if (!mercadoPagoEnabled) {
      return { url: `${opts.backUrl}&mock=1&plan=${opts.planId}&qty=${opts.quantity}`, id: `mp_mock_${Date.now()}` }
    }
    const pre = await mpFetch('POST', '/preapproval', {
      reason: opts.reason,
      payer_email: opts.payerEmail,
      back_url: opts.backUrl,
      external_reference: JSON.stringify({ accountId: opts.accountId, planId: opts.planId, quantity: opts.quantity }),
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: opts.amountBRL,
        currency_id: 'BRL',
      },
      status: 'pending',
    })
    return { url: pre.init_point, id: pre.id }
  },

  async getPreapproval(id: string): Promise<any | null> {
    if (!mercadoPagoEnabled) return null
    return mpFetch('GET', `/preapproval/${id}`)
  },

  /**
   * Verifica a assinatura do webhook MP (header x-signature: "ts=...,v1=...").
   * Template assinado: id:<dataId>;request-id:<x-request-id>;ts:<ts>;
   */
  verifyWebhook(headers: Record<string, any>, dataId: string): boolean {
    if (!mercadoPagoEnabled || !MP_WEBHOOK_SECRET) return true // dev/mock
    const sig = headers['x-signature']
    const reqId = headers['x-request-id']
    if (!sig) return false
    const parts = Object.fromEntries(String(sig).split(',').map((p) => p.split('=').map((s) => s.trim())))
    const ts = parts['ts']
    const v1 = parts['v1']
    if (!ts || !v1) return false
    const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`
    const expected = createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex')
    const a = Buffer.from(v1)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  },
}
