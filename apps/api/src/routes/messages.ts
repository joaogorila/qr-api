import { Router } from 'express'
import { sendMessageSchema, bulkSchema, toErrorBody, QrApiError } from '@flipt/qr-api-core'
import * as sendService from '../services/sendService'
import * as idempotencyService from '../services/idempotencyService'
import { requireScope } from '../middleware/auth'
import logger from '../logger'

const router = Router()

router.post('/', requireScope('messages:send'), async (req, res) => {
  const idempKey = req.headers['idempotency-key'] as string | undefined

  try {
    const input = sendMessageSchema.parse(req.body)

    // Idempotencia
    if (idempKey) {
      const bodyHash = idempotencyService.hashBody(req.body)
      const check = await idempotencyService.checkOrReserve(req.tenantId, input.instanceId, idempKey, bodyHash)
      if (check.hit) {
        res.status(check.responseCode).json(check.responseBody)
        return
      }
    }

    const message = await sendService.enqueueMessage(req.tenantId, input, idempKey)
    const body = { id: message.id, status: message.status, request_id: req.requestId }

    if (idempKey) {
      await idempotencyService.complete(input.instanceId, idempKey, 201, body)
    }

    res.status(201).json(body)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[messages] POST /')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.post('/bulk', requireScope('messages:send'), async (req, res) => {
  try {
    const bulk = bulkSchema.parse(req.body)
    const results: Array<{ id: string; status: string }> = []

    for (const item of bulk.messages) {
      try {
        const parsed = sendMessageSchema.parse({ ...item, instanceId: bulk.instanceId })
        const msg = await sendService.enqueueMessage(req.tenantId, parsed)
        results.push({ id: msg.id, status: msg.status })
      } catch (err) {
        results.push({ id: '', status: 'error' })
      }
    }

    res.status(201).json({ messages: results, count: results.length, request_id: req.requestId })
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[messages] POST /bulk')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.get('/', requireScope('messages:read'), async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit ?? '20'), 10)
    const startingAfter = req.query.starting_after as string | undefined
    const filters = {
      instanceId: req.query.instanceId as string | undefined,
      status: req.query.status as string | undefined,
      to: req.query.to as string | undefined,
    }
    const result = await sendService.listMessages(req.tenantId, filters, limit, startingAfter)
    res.json(result)
  } catch (err) {
    logger.error({ err }, '[messages] GET /')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.get('/:id', requireScope('messages:read'), async (req, res) => {
  try {
    const message = await sendService.getMessage(req.tenantId, req.params.id)
    res.json(message)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.delete('/:id', requireScope('messages:write'), async (req, res) => {
  try {
    const result = await sendService.cancelMessage(req.tenantId, req.params.id)
    res.json(result)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

router.post('/:id/read', requireScope('messages:write'), async (req, res) => {
  try {
    const result = await sendService.markRead(req.tenantId, req.params.id)
    res.json(result)
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

export default router
