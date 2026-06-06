// Cliente Stripe minimalista via REST (fetch), sem o SDK oficial.
// Cobre checkout, customer e verificacao de assinatura de webhook.
// Se STRIPE_SECRET_KEY nao estiver setada, opera em modo "mock" (retorna URLs fake)
// para permitir desenvolvimento/portal sem conta Stripe.
import { createHmac, timingSafeEqual } from 'crypto'
import logger from '../logger'

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? ''
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''
const BASE = 'https://api.stripe.com/v1'

export const stripeEnabled = !!STRIPE_SECRET

function toForm(obj: Record<string, any>, prefix = ''): string[] {
  const pairs: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object' && !Array.isArray(v)) {
      pairs.push(...toForm(v, key))
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') pairs.push(...toForm(item, `${key}[${i}]`))
        else pairs.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`)
      })
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
    }
  }
  return pairs
}

async function stripeFetch(method: string, path: string, body?: Record<string, any>): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    ...(body ? { body: toForm(body).join('&') } : {}),
  })
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    logger.error({ status: res.status, path, error: json?.error }, '[stripe] erro')
    throw new Error(json?.error?.message ?? `Stripe ${path} -> ${res.status}`)
  }
  return json
}

export const stripe = {
  async createCustomer(email: string, name: string, accountId: string): Promise<string> {
    if (!stripeEnabled) return `cus_mock_${accountId.slice(0, 8)}`
    const c = await stripeFetch('POST', '/customers', { email, name, 'metadata[accountId]': accountId })
    return c.id
  },

  /**
   * Cria sessao de checkout para uma assinatura.
   * priceId vem do mapeamento de plano (STRIPE_PRICE_*).
   */
  async createCheckoutSession(opts: {
    customerId: string
    priceId: string
    quantity: number
    accountId: string
    planId: string
    successUrl: string
    cancelUrl: string
  }): Promise<{ url: string; id: string }> {
    if (!stripeEnabled) {
      // Modo mock: devolve a URL de sucesso direto (simula pagamento aprovado)
      return { url: `${opts.successUrl}?mock=1&plan=${opts.planId}&qty=${opts.quantity}`, id: `cs_mock_${Date.now()}` }
    }
    const session = await stripeFetch('POST', '/checkout/sessions', {
      mode: 'subscription',
      customer: opts.customerId,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      'line_items[0][price]': opts.priceId,
      'line_items[0][quantity]': opts.quantity,
      'metadata[accountId]': opts.accountId,
      'metadata[planId]': opts.planId,
      'subscription_data[metadata][accountId]': opts.accountId,
      'subscription_data[metadata][planId]': opts.planId,
    })
    return { url: session.url, id: session.id }
  },

  async createBillingPortalSession(customerId: string, returnUrl: string): Promise<string> {
    if (!stripeEnabled) return `${returnUrl}?mock_portal=1`
    const s = await stripeFetch('POST', '/billing_portal/sessions', { customer: customerId, return_url: returnUrl })
    return s.url
  },

  /**
   * Verifica a assinatura do webhook (header Stripe-Signature).
   * Implementa o esquema v1=HMAC-SHA256(timestamp.payload) do Stripe.
   */
  verifyWebhook(rawBody: string, signatureHeader: string | undefined): any | null {
    if (!stripeEnabled || !STRIPE_WEBHOOK_SECRET) {
      // Sem secret: aceita o corpo como JSON (modo dev/mock)
      try { return JSON.parse(rawBody) } catch { return null }
    }
    if (!signatureHeader) return null
    const parts = Object.fromEntries(signatureHeader.split(',').map((p) => p.split('=')))
    const timestamp = parts['t']
    const sig = parts['v1']
    if (!timestamp || !sig) return null
    const expected = createHmac('sha256', STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    try { return JSON.parse(rawBody) } catch { return null }
  },
}
