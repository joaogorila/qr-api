import { Router } from 'express'
import { checkPhonesSchema, typingSchema, toErrorBody, QrApiError } from '@flipt/qr-api-core'
import { evo } from '../services/evolutionClient'
import prisma from '../prisma'
import { requireScope } from '../middleware/auth'
import logger from '../logger'

const router = Router()

async function getEvolutionId(tenantId: string, instanceId: string): Promise<string> {
  const inst = await prisma.qrApiInstance.findFirst({
    where: { id: instanceId, tenantId, revokedAt: null },
    select: { evolutionInstanceId: true, status: true },
  })
  if (!inst) throw QrApiError.notFound('Instancia')
  if (!inst.evolutionInstanceId) throw QrApiError.instance('instance_provisioning', 'Instancia ainda sendo provisionada.')
  if (inst.status !== 'CONNECTED') throw QrApiError.instance('instance_not_connected', 'Instancia nao esta conectada.')
  return inst.evolutionInstanceId
}

// GET /phones/:number/exists?instanceId=xxx
router.get('/:number/exists', requireScope('phones:read'), async (req, res) => {
  try {
    const instanceId = req.query.instanceId as string
    if (!instanceId) throw QrApiError.invalidRequest('missing_parameter', 'instanceId e obrigatorio', 'instanceId')
    const evoId = await getEvolutionId(req.tenantId, instanceId)
    const result: any = await evo.checkIsWhatsApp(evoId, [req.params.number])
    const exists = Array.isArray(result) ? result[0]?.exists ?? false : false
    res.json({ number: req.params.number, exists, request_id: req.requestId })
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[phones] GET /:number/exists')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

// POST /phones/exists — validacao em lote
router.post('/exists', requireScope('phones:read'), async (req, res) => {
  try {
    const { numbers } = checkPhonesSchema.parse(req.body)
    const instanceId = req.body.instanceId as string
    if (!instanceId) throw QrApiError.invalidRequest('missing_parameter', 'instanceId e obrigatorio', 'instanceId')
    const evoId = await getEvolutionId(req.tenantId, instanceId)
    const result = await evo.checkIsWhatsApp(evoId, numbers)
    res.json({ data: result, request_id: req.requestId })
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[phones] POST /exists')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

// GET /contacts/:number?instanceId=xxx
router.get('/contacts/:number', requireScope('phones:read'), async (req, res) => {
  try {
    const instanceId = req.query.instanceId as string
    if (!instanceId) throw QrApiError.invalidRequest('missing_parameter', 'instanceId e obrigatorio', 'instanceId')
    const evoId = await getEvolutionId(req.tenantId, instanceId)
    const profile = await evo.fetchProfile(evoId, req.params.number)
    res.json({ data: profile, request_id: req.requestId })
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[phones] GET /contacts/:number')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

// POST /typing
router.post('/typing', requireScope('messages:send'), async (req, res) => {
  try {
    const { instanceId, to, durationMs } = typingSchema.parse(req.body)
    const evoId = await getEvolutionId(req.tenantId, instanceId)
    await evo.sendPresence(evoId, to, 'composing', durationMs)
    res.json({ instanceId, to, durationMs, request_id: req.requestId })
  } catch (err) {
    if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
    logger.error({ err }, '[phones] POST /typing')
    res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
  }
})

export default router
