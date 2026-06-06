import { Router } from 'express'
import { z } from 'zod'
import { toErrorBody, QrApiError } from '@flipt/qr-api-core'
import * as groups from '../services/groupsService'
import { requireScope } from '../middleware/auth'
import logger from '../logger'

const router = Router()

const CreateGroupSchema = z.object({
  instanceId: z.string().min(1),
  subject: z.string().min(1),
  description: z.string().optional(),
  participants: z.array(z.string().min(7)).min(1),
})

const ParticipantsSchema = z.object({
  instanceId: z.string().min(1),
  action: z.enum(['add', 'remove', 'promote', 'demote']),
  participants: z.array(z.string().min(7)).min(1),
})

const UpdateGroupSchema = z.object({
  instanceId: z.string().min(1),
  subject: z.string().optional(),
  description: z.string().optional(),
})

function handleErr(err: unknown, req: any, res: any, route: string) {
  if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, req.requestId)); return }
  if (err instanceof z.ZodError) {
    const e = QrApiError.invalidRequest('invalid_parameter', err.issues[0]?.message ?? 'dados invalidos', String(err.issues[0]?.path?.[0] ?? ''))
    res.status(e.statusCode).json(toErrorBody(e, req.requestId)); return
  }
  logger.error({ err }, `[groups] ${route}`)
  res.status(500).json(toErrorBody(QrApiError.internal(), req.requestId))
}

// POST /groups — cria grupo
router.post('/', requireScope('groups:write'), async (req, res) => {
  try {
    const { instanceId, ...body } = CreateGroupSchema.parse(req.body)
    res.status(201).json(await groups.createGroup(req.tenantId, instanceId, body))
  } catch (err) { handleErr(err, req, res, 'POST /') }
})

// GET /groups?instanceId=&participants= — lista grupos
router.get('/', requireScope('groups:read'), async (req, res) => {
  try {
    const instanceId = String(req.query.instanceId ?? '')
    if (!instanceId) throw QrApiError.invalidRequest('missing_parameter', 'instanceId obrigatorio', 'instanceId')
    const data = await groups.listGroups(req.tenantId, instanceId, req.query.participants === 'true')
    res.json({ object: 'list', data })
  } catch (err) { handleErr(err, req, res, 'GET /') }
})

// GET /groups/:jid?instanceId= — detalhe
router.get('/:jid', requireScope('groups:read'), async (req, res) => {
  try {
    const instanceId = String(req.query.instanceId ?? '')
    if (!instanceId) throw QrApiError.invalidRequest('missing_parameter', 'instanceId obrigatorio', 'instanceId')
    res.json(await groups.getGroup(req.tenantId, instanceId, req.params.jid))
  } catch (err) { handleErr(err, req, res, 'GET /:jid') }
})

// GET /groups/:jid/invite?instanceId= — link de convite
router.get('/:jid/invite', requireScope('groups:read'), async (req, res) => {
  try {
    const instanceId = String(req.query.instanceId ?? '')
    if (!instanceId) throw QrApiError.invalidRequest('missing_parameter', 'instanceId obrigatorio', 'instanceId')
    res.json(await groups.getInviteCode(req.tenantId, instanceId, req.params.jid))
  } catch (err) { handleErr(err, req, res, 'GET /:jid/invite') }
})

// POST /groups/:jid/participants — add/remove/promote/demote
router.post('/:jid/participants', requireScope('groups:write'), async (req, res) => {
  try {
    const { instanceId, action, participants } = ParticipantsSchema.parse(req.body)
    res.json(await groups.updateParticipants(req.tenantId, instanceId, req.params.jid, action, participants))
  } catch (err) { handleErr(err, req, res, 'POST /:jid/participants') }
})

// PATCH /groups/:jid — atualiza nome/descricao
router.patch('/:jid', requireScope('groups:write'), async (req, res) => {
  try {
    const { instanceId, subject, description } = UpdateGroupSchema.parse(req.body)
    res.json(await groups.updateGroupInfo(req.tenantId, instanceId, req.params.jid, { subject, description }))
  } catch (err) { handleErr(err, req, res, 'PATCH /:jid') }
})

export default router
