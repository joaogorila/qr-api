// Hash de senha com scrypt nativo (sem dependencia bcrypt).
import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)
const KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, hash] = parts
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer
  const stack = Buffer.from(hash, 'hex')
  if (stack.length !== derived.length) return false
  return timingSafeEqual(stack, derived)
}
