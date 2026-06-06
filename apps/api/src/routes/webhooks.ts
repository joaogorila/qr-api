import { Router } from 'express'
import { registerWebhookSchema, updateWebhookSchema, toErrorBody, QrApiError } from '@flipt/qr-api-core'
import * as webhookService from '../services/webhookService'
import { requireScope } from '../middleware/auth'
import logger from '../logger'

const router = Router()

router.post('/', requireScope('webhooks:write'), async (req, res) => {
  try {
    const input = registerWebhookSchema.parse(req.body)
    const wh = await webhookService.registerWebhook(req.tenantId, input)
    res.status(201).json(wh)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[webhooks] POST /')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.get('/', requireScope('webhooks:read'), async (req, res) => {
  try {
    const data = await webhookService.listWebhooks(req.tenantId)
    res.json({ data })
  } catch (err) {
    logger.error({ err }, '[webhooks] GET /')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.patch('/:id', requireScope('webhooks:write'), async (req, res) => {
  try {
    const input = updateWebhookSchema.parse(req.body)
    const wh = await webhookService.updateWebhook(req.tenantId, req.params.id, input)
    res.json(wh)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[webhooks] PATCH /:id')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.delete('/:id', requireScope('webhooks:write'), async (req, res) => {
  try {
    const result = await webhookService.deleteWebhook(req.tenantId, req.params.id)
    res.json(result)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[webhooks] DELETE /:id')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.get('/:id/deliveries', requireScope('webhooks:read'), async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit ?? '50'), 10)
    const data = await webhookService.listDeliveries(req.tenantId, req.params.id, limit)
    res.json({ data })
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[webhooks] GET /:id/deliveries')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.post('/:id/deliveries/:deliveryId/retry', requireScope('webhooks:write'), async (req, res) => {
  try {
    const result = await webhookService.retryDelivery(req.tenantId, req.params.id, req.params.deliveryId)
    res.json(result)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[webhooks] POST /:id/deliveries/:deliveryId/retry')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

export default router
