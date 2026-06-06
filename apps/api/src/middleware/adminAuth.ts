import type { Request, Response, NextFunction } from 'express'
import { verifyJwt } from '../lib/jwt'
import { toErrorBody, QrApiError } from '@flipt/qr-api-core'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

function isAdminEmail(email: string): boolean {
  // Em dev sem lista configurada, libera qualquer usuario logado (conveniencia).
  if (ADMIN_EMAILS.length === 0) return process.env.NODE_ENV !== 'production'
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

/**
 * Auth do console de operador (admin). Reusa o JWT do portal (login),
 * mas so libera se o email estiver em ADMIN_EMAILS.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    const err = QrApiError.authentication('missing_token', 'Faca login de operador.')
    res.status(err.statusCode).json(toErrorBody(err, req.requestId))
    return
  }
  const payload = verifyJwt(header.slice(7).trim())
  if (!payload) {
    const err = QrApiError.authentication('invalid_token', 'Sessao invalida.')
    res.status(err.statusCode).json(toErrorBody(err, req.requestId))
    return
  }
  if (!isAdminEmail(payload.email)) {
    const err = QrApiError.permission('Acesso restrito a operadores.')
    res.status(err.statusCode).json(toErrorBody(err, req.requestId))
    return
  }
  req.portalUserId = payload.sub
  req.portalAccountId = payload.tid
  req.portalEmail = payload.email
  next()
}

export function adminEmailsConfigured(): boolean {
  return ADMIN_EMAILS.length > 0
}
