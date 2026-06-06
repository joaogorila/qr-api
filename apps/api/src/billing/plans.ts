// Planos de billing por instancia (numero)
// TODO: Integrar Stripe ou PIX para cobranca real

export interface Plan {
  id: string
  name: string
  priceMonthlyBRL: number
  instancesIncluded: number
  dailyLimitPerInstance: number
  features: string[]
}

export const PLANS: Record<string, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthlyBRL: 99,
    instancesIncluded: 1,
    dailyLimitPerInstance: 1000,
    features: ['1 numero', '1000 mensagens/dia', 'Webhook com retry', 'Anti-ban automatico'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthlyBRL: 299,
    instancesIncluded: 5,
    dailyLimitPerInstance: 5000,
    features: ['5 numeros', '5000 mensagens/dia por numero', 'Health score', 'Warmup automatico', 'SDK oficial'],
  },
  business: {
    id: 'business',
    name: 'Business',
    priceMonthlyBRL: 899,
    instancesIncluded: 20,
    dailyLimitPerInstance: 10000,
    features: ['20 numeros', '10000 mensagens/dia por numero', 'SLA 99.9%', 'Suporte prioritario'],
  },
}

export function getPlan(planId: string): Plan | null {
  return PLANS[planId] ?? null
}
