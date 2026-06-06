import prisma from '../prisma'
import { getPlan } from '../billing/plans'

/**
 * MRR de uma assinatura (preco do plano x quantidade), so se utilizavel.
 */
function subscriptionMrr(sub: { planId: string; status: string; quantity: number } | null): number {
  if (!sub || (sub.status !== 'ACTIVE' && sub.status !== 'TRIALING')) return 0
  const plan = getPlan(sub.planId)
  return (plan?.priceMonthlyBRL ?? 0) * (sub.quantity ?? 1)
}

/**
 * Visao geral (cards do dashboard de operador).
 */
export async function overview() {
  const [accounts, subs, instances, today] = await Promise.all([
    prisma.account.count(),
    prisma.subscription.findMany({ select: { planId: true, status: true, quantity: true } }),
    prisma.qrApiInstance.groupBy({ by: ['status'], where: { revokedAt: null }, _count: true }),
    (async () => {
      const d = new Date(); d.setUTCHours(0, 0, 0, 0)
      return prisma.qrApiUsageRecord.aggregate({ where: { date: d }, _sum: { messagesSent: true, messagesFailed: true } })
    })(),
  ])

  const mrr = subs.reduce((sum, s) => sum + subscriptionMrr(s), 0)
  const activeSubs = subs.filter((s) => s.status === 'ACTIVE' || s.status === 'TRIALING').length
  const instancesByStatus: Record<string, number> = {}
  let instancesTotal = 0
  for (const g of instances) { instancesByStatus[g.status] = g._count; instancesTotal += g._count }

  return {
    accounts,
    activeSubscriptions: activeSubs,
    mrrBRL: mrr,
    arrBRL: mrr * 12,
    instances: { total: instancesTotal, byStatus: instancesByStatus },
    messagesToday: today._sum.messagesSent ?? 0,
    messagesFailedToday: today._sum.messagesFailed ?? 0,
  }
}

/**
 * Lista de clientes (contas) com busca por nome/email.
 */
export async function listAccounts(search?: string, limit = 50) {
  const where: any = {}
  if (search && search.trim()) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { users: { some: { email: { contains: search, mode: 'insensitive' } } } },
    ]
  }
  const accounts = await prisma.account.findMany({
    where,
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, suspendedAt: true, createdAt: true,
      users: { select: { email: true }, take: 1, orderBy: { createdAt: 'asc' } },
      subscription: { select: { planId: true, status: true, quantity: true, currentPeriodEnd: true } },
    },
  })

  const ids = accounts.map((a) => a.id)
  const instanceCounts = ids.length
    ? await prisma.qrApiInstance.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids }, revokedAt: null }, _count: true })
    : []
  const countMap = new Map(instanceCounts.map((g) => [g.tenantId, g._count]))

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.users[0]?.email ?? null,
    suspended: !!a.suspendedAt,
    plan: a.subscription?.planId ?? null,
    subscriptionStatus: a.subscription?.status ?? 'TRIALING',
    quantity: a.subscription?.quantity ?? 0,
    mrr: subscriptionMrr(a.subscription),
    instances: countMap.get(a.id) ?? 0,
    createdAt: a.createdAt,
  }))
}

/**
 * Detalhe de um cliente para o operador.
 */
export async function getAccountDetail(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true, name: true, suspendedAt: true, stripeCustomerId: true, createdAt: true,
      users: { select: { id: true, email: true, name: true, role: true, lastLoginAt: true } },
      subscription: true,
      invoices: { orderBy: { createdAt: 'desc' }, take: 12 },
    },
  })
  if (!account) return null

  const [instances, keys, usage] = await Promise.all([
    prisma.qrApiInstance.findMany({
      where: { tenantId: accountId, revokedAt: null },
      select: { id: true, name: true, status: true, phone: true, healthScore: true, dailyLimit: true, inboundMode: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.qrApiKey.findMany({
      where: { tenantId: accountId, revokedAt: null },
      select: { id: true, name: true, keyPrefix: true, mode: true, lastUsedAt: true, createdAt: true },
    }),
    (async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      return prisma.qrApiUsageRecord.aggregate({ where: { tenantId: accountId, date: { gte: since } }, _sum: { messagesSent: true, messagesFailed: true } })
    })(),
  ])

  return {
    account: { id: account.id, name: account.name, suspended: !!account.suspendedAt, stripeCustomerId: account.stripeCustomerId, createdAt: account.createdAt },
    users: account.users,
    subscription: account.subscription,
    mrr: subscriptionMrr(account.subscription),
    instances,
    keys,
    invoices: account.invoices,
    usage30d: { messagesSent: usage._sum.messagesSent ?? 0, messagesFailed: usage._sum.messagesFailed ?? 0 },
  }
}

export async function setSuspended(accountId: string, suspended: boolean) {
  return prisma.account.update({
    where: { id: accountId },
    data: { suspendedAt: suspended ? new Date() : null },
    select: { id: true, suspendedAt: true },
  })
}

/**
 * Visao operacional: instancias de todos os tenants (saude), com filtro por status.
 */
export async function listAllInstances(status?: string, limit = 100) {
  const where: any = { revokedAt: null }
  if (status) where.status = status
  return prisma.qrApiInstance.findMany({
    where,
    take: limit,
    orderBy: [{ healthScore: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, tenantId: true, name: true, status: true, phone: true, healthScore: true, dailyLimit: true, createdAt: true },
  })
}
