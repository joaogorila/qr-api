import { Router } from 'express'
import { toErrorBody, QrApiError } from '@flipt/qr-api-core'
import logger from '../logger'
import { adminAuth } from '../middleware/adminAuth'
import * as adminService from '../services/adminService'

const router = Router()

function fail(res: any, err: any, reqId: string, ctx: string) {
  if (err instanceof QrApiError) { res.status(err.statusCode).json(toErrorBody(err, reqId)); return }
  logger.error({ err }, `[admin] ${ctx}`)
  res.status(500).json(toErrorBody(QrApiError.internal(), reqId))
}

router.use(adminAuth)

router.get('/overview', async (req, res) => {
  try { res.json(await adminService.overview()) }
  catch (err) { fail(res, err, req.requestId, 'overview') }
})

router.get('/accounts', async (req, res) => {
  try {
    const search = (req.query.search as string) ?? ''
    res.json({ data: await adminService.listAccounts(search) })
  } catch (err) { fail(res, err, req.requestId, 'accounts') }
})

router.get('/accounts/:id', async (req, res) => {
  try {
    const detail = await adminService.getAccountDetail(req.params.id)
    if (!detail) throw QrApiError.notFound('Conta')
    res.json(detail)
  } catch (err) { fail(res, err, req.requestId, 'account detail') }
})

router.post('/accounts/:id/suspend', async (req, res) => {
  try { res.json(await adminService.setSuspended(req.params.id, true)) }
  catch (err) { fail(res, err, req.requestId, 'suspend') }
})

router.post('/accounts/:id/unsuspend', async (req, res) => {
  try { res.json(await adminService.setSuspended(req.params.id, false)) }
  catch (err) { fail(res, err, req.requestId, 'unsuspend') }
})

router.get('/instances', async (req, res) => {
  try {
    const status = (req.query.status as string) || undefined
    res.json({ data: await adminService.listAllInstances(status) })
  } catch (err) { fail(res, err, req.requestId, 'instances') }
})

export default router
