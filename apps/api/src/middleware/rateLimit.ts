import type { Request, Response, NextFunction } from 'express'
import redis from '../redis'
import { QrApiError, toErrorBody } from '@flipt/qr-api-core'

const RPS = parseInt(process.env.QR_API_RATE_LIMIT_RPS ?? '10', 10)
const WINDOW_SECONDS = 1

/**
 * Rate limiter simples por API key usando Redis.
 * Define headers RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset.
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const keyId = req.apiKeyId
  if (!keyId) { next(); return }

  const bucket = `rl:${keyId}`
  const now = Math.floor(Date.now() / 1000)
  const windowKey = `${bucket}:${now}`

  redis
    .multi()
    .incr(windowKey)
    .expire(windowKey, WINDOW_SECONDS + 1)
    .exec()
    .then((results) => {
      const count = (results?.[0]?.[1] as number) ?? 1

      res.setHeader('RateLimit-Limit', RPS)
      res.setHeader('RateLimit-Remaining', Math.max(0, RPS - count))
      res.setHeader('RateLimit-Reset', now + WINDOW_SECONDS)

      if (count > RPS) {
        res.setHeader('Retry-After', WINDOW_SECONDS)
        const err = QrApiError.rateLimit('too_many_requests', `Limite de ${RPS} req/s excedido.`)
        res.status(err.statusCode).json(toErrorBody(err, req.requestId))
        return
      }
      next()
    })
    .catch(() => {
      // Redis indisponivel: deixa passar (degraded gracefully)
      next()
    })
}
