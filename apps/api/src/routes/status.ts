import { Router } from 'express'
import { z } from 'zod'
import { toErrorBody, QrApiError } from '@flipt/qr-api-core'
import { evo } from '../services/evolutionClient'
import { resolveInstanceName } from '../services/resolveHelper'
import { requireScope } from '../middleware/auth'
import logger from '../logger'

const router = Router()

const StatusSchema = z.object({
  instanceId: z.string().min(1),
  type: z.enum(['text', 'image', 'video', 'audio']),
  content: z.string().min(1, 'content obrigatorio (texto ou URL/base64 da midia)'),
  caption: z.string().optional(),
  backgroundColor: z.string().optional(),
  font: z.number().int().optional(),
  statusJidList: z.array(z.string()).optional(),
  allContacts: z.boolean().optional(),
})

// POST /status — publica um status/story
router.post('/', requireScope('status:write'), async (req, res) => {
  try {
    const { instanceId, ...body } = StatusSchema.parse(req.body)
    const name = await resolveInstanceName(req.tenantId, instanceId)
    res.status(201).json(await evo.sendStatus(name, body))
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    if (err instanceof z.ZodError) {
      const e = QrApiError.invalidRequest('invalid_parameter', err.issues[0]?.message ?? 'dados invalidos')
      res.status(e.statusCode).json(toErrorBody(e, req.requestId)); return
    }
    logger.error({ err }, '[status] POST /')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

export default router
