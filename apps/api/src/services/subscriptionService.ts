import prisma from '../prisma'
import { QrApiError } from '@flipt/qr-api-core'
import { PLANS, getPlan } from '../billing/plans'
import logger from '../logger'

// Mapeia plano -> Stripe Price ID (do ambiente). Sem isso, checkout roda em mock.
export function stripePriceFor(planId: string): string {
  const map: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    business: process.env.STRIPE_PRICE_BUSINESS,
  }
  return map[planId] ?? `price_mock_${planId}`
}

export async function getSubscription(accountId: string) {
  return prisma.subscription.findUnique({ where: { accountId } })
}

/**
 * Status efetivo: considera ACTIVE e TRIALING como "pode usar".
 */
export function isUsable(status: string | undefined): boolean {
  return status === 'ACTIVE' || status === 'TRIALING'
}

/**
 * Quantos numeros (instancias) a conta pode ter, conforme plano x quantity.
 */
export async function allowedInstances(accountId: string): Promise<number> {
  const sub = await getSubscription(accountId)
  if (!sub) return 1 // trial implicito: 1 numero
  const plan = getPlan(sub.planId)
  const perUnit = plan?.instancesIncluded ?? 1
  return perUnit * (sub.quantity ?? 1)
}

/**
 * Bloqueia provisionamento de instancia se exceder o plano.
 */
export async function assertNotSuspended(accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { suspendedAt: true } })
  if (account?.suspendedAt) {
    throw QrApiError.rateLimit('subscription_inactive', 'Conta suspensa. Entre em contato com o suporte.')
  }
}

export async function assertCanProvisionInstance(accountId: string): Promise<void> {
  await assertNotSuspended(accountId)
  const [allowed, active] = await Promise.all([
    allowedInstances(accountId),
    prisma.qrApiInstance.count({ where: { tenantId: accountId, revokedAt: null } }),
  ])
  if (active >= allowed) {
    throw QrApiError.rateLimit(
      'plan_limit_reached',
      `Seu plano permite ${allowed} numero(s). Faca upgrade para adicionar mais.`,
    )
  }
}

/**
 * Bloqueia envio se a assinatura nao estiver utilizavel (past_due/canceled).
 */
export async function assertActiveForSend(accountId: string): Promise<void> {
  await assertNotSuspended(accountId)
  const sub = await getSubscription(accountId)
  // Sem assinatura ainda = trial implicito permitido (apenas 1 numero ja limita).
  if (!sub) return
  if (!isUsable(sub.status)) {
    throw QrApiError.rateLimit(
      'subscription_inactive',
      `Assinatura ${sub.status.toLowerCase()}. Regularize o pagamento para continuar enviando.`,
    )
  }
}

/**
 * dailyLimit do plano (usado ao provisionar nova instancia).
 */
export async function planDailyLimit(accountId: string): Promise<number> {
  const sub = await getSubscription(accountId)
  const plan = sub ? getPlan(sub.planId) : null
  return plan?.dailyLimitPerInstance ?? parseInt(process.env.QR_API_DEFAULT_DAILY_LIMIT ?? '1000', 10)
}

/**
 * Sincroniza a assinatura a partir de um objeto subscription do Stripe (webhook).
 */
export async function syncFromStripe(stripeSub: any): Promise<void> {
  const accountId = stripeSub?.metadata?.accountId
  const planId = stripeSub?.metadata?.planId ?? 'starter'
  if (!accountId) {
    logger.warn('[subscription] webhook sem accountId no metadata, ignorando')
    return
  }

  const statusMap: Record<string, string> = {
    trialing: 'TRIALING',
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELED',
    unpaid: 'PAST_DUE',
    incomplete: 'INCOMPLETE',
    incomplete_expired: 'CANCELED',
  }
  const status = (statusMap[stripeSub.status] ?? 'INCOMPLETE') as any
  const quantity = stripeSub?.items?.data?.[0]?.quantity ?? 1
  const currentPeriodEnd = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : null

  await prisma.subscription.upsert({
    where: { accountId },
    create: {
      accountId, planId, status, quantity,
      stripeSubscriptionId: stripeSub.id,
      currentPeriodEnd,
      cancelAtPeriodEnd: !!stripeSub.cancel_at_period_end,
    },
    update: {
      planId, status, quantity,
      stripeSubscriptionId: stripeSub.id,
      currentPeriodEnd,
      cancelAtPeriodEnd: !!stripeSub.cancel_at_period_end,
    },
  })
  logger.info({ accountId, status, planId, quantity }, '[subscription] sincronizada do Stripe')
}

/**
 * Sincroniza a assinatura a partir de um preapproval do Mercado Pago (webhook).
 * O campo stripeSubscriptionId guarda o id do provedor (prefixado mp_).
 */
export async function syncFromMercadoPago(pre: any): Promise<void> {
  let ref: any = {}
  try { ref = JSON.parse(pre?.external_reference ?? '{}') } catch { /* ignore */ }
  const accountId = ref.accountId
  const planId = ref.planId ?? 'starter'
  const quantity = ref.quantity ?? 1
  if (!accountId) {
    logger.warn('[subscription] preapproval MP sem accountId no external_reference, ignorando')
    return
  }

  const statusMap: Record<string, string> = {
    authorized: 'ACTIVE',
    pending: 'INCOMPLETE',
    paused: 'PAST_DUE',
    cancelled: 'CANCELED',
  }
  const status = (statusMap[pre.status] ?? 'INCOMPLETE') as any
  const currentPeriodEnd = pre?.auto_recurring?.end_date ? new Date(pre.auto_recurring.end_date) : null

  await prisma.subscription.upsert({
    where: { accountId },
    create: { accountId, planId, status, quantity, stripeSubscriptionId: `mp_${pre.id}`, currentPeriodEnd },
    update: { planId, status, quantity, stripeSubscriptionId: `mp_${pre.id}`, currentPeriodEnd },
  })
  logger.info({ accountId, status, planId, quantity, provider: 'mercadopago' }, '[subscription] sincronizada do Mercado Pago')
}

/**
 * Cria/atualiza assinatura em modo mock (sem provedor real) apos checkout fake.
 */
export async function activateMock(accountId: string, planId: string, quantity: number): Promise<void> {
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await prisma.subscription.upsert({
    where: { accountId },
    create: { accountId, planId, status: 'ACTIVE', quantity, currentPeriodEnd: periodEnd },
    update: { planId, status: 'ACTIVE', quantity, currentPeriodEnd: periodEnd },
  })
}

export { PLANS }
