import { Router } from 'express'
import prisma from '../prisma'

const router = Router()

// GET /me — informacoes da chave autenticada
router.get('/me', async (req, res) => {
  const key = await prisma.qrApiKey.findUnique({
    where: { id: req.apiKeyId },
    select: { id: true, name: true, mode: true, scopes: true, lastUsedAt: true, tenantId: true },
  })
  res.json({ ...key, request_id: req.requestId })
})

// GET /health — status do servico (publico, sem auth)
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() })
})

export default router
