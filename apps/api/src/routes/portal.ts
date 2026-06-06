import { Router } from 'express'
import { toErrorBody, QrApiError } from '@flipt/qr-api-core'
import prisma from '../prisma'
import logger from '../logger'
import { portalAuth } from '../middleware/portalAuth'
import * as authService from '../services/authService'
import * as keyService from '../services/keyService'
import * as subscriptionService from '../services/subscriptionService'
import * as instanceService from '../services/instanceService'
import { PLANS } from '../billing/plans'
import { stripe, stripeEnabled } from '../billing/stripeClient'
import { mercadoPago, mercadoPagoEnabled } from '../billing/mercadoPagoClient'

const DEFAULT_PROVIDER = process.env.BILLING_PROVIDER ?? 'mercadopago'

const router = Router()
const PORTAL_BASE = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:4500/portal'

function fail(res: any, err: any, reqId: string, ctx: string) {
  if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, reqId)); return }
  logger.error({ err }, `[portal] ${ctx}`)
  res.status(500).json(toErrorBody(QrApiError.internal(), reqId))
}

// ─── Auth publica ──────────────────────────────────────────────────────────────

router.post('/signup', async (req, res) => {
  try {
    const result = await authService.signup(req.body ?? {})
    res.status(201).json(result)
  } catch (err) { fail(res, err, req.requestId, 'signup') }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {}
    if (!email || !password) throw QrApiError.invalidRequest('missing_parameter', 'Email e senha sao obrigatorios.', 'email')
    res.json(await authService.login(email, password))
  } catch (err) { fail(res, err, req.requestId, 'login') }
})

// Planos (publico) + provedores de pagamento disponiveis
router.get('/plans', (_req, res) => {
  res.json({
    data: Object.values(PLANS),
    providers: { mercadopago: mercadoPagoEnabled, stripe: stripeEnabled },
    defaultProvider: DEFAULT_PROVIDER,
  })
})

// ─── Tudo abaixo exige login ─────────────────────────────────────────────────────
router.use(portalAuth)

// Visao geral da conta (dashboard)
router.get('/me', async (req, res) => {
  try {
    const accountId = req.portalAccountId!
    const [account, subscription, instances, allowed] = await Promise.all([
      prisma.account.findUnique({ where: { id: accountId }, select: { id: true, name: true, createdAt: true, stripeCustomerId: true } }),
      subscriptionService.getSubscription(accountId),
      prisma.qrApiInstance.count({ where: { tenantId: accountId, revokedAt: null } }),
      subscriptionService.allowedInstances(accountId),
    ])
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    const usageToday = await prisma.qrApiUsageRecord.aggregate({
      where: { tenantId: accountId, date: today },
      _sum: { messagesSent: true, messagesFailed: true },
    })
    res.json({
      account,
      user: { id: req.portalUserId, email: req.portalEmail },
      subscription: subscription ?? { status: 'TRIALING', planId: null, quantity: 0 },
      usage: { instances, allowedInstances: allowed, messagesSentToday: usageToday._sum.messagesSent ?? 0 },
      plans: Object.values(PLANS),
    })
  } catch (err) { fail(res, err, req.requestId, 'me') }
})

