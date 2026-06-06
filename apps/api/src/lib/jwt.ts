// JWT HS256 minimalista usando apenas crypto nativo (sem dependencia jsonwebtoken).
import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.PORTAL_JWT_SECRET ?? 'dev-insecure-change-me'
const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60 // 7 dias

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export interface JwtPayload {
  sub: string       // userId
  tid: string       // tenantId/accountId
  email: string
  iat: number
  exp: number
  [k: string]: unknown
}

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, ttlSec = DEFAULT_TTL_SEC): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const full: JwtPayload = { ...payload, iat: now, exp: now + ttlSec }
  const head = b64url(JSON.stringify(header))
  const body = b64url(JSON.stringify(full))
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [head, body, sig] = parts
  const expected = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
