import type { Request, Response, NextFunction } from 'express'
import { verifyJwt } from '../lib/jwt'
import { toErrorBody, QrApiError } from '@flipt/qr-api-core'

declare global {
  namespace Express {
    interface Request {
      portalUserId?: string
      portalAccountId?: string
      portalEmail?: string
    }
  }
}

/**
 * Auth do portal via JWT (Authorization: Bearer <jwt>).
 * Diferente do apiKeyAuth (que e para a API publica /v1 com sk_...).
 */
export function portalAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    const err = QrApiError.authentication('missing_token', 'Faca login para acessar o portal.')
    res.status(err.statusCode).json(toErrorBody(err, req.requestId))
    return
  }
  const payload = verifyJwt(header.slice(7).trim())
  if (!payload) {
    const err = QrApiError.authentication('invalid_token', 'Sessao invalida ou expirada. Faca login novamente.')
    res.status(err.statusCode).json(toErrorBody(err, req.requestId))
    return
  }
  req.portalUserId = payload.sub
  req.portalAccountId = payload.tid
  req.portalEmail = payload.email
  next()
}
