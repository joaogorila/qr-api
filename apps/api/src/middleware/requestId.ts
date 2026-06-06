import type { Request, Response, NextFunction } from 'express'
import { randomBytes } from 'crypto'

declare global {
  namespace Express {
    interface Request {
      requestId: string
    }
  }
}

/**
 * Middleware: gera um request_id unico e injeta em req.requestId + header Request-Id.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = `req_${randomBytes(6).toString('hex')}`
  req.requestId = id
  res.setHeader('Request-Id', id)
  next()
}
