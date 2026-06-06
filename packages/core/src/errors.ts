// Erros estruturados QR-API (padrao Stripe/Twilio)
// Cada erro tem statusCode HTTP, type, code e doc_url gerado automaticamente.

const DOC_BASE = 'https://docs.qrapi.flipt.com.br'

export type QrApiErrorType =
  | 'authentication_error'
  | 'permission_error'
  | 'invalid_request_error'
  | 'not_found_error'
  | 'idempotency_error'
  | 'rate_limit_error'
  | 'instance_error'
  | 'api_error'

export type QrApiErrorCode =
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'expired_api_key'
  | 'revoked_api_key'
  | 'insufficient_scope'
  | 'missing_parameter'
  | 'invalid_parameter'
  | 'unsupported_message_type'
  | 'instance_not_connected'
  | 'instance_in_warmup'
  | 'instance_banned'
  | 'instance_provisioning'
  | 'daily_limit_reached'
  | 'number_not_on_whatsapp'
  | 'idempotency_key_reused'
  | 'resource_not_found'
  | 'too_many_requests'
  | 'internal_error'
  // Portal / billing (Onda 4)
  | 'invalid_credentials'
  | 'missing_token'
  | 'invalid_token'
  | 'email_taken'
  | 'no_customer'
  | 'plan_limit_reached'
  | 'subscription_inactive'

const ERROR_STATUS: Record<QrApiErrorType, number> = {
  authentication_error: 401,
  permission_error: 403,
  invalid_request_error: 400,
  not_found_error: 404,
  idempotency_error: 409,
  rate_limit_error: 429,
  instance_error: 409,
  api_error: 500,
}

const ERROR_DOC_PATH: Record<QrApiErrorCode, string> = {
  missing_api_key: '/errors#missing_api_key',
  invalid_api_key: '/errors#invalid_api_key',
  expired_api_key: '/errors#expired_api_key',
  revoked_api_key: '/errors#revoked_api_key',
  insufficient_scope: '/errors#insufficient_scope',
  missing_parameter: '/errors#missing_parameter',
  invalid_parameter: '/errors#invalid_parameter',
  unsupported_message_type: '/errors#unsupported_message_type',
  instance_not_connected: '/errors#instance_not_connected',
  instance_in_warmup: '/errors#instance_in_warmup',
  instance_banned: '/errors#instance_banned',
  instance_provisioning: '/errors#instance_provisioning',
  daily_limit_reached: '/errors#daily_limit_reached',
  number_not_on_whatsapp: '/errors#number_not_on_whatsapp',
  idempotency_key_reused: '/errors#idempotency_key_reused',
  resource_not_found: '/errors#resource_not_found',
  too_many_requests: '/errors#too_many_requests',
  internal_error: '/errors#internal_error',
  invalid_credentials: '/errors#invalid_credentials',
  missing_token: '/errors#missing_token',
  invalid_token: '/errors#invalid_token',
  email_taken: '/errors#email_taken',
  no_customer: '/errors#no_customer',
  plan_limit_reached: '/errors#plan_limit_reached',
  subscription_inactive: '/errors#subscription_inactive',
}

export class QrApiError extends Error {
  readonly type: QrApiErrorType
  readonly code: QrApiErrorCode
  readonly statusCode: number
  readonly param?: string
  readonly doc_url: string

  constructor(opts: {
    type: QrApiErrorType
    code: QrApiErrorCode
    message: string
    param?: string
  }) {
    super(opts.message)
    this.name = 'QrApiError'
    this.type = opts.type
    this.code = opts.code
    this.statusCode = ERROR_STATUS[opts.type]
    this.param = opts.param
    this.doc_url = `${DOC_BASE}${ERROR_DOC_PATH[opts.code]}`
  }

  static authentication(code: Extract<QrApiErrorCode, 'missing_api_key' | 'invalid_api_key' | 'expired_api_key' | 'revoked_api_key' | 'invalid_credentials' | 'missing_token' | 'invalid_token'>, message: string) {
    return new QrApiError({ type: 'authentication_error', code, message })
  }

  static permission(message: string, param?: string) {
    return new QrApiError({ type: 'permission_error', code: 'insufficient_scope', message, param })
  }

  static invalidRequest(code: Extract<QrApiErrorCode, 'missing_parameter' | 'invalid_parameter' | 'unsupported_message_type' | 'email_taken' | 'no_customer'>, message: string, param?: string) {
    return new QrApiError({ type: 'invalid_request_error', code, message, param })
  }

  static notFound(resource: string) {
    return new QrApiError({
      type: 'not_found_error',
      code: 'resource_not_found',
      message: `${resource} nao encontrado.`,
    })
  }

  static idempotency(message = 'Idempotency-Key reutilizada com corpo diferente.') {
    return new QrApiError({ type: 'idempotency_error', code: 'idempotency_key_reused', message })
  }

  static rateLimit(code: Extract<QrApiErrorCode, 'too_many_requests' | 'daily_limit_reached' | 'plan_limit_reached' | 'subscription_inactive'>, message: string) {
    return new QrApiError({ type: 'rate_limit_error', code, message })
  }

  static instance(code: Extract<QrApiErrorCode, 'instance_not_connected' | 'instance_in_warmup' | 'instance_banned' | 'instance_provisioning'>, message: string) {
    return new QrApiError({ type: 'instance_error', code, message })
  }

  static internal(message = 'Erro interno. Tente novamente.') {
    return new QrApiError({ type: 'api_error', code: 'internal_error', message })
  }
}

export interface ErrorBody {
  error: {
    type: QrApiErrorType
    code: QrApiErrorCode
    message: string
    param?: string
    doc_url: string
  }
  request_id: string
}

/** Serializa um QrApiError (ou erro desconhecido) para o formato de resposta da API. */
export function toErrorBody(err: unknown, requestId: string): ErrorBody {
  if (err instanceof QrApiError) {
    return {
      error: {
        type: err.type,
        code: err.code,
        message: err.message,
        ...(err.param ? { param: err.param } : {}),
        doc_url: err.doc_url,
      },
      request_id: requestId,
    }
  }
  // Erro desconhecido: retorna api_error generico
  const internal = QrApiError.internal(
    process.env.NODE_ENV === 'production' ? 'Erro interno.' : String(err),
  )
  return {
    error: {
      type: internal.type,
      code: internal.code,
      message: internal.message,
      doc_url: internal.doc_url,
    },
    request_id: requestId,
  }
}
