import { Router, raw } from 'express'
import prisma from '../prisma'
import logger from '../logger'
import { stripe } from '../billing/stripeClient'
import { mercadoPago } from '../billing/mercadoPagoClient'
import * as subscriptionService from '../services/subscriptionService'

const router = Router()

/**
 * Webhook do Stripe. Usa raw body (necessario para verificar assinatura).
 * Montado ANTES do express.json() no app.ts.
 */
router.post('/stripe', raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body)
  const event = stripe.verifyWebhook(rawBody, req.headers['stripe-signature'] as string | undefined)

  if (!event) {
    logger.warn('[billing-webhook] assinatura invalida')
    res.status(400).json({ error: 'invalid signature' })
    return
  }

  // Responde 200 rapido; processa em seguida
  res.json({ received: true })

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await subscriptionService.syncFromStripe(event.data.object)
        break

      case 'checkout.session.completed': {
        // A subscription ja vem em customer.subscription.created; nada extra aqui.
        logger.info({ id: event.data.object?.id }, '[billing-webhook] checkout concluido')
        break
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const inv = event.data.object
        const accountId = inv?.subscription_details?.metadata?.accountId ?? inv?.metadata?.accountId
        if (accountId) {
          await prisma.invoice.upsert({
            where: { stripeInvoiceId: inv.id },
            create: {
              accountId,
              stripeInvoiceId: inv.id,
              amountCents: inv.amount_paid ?? inv.amount_due ?? 0,
              currency: inv.currency ?? 'brl',
              status: event.type === 'invoice.paid' ? 'paid' : 'open',
              periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
              periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
              hostedUrl: inv.hosted_invoice_url ?? null,
            },
            update: { status: event.type === 'invoice.paid' ? 'paid' : 'open' },
          }).catch((err) => logger.warn({ err }, '[billing-webhook] falha ao gravar invoice'))
        }
        break
      }

      default:
        logger.debug({ type: event.type }, '[billing-webhook] evento ignorado')
    }
  } catch (err) {
    logger.error({ err, type: event?.type }, '[billing-webhook] erro ao processar')
  }
})

/**
 * Webhook do Mercado Pago. Notificacoes de preapproval (assinatura).
 * MP envia { type/action, data: { id } } e/ou query ?topic=&id=.
 */
router.post('/mercadopago', raw({ type: '*/*' }), async (req, res) => {
  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body ?? {})
  let body: any = {}
  try { body = JSON.parse(rawBody) } catch { /* pode vir vazio com dados na query */ }

  const dataId = body?.data?.id ?? (req.query['data.id'] as string) ?? (req.query.id as string) ?? ''
  if (!mercadoPago.verifyWebhook(req.headers as any, String(dataId))) {
    logger.warn('[billing-webhook] assinatura MP invalida')
    res.status(400).json({ error: 'invalid signature' })
    return
  }

  res.json({ received: true })

  try {
    const topic = String(body?.type ?? body?.topic ?? req.query.topic ?? '')
    if (dataId && (topic.includes('preapproval') || topic.includes('subscription'))) {
      const pre = await mercadoPago.getPreapproval(String(dataId))
      if (pre) await subscriptionService.syncFromMercadoPago(pre)
    } else {
      logger.debug({ topic, dataId }, '[billing-webhook] notificacao MP ignorada')
    }
  } catch (err) {
    logger.error({ err }, '[billing-webhook] erro ao processar MP')
  }
})

export default router