// Instancias (listagem para o dashboard)
router.get('/instances', async (req, res) => {
  try {
    const items = await prisma.qrApiInstance.findMany({
      where: { tenantId: req.portalAccountId!, revokedAt: null },
      select: { id: true, name: true, status: true, phone: true, healthScore: true, dailyLimit: true, inboundMode: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ data: items })
  } catch (err) { fail(res, err, req.requestId, 'instances') }
})

// Provisiona instancia via portal (sessao). Aplica enforcement de plano.
router.post('/instances/create', async (req, res) => {
  try {
    const { name, inboundMode } = req.body ?? {}
    if (!name) throw QrApiError.invalidRequest('missing_parameter', 'Nome e obrigatorio.', 'name')
    const inst = await instanceService.createInstance(req.portalAccountId!, { name, inboundMode: inboundMode ?? 'off' } as any)
    res.status(201).json(inst)
  } catch (err) { fail(res, err, req.requestId, 'instance create') }
})

// QR code da instancia (sessao)
router.get('/instances/:id/qr', async (req, res) => {
  try {
    const qr = await instanceService.getQrCode(req.portalAccountId!, req.params.id)
    res.json(qr)
  } catch (err) { fail(res, err, req.requestId, 'instance qr') }
})

// Chaves de API (gerenciamento via portal, auth de sessao)
router.get('/keys', async (req, res) => {
  try { res.json({ data: await keyService.listApiKeys(req.portalAccountId!) }) }
  catch (err) { fail(res, err, req.requestId, 'keys list') }
})

router.post('/keys', async (req, res) => {
  try {
    const { name, mode, scopes } = req.body ?? {}
    if (!name) throw QrApiError.invalidRequest('missing_parameter', 'Nome da chave e obrigatorio.', 'name')
    const key = await keyService.createApiKey(req.portalAccountId!, {
      name, mode: mode ?? 'live', scopes: scopes ?? ['messages:send', 'instances:read', 'instances:write', 'webhooks:write', 'phones:read'],
    } as any)
    res.status(201).json(key)
  } catch (err) { fail(res, err, req.requestId, 'keys create') }
})

router.delete('/keys/:id', async (req, res) => {
  try {
    await keyService.revokeApiKey(req.portalAccountId!, req.params.id)
    res.json({ id: req.params.id, revoked: true })
  } catch (err) { fail(res, err, req.requestId, 'keys revoke') }
})

// ─── Billing ─────────────────────────────────────────────────────────────────

// Inicia checkout de um plano (provedor: mercadopago | stripe)
router.post('/billing/checkout', async (req, res) => {
  try {
    const accountId = req.portalAccountId!
    const { planId, quantity = 1, provider } = req.body ?? {}
    const plan = PLANS[planId]
    if (!plan) throw QrApiError.invalidRequest('invalid_parameter', 'Plano invalido.', 'planId')
    const qty = Math.max(1, Number(quantity))
    const chosen = provider ?? DEFAULT_PROVIDER

    // ── Mercado Pago (PIX + cartao, foco BR) ──────────────────────────────────
    if (chosen === 'mercadopago') {
      const checkout = await mercadoPago.createSubscriptionCheckout({
        payerEmail: req.portalEmail!,
        amountBRL: plan.priceMonthlyBRL * qty,
        reason: `QR-API ${plan.name} (${qty} numero(s))`,
        accountId,
        planId,
        quantity: qty,
        backUrl: `${PORTAL_BASE}?checkout=success`,
      })
      if (!mercadoPagoEnabled) {
        await subscriptionService.activateMock(accountId, planId, qty)
      }
      res.json({ url: checkout.url, sessionId: checkout.id, provider: 'mercadopago', mock: !mercadoPagoEnabled })
      return
    }

    // ── Stripe (cartao internacional) ─────────────────────────────────────────
    const account = await prisma.account.findUnique({ where: { id: accountId } })
    let customerId = account?.stripeCustomerId
    if (!customerId) {
      customerId = await stripe.createCustomer(req.portalEmail!, account?.name ?? 'Conta', accountId)
      await prisma.account.update({ where: { id: accountId }, data: { stripeCustomerId: customerId } })
    }

    const session = await stripe.createCheckoutSession({
      customerId,
      priceId: subscriptionService.stripePriceFor(planId),
      quantity: qty,
      accountId,
      planId,
      successUrl: `${PORTAL_BASE}?checkout=success`,
      cancelUrl: `${PORTAL_BASE}?checkout=cancel`,
    })

    if (!stripeEnabled) {
      await subscriptionService.activateMock(accountId, planId, qty)
    }

    res.json({ url: session.url, sessionId: session.id, provider: 'stripe', mock: !stripeEnabled })
  } catch (err) { fail(res, err, req.requestId, 'checkout') }
})

// Abre o portal de cobranca do Stripe (gerenciar/cancelar)
router.post('/billing/portal', async (req, res) => {
  try {
    const account = await prisma.account.findUnique({ where: { id: req.portalAccountId! } })
    if (!account?.stripeCustomerId) throw QrApiError.invalidRequest('no_customer', 'Sem cliente de cobranca ainda.')
    const url = await stripe.createBillingPortalSession(account.stripeCustomerId, PORTAL_BASE)
    res.json({ url })
  } catch (err) { fail(res, err, req.requestId, 'billing portal') }
})

// Faturas (historico)
router.get('/billing/invoices', async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { accountId: req.portalAccountId! },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json({ data: invoices })
  } catch (err) { fail(res, err, req.requestId, 'invoices') }
})

export default router
