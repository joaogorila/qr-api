import { Router } from 'express'
import { toErrorBody, QrApiError } from '@flipt/qr-api-core'
import { getAccountMetricsSummary } from '../services/metricsService'
import { requireScope } from '../middleware/auth'
import logger from '../logger'

const router = Router()

// GET /v1/metrics — visao geral agregada de todas as instancias do tenant
router.get('/', requireScope('instances:read'), async (req, res) => {
  try {
    const summary = await getAccountMetricsSummary(req.tenantId)
    res.json(summary)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[metrics] GET /')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

export default router
