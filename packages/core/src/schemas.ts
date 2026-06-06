import { z } from 'zod'

// ─── Campos comuns a todas as mensagens ─────────────────────────────────────

const baseMessageFields = {
  instanceId: z.string().min(1),
  to: z.string().min(7), // E.164 ou JID de grupo
  externalId: z.string().optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  delayTyping: z.number().int().min(0).max(10000).optional(),
}

// ─── Media compartilhada ────────────────────────────────────────────────────

const mediaSchema = z.object({
  url: z.string().url().optional(),
  base64: z.string().optional(),
}).refine((v) => v.url !== undefined || v.base64 !== undefined, {
  message: 'media deve conter url ou base64',
})

// ─── Mensagens (discriminated union por type) ───────────────────────────────

const textMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('text'),
  text: z.string().min(1),
  linkPreview: z.boolean().optional(),
})

const imageMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('image'),
  media: mediaSchema,
  caption: z.string().optional(),
})

const videoMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('video'),
  media: mediaSchema,
  caption: z.string().optional(),
})

const audioMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('audio'),
  media: mediaSchema,
  ptt: z.boolean().optional(), // ptt=true vira nota de voz
})

const documentMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('document'),
  media: mediaSchema,
  filename: z.string().optional(),
  caption: z.string().optional(),
})

const locationMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('location'),
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().optional(),
  address: z.string().optional(),
})

const contactMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('contact'),
  contact: z.object({
    fullName: z.string(),
    phone: z.string(),
    organization: z.string().optional(),
    email: z.string().email().optional(),
  }),
})

const stickerMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('sticker'),
  media: mediaSchema,
})

const buttonSchema = z.object({
  id: z.string(),
  label: z.string(),
})

const buttonsMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('buttons'),
  text: z.string(),
  buttons: z.array(buttonSchema).min(1).max(3),
  footer: z.string().optional(),
})

const listRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
})

const listSectionSchema = z.object({
  title: z.string(),
  rows: z.array(listRowSchema).min(1),
})

const listMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('list'),
  text: z.string(),
  buttonText: z.string(),
  sections: z.array(listSectionSchema).min(1),
  footer: z.string().optional(),
})

const pollMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('poll'),
  question: z.string(),
  options: z.array(z.string()).min(2).max(12),
  multiSelect: z.boolean().default(false),
})

const pixMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('pix'),
  pix: z.object({
    key: z.string(),
    keyType: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random', 'evp']),
    name: z.string(),
    amount: z.number().positive().optional(),
    description: z.string().optional(),
  }),
})

const otpMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('otp'),
  text: z.string().min(1),
  code: z.string().min(1),
  buttonLabel: z.string().optional(),
})

const reactionMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('reaction'),
  messageId: z.string(), // id da mensagem que recebe a reacao
  emoji: z.string(),
})

const replyMessageSchema = z.object({
  ...baseMessageFields,
  type: z.literal('reply'),
  replyTo: z.string(), // id da mensagem original
  text: z.string(),
})

// Union discriminada — Zod infere tipo correto automaticamente
export const sendMessageSchema = z.discriminatedUnion('type', [
  textMessageSchema,
  imageMessageSchema,
  videoMessageSchema,
  audioMessageSchema,
  documentMessageSchema,
  locationMessageSchema,
  contactMessageSchema,
  stickerMessageSchema,
  buttonsMessageSchema,
  listMessageSchema,
  pollMessageSchema,
  pixMessageSchema,
  otpMessageSchema,
  reactionMessageSchema,
  replyMessageSchema,
])

export type SendMessageInput = z.infer<typeof sendMessageSchema>

// ─── Envio em lote ───────────────────────────────────────────────────────────

export const bulkSchema = z.object({
  instanceId: z.string().min(1),
  messages: z.array(
    z.object({
      to: z.string().min(7),
      type: z.string(),
    }).passthrough()
  ).min(1).max(1000),
})

export type BulkInput = z.infer<typeof bulkSchema>

// ─── Instancias ──────────────────────────────────────────────────────────────

export const createInstanceSchema = z.object({
  name: z.string().min(1).max(100),
  inboundMode: z.enum(['off', 'webhook', 'followfy']).default('off'),
  dailyLimit: z.number().int().min(1).max(10000).optional(),
  webhook: z.object({
    url: z.string().url(),
    secret: z.string().min(16),
    events: z.array(z.string()).optional(),
  }).optional(),
})

export type CreateInstanceInput = z.infer<typeof createInstanceSchema>

export const updateInstanceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  inboundMode: z.enum(['off', 'webhook', 'followfy']).optional(),
  dailyLimit: z.number().int().min(1).max(10000).optional(),
  webhook: z.object({
    url: z.string().url(),
    secret: z.string().min(16),
    events: z.array(z.string()).optional(),
  }).optional(),
}).refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Pelo menos um campo deve ser fornecido para atualizacao' },
)

export type UpdateInstanceInput = z.infer<typeof updateInstanceSchema>

export const pairSchema = z.object({
  phone: z.string().min(10).max(15), // E.164 sem +
})

export type PairInput = z.infer<typeof pairSchema>

// ─── Webhooks ────────────────────────────────────────────────────────────────

export const registerWebhookSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16),
  events: z.array(z.string()).default(['*']),
  instanceId: z.string().min(1),
  active: z.boolean().default(true),
})

export type RegisterWebhookInput = z.infer<typeof registerWebhookSchema>

export const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  secret: z.string().min(16).optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
}).refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Pelo menos um campo deve ser fornecido' },
)

export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>

// ─── API Keys ────────────────────────────────────────────────────────────────

export const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  mode: z.enum(['test', 'live']).default('live'),
  scopes: z.array(z.string()).default([]),
  expiresAt: z.string().datetime({ offset: true }).optional(),
})

export type CreateKeyInput = z.infer<typeof createKeySchema>

// ─── Utilitarios ─────────────────────────────────────────────────────────────

export const checkPhonesSchema = z.object({
  numbers: z.array(z.string().min(7)).min(1).max(100),
})

export type CheckPhonesInput = z.infer<typeof checkPhonesSchema>

export const typingSchema = z.object({
  instanceId: z.string().min(1),
  to: z.string().min(7),
  durationMs: z.number().int().min(500).max(15000).default(2000),
})

export type TypingInput = z.infer<typeof typingSchema>
