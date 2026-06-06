import prisma from '../prisma'
import { QrApiError } from '@flipt/qr-api-core'
import { hashPassword, verifyPassword } from '../lib/password'
import { signJwt } from '../lib/jwt'
import { createApiKey } from './keyService'
import { stripe } from '../billing/stripeClient'
import logger from '../logger'

export interface SignupInput {
  name: string
  email: string
  password: string
  companyName?: string
}

export async function signup(input: SignupInput) {
  const email = input.email.trim().toLowerCase()
  if (!email.includes('@')) throw QrApiError.invalidRequest('invalid_parameter', 'Email invalido.', 'email')
  if (input.password.length < 8) throw QrApiError.invalidRequest('invalid_parameter', 'Senha deve ter ao menos 8 caracteres.', 'password')

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw QrApiError.invalidRequest('email_taken', 'Ja existe uma conta com este email.', 'email')

  const passwordHash = await hashPassword(input.password)

  // Cria Account + User numa transacao
  const account = await prisma.account.create({
    data: {
      name: input.companyName?.trim() || input.name,
      users: {
        create: { email, passwordHash, name: input.name, role: 'OWNER' },
      },
    },
    include: { users: true },
  })

  // Cria customer no Stripe (ou mock) — best effort
  try {
    const customerId = await stripe.createCustomer(email, account.name, account.id)
    await prisma.account.update({ where: { id: account.id }, data: { stripeCustomerId: customerId } })
  } catch (err) {
    logger.warn({ err }, '[auth] falha ao criar customer Stripe (seguindo)')
  }

  // Gera uma chave de TESTE inicial automaticamente
  let testKey: string | null = null
  try {
    const k = await createApiKey(account.id, { name: 'Chave de teste', mode: 'test', scopes: ['*'] } as any)
    testKey = k.rawKey
  } catch (err) {
    logger.warn({ err }, '[auth] falha ao criar chave inicial')
  }

  const user = account.users[0]
  const token = signJwt({ sub: user.id, tid: account.id, email })
  return { token, user: publicUser(user), account: { id: account.id, name: account.name }, testKey }
}

export async function login(email: string, password: string) {
  const normalized = email.trim().toLowerCase()
  const user = await prisma.user.findUnique({ where: { email: normalized } })
  if (!user) throw QrApiError.authentication('invalid_credentials', 'Email ou senha incorretos.')
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) throw QrApiError.authentication('invalid_credentials', 'Email ou senha incorretos.')

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {})
  const token = signJwt({ sub: user.id, tid: user.accountId, email: user.email })
  return { token, user: publicUser(user) }
}

export function publicUser(u: { id: string; email: string; name: string; role: string; accountId: string }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, accountId: u.accountId }
}
