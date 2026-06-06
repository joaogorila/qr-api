import prisma from '../prisma'
import { evo, instanceNameFor } from './evolutionClient'
import { QrApiError } from '@flipt/qr-api-core'
import type { CreateInstanceInput, UpdateInstanceInput } from '@flipt/qr-api-core'
import { assertCanProvisionInstance, planDailyLimit } from './subscriptionService'
import logger from '../logger'

const PUBLIC_BASE = (process.env.QR_API_PUBLIC_BASE_URL ?? 'http://localhost:4500/v1').replace(/\/$/, '')

function webhookUrlFor(instanceId: string): string {
  return `${PUBLIC_BASE}/internal/evolution/${instanceId}`
}

export async function createInstance(tenantId: string, input: CreateInstanceInput) {
  // Enforcement de plano: bloqueia se exceder numeros contratados
  await assertCanProvisionInstance(tenantId)

  // Cria o registro primeiro para ter o ID
  const instance = await prisma.qrApiInstance.create({
    data: {
      tenantId,
      name: input.name,
      inboundMode: (input.inboundMode ?? 'off').toUpperCase() as 'OFF' | 'FOLLOWFY' | 'WEBHOOK',
      dailyLimit: input.dailyLimit ?? await planDailyLimit(tenantId),
      status: 'PROVISIONING',
    },
  })

  const evoName = instanceNameFor(instance.id)

  try {
    await evo.createInstance(evoName, webhookUrlFor(instance.id))
    await prisma.qrApiInstance.update({
      where: { id: instance.id },
      data: { evolutionInstanceId: evoName, status: 'QR_PENDING' },
    })
  } catch (err) {
    logger.error({ err, instanceId: instance.id }, '[instanceService] falha ao provisionar Evolution')
    // Deixa em PROVISIONING para retry posterior
  }

  // Cria webhook de saida se fornecido
  if (input.webhook) {
    await prisma.qrApiWebhook.create({
      data: {
        tenantId,
        instanceId: instance.id,
        url: input.webhook.url,
        secret: input.webhook.secret,
        events: input.webhook.events ?? ['*'],
      },
    })
  }

  return prisma.qrApiInstance.findUniqueOrThrow({ where: { id: instance.id } })
}

export async function listInstances(tenantId: string, limit = 20, startingAfter?: string) {
  const cursor = startingAfter ? { id: startingAfter } : undefined
  const items = await prisma.qrApiInstance.findMany({
    where: { tenantId, revokedAt: null },
    take: limit + 1,
    skip: cursor ? 1 : 0,
    cursor,
    orderBy: { createdAt: 'desc' },
  })
  const hasMore = items.length > limit
  return { data: items.slice(0, limit), has_more: hasMore, next_cursor: hasMore ? items[limit - 1]?.id ?? null : null }
}

export async function getInstance(tenantId: string, id: string) {
  const inst = await prisma.qrApiInstance.findFirst({ where: { id, tenantId } })
  if (!inst) throw QrApiError.notFound('Instancia')
  return inst
}

export async function getQrCode(tenantId: string, id: string) {
  const inst = await getInstance(tenantId, id)
  if (!inst.evolutionInstanceId) throw QrApiError.instance('instance_provisioning', 'Instancia ainda sendo provisionada.')
  if (inst.status === 'CONNECTED') throw QrApiError.instance('instance_not_connected', 'Instancia ja esta conectada.')
  return evo.fetchQrCode(inst.evolutionInstanceId)
}

export async function updateInstance(tenantId: string, id: string, input: UpdateInstanceInput) {
  await getInstance(tenantId, id)
  return prisma.qrApiInstance.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.inboundMode ? { inboundMode: input.inboundMode.toUpperCase() as 'OFF' | 'FOLLOWFY' | 'WEBHOOK' } : {}),
      ...(input.dailyLimit ? { dailyLimit: input.dailyLimit } : {}),
    },
  })
}

export async function restartInstance(tenantId: string, id: string) {
  const inst = await getInstance(tenantId, id)
  if (!inst.evolutionInstanceId) throw QrApiError.instance('instance_provisioning', 'Instancia ainda sendo provisionada.')
  await evo.restartInstance(inst.evolutionInstanceId)
  return { id, restarted: true }
}

export async function disconnectInstance(tenantId: string, id: string) {
  const inst = await getInstance(tenantId, id)
  if (!inst.evolutionInstanceId) throw QrApiError.instance('instance_provisioning', 'Instancia ainda sendo provisionada.')
  await evo.logoutInstance(inst.evolutionInstanceId)
  await prisma.qrApiInstance.update({ where: { id }, data: { status: 'DISCONNECTED' } })
  return { id, disconnected: true }
}

export async function deleteInstance(tenantId: string, id: string) {
  const inst = await getInstance(tenantId, id)
  if (inst.evolutionInstanceId) {
    await evo.deleteInstance(inst.evolutionInstanceId).catch((err) => {
      logger.warn({ err }, '[instanceService] falha ao deletar do Evolution (ignorando)')
    })
  }
  await prisma.qrApiInstance.update({ where: { id }, data: { revokedAt: new Date() } })
  return { id, deleted: true }
}

export async function pairInstance(tenantId: string, id: string, phone: string) {
  const inst = await getInstance(tenantId, id)
  if (!inst.evolutionInstanceId) throw QrApiError.instance('instance_provisioning', 'Instancia ainda sendo provisionada.')
  // TODO: Evolution API suporte a pair code (POST /instance/pairingCode/{name})
  logger.warn({ instanceId: id, phone }, '[instanceService] pairInstance: stub — Evolution pair code nao implementado')
  return { id, phone, status: 'pending' }
}
