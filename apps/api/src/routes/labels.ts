import { Router } from 'express'
import { z } from 'zod'
import { toErrorBody, QrApiError } from '@flipt/qr-api-core'
import { evo } from '../services/evolutionClient'
import { resolveInstanceName } from '../services/resolveHelper'
import { requireScope } from '../middleware/auth'
import logger from '../logger'

const router = Router()

// GET /labels?instanceId= — lista etiquetas
router.get('/', requireScope('labels:read'), async (req, res) => {
  try {
    const instanceId = String(req.query.instanceId ?? '')
    if (!instanceId) throw QrApiError.invalidRequest('missing_parameter', 'instanceId obrigatorio', 'instanceId')
    const name = await resolveInstanceName(req.tenantId, instanceId)
    res.json({ object: 'list', data: await evo.findLabels(name) })
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[labels] GET /')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

const ApplySchema = z.object({
  instanceId: z.string().min(1),
  number: z.string().min(7),
  labelId: z.string().min(1),
  action: z.enum(['add', 'remove']),
})

// POST /labels/apply — aplica/remove etiqueta de um chat
router.post('/apply', requireScope('labels:write'), async (req, res) => {
  try {
    const { instanceId, number, labelId, action } = ApplySchema.parse(req.body)
    const name = await resolveInstanceName(req.tenantId, instanceId)
    res.json(await evo.handleLabel(name, number, labelId, action))
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    if (err instanceof z.ZodError) {
      const e = QrApiError.invalidRequest('invalid_parameter', err.issues[0]?.message ?? 'dados invalidos')
      res.status(e.statusCode).json(toErrorBody(e, req.requestId)); return
    }
    logger.error({ err }, '[labels] POST /apply')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

export default router
