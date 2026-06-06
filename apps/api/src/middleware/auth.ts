import type { Request, Response, NextFunction } from 'express'
import { createHash } from 'crypto'
import prisma from '../prisma'
import { QrApiError, toErrorBody } from '@flipt/qr-api-core'

declare global {
  namespace Express {
    interface Request {
      tenantId: string
      apiKeyId: string
      apiKeyMode: 'TEST' | 'LIVE'
      apiKeyScopes: string[]
    }
  }
}

/**
 * Middleware de autenticacao por API key.
 * Espera: Authorization: Bearer sk_(test|live)_...
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = QrApiError.authentication('missing_api_key', 'Authorization header ausente. Use: Bearer sk_live_...')
    res.status(err.statusCode).json(toErrorBody(err, req.requestId))
    return
  }

  const rawKey = authHeader.slice(7).trim()
  if (!rawKey.startsWith('sk_test_') && !rawKey.startsWith('sk_live_')) {
    const err = QrApiError.authentication('invalid_api_key', 'Formato de chave invalido. Use sk_live_... ou sk_test_...')
    res.status(err.statusCode).json(toErrorBody(err, req.requestId))
    return
  }

  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  prisma.qrApiKey.findUnique({ where: { keyHash } })
    .then((key) => {
      if (!key) {
        const err = QrApiError.authentication('invalid_api_key', 'Chave de API invalida.')
        res.status(err.statusCode).json(toErrorBody(err, req.requestId))
        return
      }
      if (key.revokedAt) {
        const err = QrApiError.authentication('revoked_api_key', 'Esta chave foi revogada.')
        res.status(err.statusCode).json(toErrorBody(err, req.requestId))
        return
      }
      if (key.expiresAt && key.expiresAt < new Date()) {
        const err = QrApiError.authentication('expired_api_key', 'Esta chave expirou.')
        res.status(err.statusCode).json(toErrorBody(err, req.requestId))
        return
      }

      req.tenantId = key.tenantId
      req.apiKeyId = key.id
      req.apiKeyMode = key.mode
      req.apiKeyScopes = key.scopes

      // Atualiza lastUsedAt de forma nao-bloqueante
      prisma.qrApiKey.update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => { /* nao critico */ })

      next()
    })
    .catch((err) => {
      const apiErr = QrApiError.internal()
      res.status(apiErr.statusCode).json(toErrorBody(apiErr, req.requestId))
    })
}

/** Verifica se a chave tem o scope necessario. */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const scopes = req.apiKeyScopes
    // Scope "*" da acesso total
    if (scopes.includes('*') || scopes.includes(scope)) {
      next()
      return
    }
    const err = QrApiError.permission(`Scope necessario: ${scope}`)
    res.status(err.statusCode).json(toErrorBody(err, req.requestId))
  }
}
