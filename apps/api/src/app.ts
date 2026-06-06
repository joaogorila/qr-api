import express from 'express'
import path from 'path'
import { requestIdMiddleware } from './middleware/requestId'
import { apiKeyAuth } from './middleware/auth'
import { rateLimitMiddleware } from './middleware/rateLimit'
import instancesRouter from './routes/instances'
import messagesRouter from './routes/messages'
import phonesRouter from './routes/phones'
import webhooksRouter from './routes/webhooks'
import keysRouter from './routes/keys'
import metaRouter from './routes/meta'
import groupsRouter from './routes/groups'
import statusRouter from './routes/status'
import labelsRouter from './routes/labels'
import metricsRouter from './routes/metrics'
import internalWebhookRouter from './routes/internalWebhook'
import portalRouter from './routes/portal'
import adminRouter from './routes/admin'
import billingWebhookRouter from './routes/billingWebhook'
import { getEvolutionCircuitState } from './services/evolutionClient'
import { toErrorBody, QrApiError } from '@flipt/qr-api-core'

export function createApp() {
  const app = express()

  // Webhook do Stripe ANTES do express.json (precisa do raw body para assinatura)
  app.use('/webhooks/billing', requestIdMiddleware, billingWebhookRouter)

  app.use(express.json({ limit: '10mb' }))
  app.use(requestIdMiddleware)

  // Rota de health publica (sem auth)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() })
  })

  // Status page publica: estado do engine (Evolution) via circuit breaker
  app.get('/status', (_req, res) => {
    const cb = getEvolutionCircuitState()
    const up = cb.state === 'CLOSED'
    res.json({
      status: up ? 'operational' : 'degraded',
      engine: { state: cb.state, up },
      ts: new Date().toISOString(),
    })
  })

  // Webhook interno chamado pela Evolution API (sem apiKeyAuth)
  app.use('/internal', internalWebhookRouter)

  // Portal SaaS: API (signup/login/dashboard/billing) + frontend estatico
  app.use('/portal/api', portalRouter)
  app.use('/portal', express.static(path.join(__dirname, '..', 'public', 'portal')))

  // Console de operador (admin): API + frontend estatico
  app.use('/admin/api', adminRouter)
  app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')))

  // Todas as rotas /v1/* exigem autenticacao + rate limit
  const v1 = express.Router()
  v1.use(apiKeyAuth)
  v1.use(rateLimitMiddleware)

  v1.use('/instances', instancesRouter)
  v1.use('/messages', messagesRouter)
  v1.use('/phones', phonesRouter)
  v1.use('/webhooks', webhooksRouter)
  v1.use('/keys', keysRouter)
  v1.use('/groups', groupsRouter)
  v1.use('/status', statusRouter)
  v1.use('/labels', labelsRouter)
  v1.use('/metrics', metricsRouter)
  v1.use('/', metaRouter)

  app.use('/v1', v1)

  // 404 fallback
  app.use((req, res) => {
    const err = QrApiError.notFound(`Rota ${req.method} ${req.path}`)
    res.status(404).json(toErrorBody(err, (req as any).requestId ?? 'req_unknown'))
  })

  return app
}
