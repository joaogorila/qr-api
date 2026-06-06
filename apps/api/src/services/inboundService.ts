// Processa webhooks inbound da Evolution API para uma instancia QR-API (standalone).
// Espelha o embedded qrApiInbound.service.ts MAS sem io/inbox (o standalone nao tem
// inbox Followfy). O modo FOLLOWFY e tratado como WEBHOOK: so dispara webhook de saida.

import prisma from '../prisma'
import { dispatchEvent } from './webhookService'
import logger from '../logger'

type InstanceCtx = {
  id: string
  tenantId: string
  inboundMode: 'OFF' | 'FOLLOWFY' | 'WEBHOOK'
  status: string
}

/**
 * Processa o payload inbound da Evolution para uma instancia.
 *
 * A Evolution envia o campo `event` em minusculo-pontuado (`messages.upsert`,
 * `connection.update`), mesmo quando a subscricao usa MAIUSCULO_UNDERSCORE.
 * Normalizamos antes de rotear.
 */
export async function handleInboundEvolution(instanceId: string, body: any): Promise<void> {
  const instance = await prisma.qrApiInstance.findUnique({
    where: { id: instanceId },
    select: { id: true, tenantId: true, inboundMode: true, status: true },
  })

  if (!instance) {
    logger.warn({ instanceId }, '[inbound] instancia nao encontrada')
    return
  }

  const event = String(body?.event ?? '').toLowerCase().replace(/_/g, '.')
  const data = body?.data

  if (event === 'connection.update') {
    await handleConnectionUpdate(instance, data)
    return
  }
  if (event === 'qrcode.updated') {
    await handleQrUpdate(instance)
    return
  }
  if (event === 'messages.upsert') {
    await handleMessagesUpsert(instance, data)
    return
  }
  if (event === 'messages.update') {
    await handleMessagesUpdate(instance, data)
    return
  }
  // Demais eventos sao ignorados silenciosamente.
}

async function handleQrUpdate(instance: InstanceCtx): Promise<void> {
  if (instance.status === 'QR_PENDING') return
  await prisma.qrApiInstance.update({
    where: { id: instance.id },
    data: { status: 'QR_PENDING' },
  }).catch(() => {})
}

async function handleConnectionUpdate(instance: InstanceCtx, data: any): Promise<void> {
  const state = (data?.state ?? data?.instance?.state) as string | undefined
  let newStatus: 'CONNECTED' | 'DISCONNECTED' | 'QR_PENDING' | null = null

  if (state === 'open') newStatus = 'CONNECTED'
  else if (state === 'close') newStatus = 'DISCONNECTED'
  else if (state === 'connecting') newStatus = 'QR_PENDING'

  if (!newStatus) return

  await prisma.qrApiInstance.update({
    where: { id: instance.id },
    data: { status: newStatus },
  }).catch(() => {})

  const event = newStatus === 'CONNECTED' ? 'instance.connected' : 'instance.disconnected'
  await dispatchEvent(instance.id, event, {
    instanceId: instance.id,
    status: newStatus,
    timestamp: new Date().toISOString(),
  }).catch(() => {})
}

async function handleMessagesUpsert(instance: InstanceCtx, data: any): Promise<void> {
  const messages: any[] = Array.isArray(data) ? data : [data]

  // O standalone nao tem inbox. No modo FOLLOWFY apenas registramos o fato e
  // seguimos como WEBHOOK (so webhook de saida).
  if (instance.inboundMode === 'FOLLOWFY') {
    logger.info(
      { instanceId: instance.id },
      '[inbound] modo FOLLOWFY tratado como WEBHOOK: inbox nao existe no standalone',
    )
  }

  for (const msg of messages) {
    const isInbound = msg?.key && !msg.key.fromMe
    if (!isInbound) continue

    // OFF, WEBHOOK e FOLLOWFY: sempre dispara webhook de mensagem recebida.
    await dispatchEvent(instance.id, 'message.received', {
      instanceId: instance.id,
      messageId: msg.key?.id,
      from: msg.key?.remoteJid,
      type: detectMessageType(msg.message),
      body: extractBody(msg.message),
      timestamp: msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString(),
      raw: msg,
    }).catch(() => {})
  }
}

async function handleMessagesUpdate(instance: InstanceCtx, data: any): Promise<void> {
  const updates: any[] = Array.isArray(data) ? data : [data]

  const statusMap: Record<string, string> = {
    SERVER_ACK: 'SENT',
    DELIVERY_ACK: 'DELIVERED',
    READ: 'READ',
    PLAYED: 'READ',
    '1': 'SENT', '2': 'SENT', '3': 'DELIVERED', '4': 'READ', '5': 'READ',
  }

  for (const update of updates) {
    const evolutionId = update?.key?.id
    if (!evolutionId) continue

    const rawStatus = String(update?.update?.status ?? '')
    const newStatus = statusMap[rawStatus]
    if (!newStatus || newStatus === 'SENT') continue // SENT ja foi setado no envio

    const msg = await prisma.qrApiMessage.findFirst({
      where: { evolutionId, instanceId: instance.id },
      select: { id: true },
    })
    if (!msg) continue

    const now = new Date()
    const dateField = newStatus === 'DELIVERED' ? 'deliveredAt' : 'readAt'
    await prisma.qrApiMessage.update({
      where: { id: msg.id },
      data: { status: newStatus as any, [dateField]: now },
    }).catch(() => {})

    await dispatchEvent(instance.id, 'message.status', {
      instanceId: instance.id,
      messageId: msg.id,
      evolutionId,
      status: newStatus.toLowerCase(),
      timestamp: now.toISOString(),
    }).catch(() => {})
  }
}

function detectMessageType(message: any): string {
  if (!message) return 'unknown'
  if (message.conversation || message.extendedTextMessage) return 'text'
  if (message.imageMessage) return 'image'
  if (message.videoMessage) return 'video'
  if (message.audioMessage) return 'audio'
  if (message.documentMessage) return 'document'
  if (message.stickerMessage) return 'sticker'
  if (message.locationMessage) return 'location'
  if (message.contactMessage) return 'contact'
  if (message.reactionMessage) return 'reaction'
  return 'unknown'
}

function extractBody(message: any): string | null {
  if (!message) return null
  if (message.conversation) return message.conversation
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text
  if (message.imageMessage?.caption) return message.imageMessage.caption
  if (message.videoMessage?.caption) return message.videoMessage.caption
  if (message.documentMessage?.caption) return message.documentMessage.caption
  return null
}
