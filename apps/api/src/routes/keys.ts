import { Router } from 'express'
import { createKeySchema, toErrorBody, QrApiError } from '@flipt/qr-api-core'
import * as keyService from '../services/keyService'
import { requireScope } from '../middleware/auth'
import logger from '../logger'

const router = Router()

// Requer scope especial '*' (apenas chaves master podem criar outras)
router.post('/', requireScope('*'), async (req, res) => {
  try {
    const input = createKeySchema.parse(req.body)
    const key = await keyService.createApiKey(req.tenantId, input)
    res.status(201).json(key)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[keys] POST /')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.get('/', requireScope('*'), async (req, res) => {
  try {
    const keys = await keyService.listApiKeys(req.tenantId)
    res.json({ data: keys })
  } catch (err) {
    logger.error({ err }, '[keys] GET /')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.delete('/:id', requireScope('*'), async (req, res) => {
  try {
    await keyService.revokeApiKey(req.tenantId, req.params.id)
    res.json({ id: req.params.id, revoked: true })
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[keys] DELETE /:id')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

export default router
