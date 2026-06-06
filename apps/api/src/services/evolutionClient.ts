// Cliente Evolution API para o standalone.
// Espelha os paths de sleck-followfy/backend/src/services/evolutionApiClient.ts

import logger from '../logger'

const BASE_URL = (process.env.EVOLUTION_API_URL ?? 'http://localhost:8181').replace(/\/$/, '')
const API_KEY = process.env.EVOLUTION_API_KEY ?? ''

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'
let circuitState: CircuitState = 'CLOSED'
let consecutiveFailures = 0
let circuitOpenedAt = 0
const FAILURE_THRESHOLD = 5
const OPEN_TO_HALF_MS = 30_000
const RECOVERABLE_CODES = [502, 503, 504, 0]

function recordSuccess(): void {
  if (circuitState !== 'CLOSED') {
    logger.info('[evo-standalone] Circuit breaker FECHADO')
  }
  circuitState = 'CLOSED'
  consecutiveFailures = 0
  circuitOpenedAt = 0
}

function recordFailure(code: number): void {
  if (!RECOVERABLE_CODES.includes(code)) return
  consecutiveFailures++
  if (consecutiveFailures >= FAILURE_THRESHOLD && circuitState !== 'OPEN') {
    circuitState = 'OPEN'
    circuitOpenedAt = Date.now()
    logger.error({ consecutiveFailures, code }, '[evo-standalone] Circuit breaker ABERTO')
  }
}

function shouldShortCircuit(): boolean {
  if (circuitState === 'CLOSED') return false
  if (circuitState === 'OPEN') {
    if (Date.now() - circuitOpenedAt > OPEN_TO_HALF_MS) {
      circuitState = 'HALF_OPEN'
      return false
    }
    return true
  }
  return true
}

/** Estado do circuit breaker da Evolution (para health/status page). */
export function getEvolutionCircuitState(): { state: CircuitState; consecutiveFailures: number; openedAt: number } {
  return { state: circuitState, consecutiveFailures, openedAt: circuitOpenedAt }
}

function timeoutFor(path: string): number {
  if (path.startsWith('/message/sendMedia') || path.startsWith('/message/sendWhatsAppAudio')) return 25_000
  if (path.startsWith('/message/')) return 12_000
  if (path.startsWith('/chat/whatsappNumbers')) return 8_000
  return 30_000
}

async function evoFetch(method: string, path: string, body?: unknown): Promise<unknown> {
  if (shouldShortCircuit()) {
    const err = Object.assign(
      new Error(`[evo-standalone] circuit breaker OPEN — ${method} ${path}`),
      { statusCode: 503, circuitOpen: true },
    )
    throw err
  }

  const url = `${BASE_URL}${path}`
  const timeoutMs = timeoutFor(path)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', apikey: API_KEY },
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const err = Object.assign(new Error(`Evolution ${method} ${path} -> ${res.status}: ${text}`), {
        statusCode: res.status,
      })
      if (res.status >= 500) recordFailure(res.status)
      throw err
    }

    const ct = res.headers.get('content-type') ?? ''
    recordSuccess()
    if (!ct.includes('application/json')) return null
    return res.json()
  } catch (e: unknown) {
    const anyErr = e as any
    if (anyErr.statusCode) throw e
    if (anyErr.name === 'AbortError') {
      recordFailure(504)
      throw Object.assign(new Error(`Evolution ${method} ${path} -> timeout ${timeoutMs}ms`), { statusCode: 504 })
    }
    recordFailure(0)
    throw Object.assign(new Error(`Evolution ${method} ${path} -> network: ${anyErr.message}`), { statusCode: 0 })
  } finally {
    clearTimeout(timer)
  }
}

const WEBHOOK_EVENTS = [
  'QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_SET', 'MESSAGES_UPSERT',
  'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'SEND_MESSAGE',
  // Inbound: contatos/chats/presenca/grupos (necessario para o inbound funcionar)
  'CONTACTS_UPSERT', 'CONTACTS_UPDATE', 'CHATS_UPSERT', 'CHATS_UPDATE',
  'PRESENCE_UPDATE', 'GROUPS_UPSERT',
]

/** Prefixo de instancias da qr-api standalone */
export function instanceNameFor(instanceId: string): string {
  return `qrapi-${instanceId}`
}

