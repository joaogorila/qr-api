// Webhook interno chamado pela Evolution API (sem auth de API key — e a Evolution chamando).
// Montado FORA do /v1 em app.ts: app.use('/internal', internalWebhookRouter)

import { Router } from 'express'
import { handleInboundEvolution } from '../services/inboundService'

const router = Router()

// POST /internal/evolution/:instanceId
router.post('/evolution/:instanceId', (req, res) => {
  const { instanceId } = req.params
  // Responde imediatamente; processa em background (best-effort).
  res.json({ received: true })
  handleInboundEvolution(instanceId, req.body).catch(() => {})
})

export default router
