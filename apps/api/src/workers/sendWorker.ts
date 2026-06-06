import { Worker } from 'bullmq'
import prisma from '../prisma'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
import { evo } from '../services/evolutionClient'
import { nextSendDelay, healthThrottleFactor, levelFromScore, QrApiError } from '@flipt/qr-api-core'
import type { SendMessageInput } from '@flipt/qr-api-core'
import { meteringService } from '../billing/meteringService'
import logger from '../logger'

interface SendJobData {
  messageId: string
  instanceId: string
  evolutionInstanceId: string | null
  payload: SendMessageInput
}

async function processSend(data: SendJobData): Promise<void> {
  const { messageId, instanceId, evolutionInstanceId, payload } = data

  if (!evolutionInstanceId) {
    throw new Error(`Instancia ${instanceId} sem evolutionInstanceId`)
  }

  // Carrega instancia (tenantId + sinais para throttle preditivo por saude)
  const instance = await prisma.qrApiInstance.findUnique({
    where: { id: instanceId },
    select: { tenantId: true, healthScore: true, dailyLimit: true, warmupUntil: true },
  })
  const tenantId = instance?.tenantId ?? ''
  const healthScore = instance?.healthScore ?? 100
  const dailyLimit = instance?.dailyLimit ?? 1000

  // Busca quantas mensagens foram enviadas hoje (para o pacing + limite efetivo)
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
  const countToday = await prisma.qrApiMessage.count({
    where: { instanceId, createdAt: { gte: startOfDay }, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
  })

  // Throttle preditivo por saude: instancia em risco tem limite efetivo reduzido.
  const healthLevel = levelFromScore(healthScore)
  const limitFactor = healthLevel === 'critical' || healthLevel === 'offline' ? 0.5
    : healthLevel === 'degraded' ? 0.75
    : 1
  const effectiveLimit = Math.max(1, Math.floor(dailyLimit * limitFactor))

  if (countToday >= effectiveLimit) {
    await prisma.qrApiMessage.update({
      where: { id: messageId },
      data: {
        status: 'FAILED',
        error: { code: 'daily_limit_reached', healthLevel, effectiveLimit, at: new Date().toISOString() } as any,
      },
    })
    await meteringService.incrementFailed(tenantId, instanceId)
    throw QrApiError.rateLimit('daily_limit_reached', `Limite diario efetivo atingido (${effectiveLimit}).`)
  }

  // Atualiza status para SENDING
  await prisma.qrApiMessage.update({ where: { id: messageId }, data: { status: 'SENDING' } })

  // Calcula dia de warmup (1-7, ou undefined se madura)
  let warmupDay: number | undefined
  if (instance?.warmupUntil) {
    const warmupMs = new Date(instance.warmupUntil).getTime()
    const warmupDaysTotal = parseInt(process.env.QR_API_WARMUP_DAYS ?? '5', 10)
    const startMs = warmupMs - warmupDaysTotal * 24 * 60 * 60 * 1000
    const elapsed = Date.now() - startMs
    if (elapsed < warmupDaysTotal * 24 * 60 * 60 * 1000) {
      warmupDay = Math.max(1, Math.ceil(elapsed / (24 * 60 * 60 * 1000)))
    }
  }

  // Aplica pacing anti-ban (com throttle preditivo por saude)
  const delay = nextSendDelay(countToday, warmupDay, healthThrottleFactor(healthScore))
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  try {
    let evolutionResult: unknown

    switch (payload.type) {
      case 'text':
        evolutionResult = await evo.sendText(evolutionInstanceId, payload.to, payload.text)
        break

      case 'image':
      case 'video':
      case 'document': {
        const mediaUrl = payload.media.url ?? payload.media.base64 ?? ''
        const caption = 'caption' in payload ? payload.caption : undefined
        const filename = 'filename' in payload ? payload.filename : undefined
        evolutionResult = await evo.sendMedia(evolutionInstanceId, payload.to, payload.type, mediaUrl, caption, filename)
        break
      }

      case 'audio': {
        const mediaUrl = payload.media.url ?? payload.media.base64 ?? ''
        if (payload.ptt) {
          evolutionResult = await evo.sendAudio(evolutionInstanceId, payload.to, mediaUrl)
        } else {
          evolutionResult = await evo.sendMedia(evolutionInstanceId, payload.to, 'audio', mediaUrl)
        }
        break
      }

      case 'sticker': {
        const mediaUrl = payload.media.url ?? payload.media.base64 ?? ''
        evolutionResult = await evo.sendSticker(evolutionInstanceId, payload.to, mediaUrl)
        break
      }

      case 'reaction': {
        // TODO: obter key real da mensagem original do banco
        const key = { id: payload.messageId, fromMe: true, remoteJid: `${payload.to}@s.whatsapp.net` }
        evolutionResult = await evo.sendReaction(evolutionInstanceId, key, payload.emoji)
        break
      }

      case 'reply':
        // TODO: buscar quoted key do banco
        evolutionResult = await evo.sendText(evolutionInstanceId, payload.to, payload.text)
        break

      case 'location':
        // Evolution nao tem sendLocation nativo; usa sendText com link do mapa.
        evolutionResult = await evo.sendText(
          evolutionInstanceId,
          payload.to,
          `${payload.name ?? 'Localizacao'}\nhttps://maps.google.com/?q=${payload.latitude},${payload.longitude}`,
        )
        break

      case 'contact': {
        const c = payload.contact
        evolutionResult = await evo.sendContact(evolutionInstanceId, payload.to, [{
          fullName: c.fullName,
          wuid: `${c.phone}@s.whatsapp.net`,
          phoneNumber: c.phone,
          ...(c.organization ? { organization: c.organization } : {}),
          ...(c.email ? { email: c.email } : {}),
        }])
        break
      }

      case 'buttons':
        evolutionResult = await evo.sendButtons(evolutionInstanceId, payload.to, {
          description: payload.text,
          footer: payload.footer,
          buttons: payload.buttons.map((b) => ({ type: 'reply', displayText: b.label, id: b.id })),
        })
        break

      case 'pix':
        // PIX vai como botao especial do tipo 'pix' (diferencial BR).
        evolutionResult = await evo.sendButtons(evolutionInstanceId, payload.to, {
          description: payload.pix.description ?? `Pagamento via PIX para ${payload.pix.name}`,
          buttons: [{
            type: 'pix',
            currency: 'BRL',
            name: payload.pix.name,
            keyType: payload.pix.keyType,
            key: payload.pix.key,
            ...(payload.pix.amount ? { amount: payload.pix.amount } : {}),
          }],
        })
        break

      case 'list':
        evolutionResult = await evo.sendList(evolutionInstanceId, payload.to, {
          description: payload.text,
          buttonText: payload.buttonText,
          footerText: payload.footer,
          sections: payload.sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({ title: r.title, description: r.description ?? '', rowId: r.id })),
          })),
        })
        break

      case 'poll':
        evolutionResult = await evo.sendPoll(
          evolutionInstanceId,
          payload.to,
          payload.question,
          payload.options,
          payload.multiSelect ? payload.options.length : 1,
        )
        break

      case 'otp':
        // No caminho QR/Baileys, OTP vira um botao "copiar codigo".
        evolutionResult = await evo.sendButtons(evolutionInstanceId, payload.to, {
          description: payload.text,
          buttons: [{ type: 'copy', displayText: payload.buttonLabel ?? 'Copiar codigo', copyCode: payload.code }],
        })
        break

      default:
        throw new Error(`Tipo de mensagem desconhecido: ${(payload as any).type}`)
    }

    const evoId = (evolutionResult as any)?.key?.id ?? null

    await prisma.qrApiMessage.update({
      where: { id: messageId },
      data: { status: 'SENT', evolutionId: evoId, sentAt: new Date() },
    })

    await meteringService.incrementSent(tenantId, instanceId)
    logger.info({ messageId, type: payload.type }, '[sendWorker] mensagem enviada')
  } catch (err) {
    await prisma.qrApiMessage.update({
      where: { id: messageId },
      data: { status: 'FAILED', error: { message: String(err) } as any },
    })
    await meteringService.incrementFailed(tenantId, instanceId)
    logger.error({ err, messageId }, '[sendWorker] falha ao enviar')
    throw err  // BullMQ vai fazer retry
  }
}

export function createSendWorker() {
  const worker = new Worker<SendJobData>(
    'qrapi-send',
    async (job) => processSend(job.data),
    {
      connection: { url: redisUrl },
      concurrency: 2,  // baixa concorrencia = menos risco de ban
    },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, '[sendWorker] job falhou')
  })

  return worker
}