export const evo = {
  createInstance(instanceName: string, webhookUrl: string) {
    return evoFetch('POST', '/instance/create', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      browserName: 'QR-API',
      Browser: ['QR-API', 'Chrome', '1.0.0'],
      webhook: { url: webhookUrl, enabled: true, events: WEBHOOK_EVENTS },
    })
  },

  deleteInstance(instanceName: string) {
    return evoFetch('DELETE', `/instance/delete/${instanceName}`)
  },

  restartInstance(instanceName: string) {
    return evoFetch('POST', `/instance/restart/${instanceName}`)
  },

  logoutInstance(instanceName: string) {
    return evoFetch('DELETE', `/instance/logout/${instanceName}`)
  },

  fetchQrCode(instanceName: string) {
    return evoFetch('GET', `/instance/connect/${instanceName}`)
  },

  getConnectionState(instanceName: string) {
    return evoFetch('GET', `/instance/connectionState/${instanceName}`)
  },

  sendText(instanceName: string, number: string, text: string) {
    return evoFetch('POST', `/message/sendText/${instanceName}`, { number, text })
  },

  sendMedia(
    instanceName: string,
    number: string,
    mediatype: 'image' | 'video' | 'document' | 'audio',
    media: string,
    caption?: string,
    fileName?: string,
    ptt?: boolean,
  ) {
    return evoFetch('POST', `/message/sendMedia/${instanceName}`, {
      number, mediatype, media,
      ...(caption ? { caption } : {}),
      ...(fileName ? { fileName } : {}),
      ...(ptt ? { ptt: true } : {}),
    })
  },

  sendAudio(instanceName: string, number: string, audio: string) {
    return evoFetch('POST', `/message/sendWhatsAppAudio/${instanceName}`, { number, audio, encoding: true })
  },

  sendSticker(instanceName: string, number: string, sticker: string) {
    return evoFetch('POST', `/message/sendSticker/${instanceName}`, { number, sticker })
  },

  sendReaction(instanceName: string, key: { id: string; fromMe: boolean; remoteJid: string }, reaction: string) {
    return evoFetch('POST', `/message/sendReaction/${instanceName}`, { key, reaction })
  },

  sendPresence(instanceName: string, number: string, presence: 'composing' | 'paused', delayMs?: number) {
    return evoFetch('POST', `/chat/sendPresence/${instanceName}`, {
      number, presence,
      ...(delayMs ? { delay: delayMs } : {}),
    })
  },

  deleteMessageForEveryone(instanceName: string, key: { id: string; fromMe: boolean; remoteJid: string }) {
    return evoFetch('DELETE', `/chat/deleteMessageForEveryone/${instanceName}`, key)
  },

  checkIsWhatsApp(instanceName: string, numbers: string[]) {
    return evoFetch('POST', `/chat/whatsappNumbers/${instanceName}`, { numbers })
  },

  fetchProfile(instanceName: string, number: string) {
    return evoFetch('POST', `/chat/fetchProfile/${instanceName}`, { number })
  },

  // ── Contatos ──────────────────────────────────────────────────────────────
  sendContact(
    instanceName: string,
    number: string,
    contacts: Array<{ fullName: string; wuid: string; phoneNumber: string; organization?: string; email?: string; url?: string }>,
  ) {
    return evoFetch('POST', `/message/sendContact/${instanceName}`, { number, contact: contacts })
  },

  // ── Mensagens interativas (Evolution API v2) ──────────────────────────────
  // buttons[].type ∈ reply|url|call|pix|copy
  sendButtons(
    instanceName: string,
    number: string,
    opts: { title?: string; description: string; footer?: string; buttons: any[] },
  ) {
    return evoFetch('POST', `/message/sendButtons/${instanceName}`, {
      number,
      title: opts.title ?? '',
      description: opts.description,
      footer: opts.footer ?? '',
      buttons: opts.buttons,
    })
  },

  sendList(
    instanceName: string,
    number: string,
    opts: { title?: string; description: string; buttonText: string; footerText?: string; sections: any[] },
  ) {
    return evoFetch('POST', `/message/sendList/${instanceName}`, {
      number,
      title: opts.title ?? '',
      description: opts.description,
      buttonText: opts.buttonText,
      footerText: opts.footerText ?? '',
      sections: opts.sections,
    })
  },

  sendPoll(instanceName: string, number: string, name: string, values: string[], selectableCount = 1) {
    return evoFetch('POST', `/message/sendPoll/${instanceName}`, { number, name, selectableCount, values })
  },

  // ── Status / Stories ──────────────────────────────────────────────────────
  sendStatus(instanceName: string, body: {
    type: 'text' | 'image' | 'video' | 'audio'
    content: string
    caption?: string
    backgroundColor?: string
    font?: number
    statusJidList?: string[]
    allContacts?: boolean
  }) {
    return evoFetch('POST', `/message/sendStatus/${instanceName}`, body)
  },

  // ── Etiquetas / Labels ────────────────────────────────────────────────────
  findLabels(instanceName: string) {
    return evoFetch('GET', `/label/findLabels/${instanceName}`)
  },

  handleLabel(instanceName: string, number: string, labelId: string, action: 'add' | 'remove') {
    return evoFetch('POST', `/label/handleLabel/${instanceName}`, { number, labelId, action })
  },

  // ── Grupos ────────────────────────────────────────────────────────────────
  createGroup(instanceName: string, body: { subject: string; description?: string; participants: string[] }) {
    return evoFetch('POST', `/group/create/${instanceName}`, body)
  },

  fetchAllGroups(instanceName: string, getParticipants = false) {
    return evoFetch('GET', `/group/fetchAllGroups/${instanceName}?getParticipants=${getParticipants}`)
  },

  fetchGroupInfo(instanceName: string, groupJid: string) {
    return evoFetch('GET', `/group/findGroupInfos/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`)
  },

  fetchInviteCode(instanceName: string, groupJid: string) {
    return evoFetch('GET', `/group/inviteCode/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`)
  },

  updateParticipant(instanceName: string, groupJid: string, action: 'add' | 'remove' | 'promote' | 'demote', participants: string[]) {
    return evoFetch('POST', `/group/updateParticipant/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`, { action, participants })
  },

  updateGroupSubject(instanceName: string, groupJid: string, subject: string) {
    return evoFetch('POST', `/group/updateGroupSubject/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`, { subject })
  },

  updateGroupDescription(instanceName: string, groupJid: string, description: string) {
    return evoFetch('POST', `/group/updateGroupDescription/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`, { description })
  },
}
