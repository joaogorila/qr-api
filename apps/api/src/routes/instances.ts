import { Router } from 'express'
import { createInstanceSchema, updateInstanceSchema, pairSchema, toErrorBody, QrApiError } from '@flipt/qr-api-core'
import * as instanceService from '../services/instanceService'
import { getInstanceMetrics } from '../services/metricsService'
import { requireScope } from '../middleware/auth'
import logger from '../logger'

const router = Router()

router.post('/', requireScope('instances:write'), async (req, res) => {
  try {
    const input = createInstanceSchema.parse(req.body)
    const instance = await instanceService.createInstance(req.tenantId, input)
    res.status(201).json(instance)
  } catch (err) {
    if (err instanceof QrApiError) {
      res.status(err.statusCode).json(toErrorBody(err, req.requestId))
      return
    }
    logger.error({ err }, '[instances] POST /')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.get('/', requireScope('instances:read'), async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit ?? '20'), 10)
    const startingAfter = req.query.starting_after as string | undefined
    const result = await instanceService.listInstances(req.tenantId, limit, startingAfter)
    res.json(result)
  } catch (err) {
    logger.error({ err }, '[instances] GET /')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.get('/:id', requireScope('instances:read'), async (req, res) => {
  try {
    const instance = await instanceService.getInstance(req.tenantId, req.params.id)
    res.json(instance)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[instances] GET /:id')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.get('/:id/qr', requireScope('instances:read'), async (req, res) => {
  try {
    const qr = await instanceService.getQrCode(req.tenantId, req.params.id)
    res.json(qr)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[instances] GET /:id/qr')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.get('/:id/metrics', requireScope('instances:read'), async (req, res) => {
  try {
    const days = parseInt(String(req.query.days ?? '7'), 10)
    const metrics = await getInstanceMetrics(req.tenantId, req.params.id, days)
    res.json(metrics)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[instances] GET /:id/metrics')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.post('/:id/pair', requireScope('instances:write'), async (req, res) => {
  try {
    const { phone } = pairSchema.parse(req.body)
    const result = await instanceService.pairInstance(req.tenantId, req.params.id, phone)
    res.json(result)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[instances] POST /:id/pair')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.patch('/:id', requireScope('instances:write'), async (req, res) => {
  try {
    const input = updateInstanceSchema.parse(req.body)
    const instance = await instanceService.updateInstance(req.tenantId, req.params.id, input)
    res.json(instance)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[instances] PATCH /:id')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.post('/:id/restart', requireScope('instances:write'), async (req, res) => {
  try {
    const result = await instanceService.restartInstance(req.tenantId, req.params.id)
    res.json(result)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[instances] POST /:id/restart')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.post('/:id/disconnect', requireScope('instances:write'), async (req, res) => {
  try {
    const result = await instanceService.disconnectInstance(req.tenantId, req.params.id)
    res.json(result)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[instances] POST /:id/disconnect')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.delete('/:id', requireScope('instances:write'), async (req, res) => {
  try {
    const result = await instanceService.deleteInstance(req.tenantId, req.params.id)
    res.json(result)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[instances] DELETE /:id')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

export default router
