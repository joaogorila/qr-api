import { createHmac, timingSafeEqual } from 'crypto'

const SCHEME = 'v1'
// Janela de tolerancia para o timestamp (5 minutos)
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000

/**
 * Gera a assinatura HMAC-SHA256 para um payload de webhook.
 *
 * @param rawBody   Buffer ou string do body serializado (JSON.stringify)
 * @param secret    Segredo compartilhado configurado no webhook
 * @returns         Header no formato "v1=<hex>"
 */
export function sign(rawBody: string | Buffer, secret: string): string {
  const payload = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody
  const hmac = createHmac('sha256', secret).update(payload).digest('hex')
  return `${SCHEME}=${hmac}`
}

/**
 * Verifica a assinatura de um webhook de entrada (timing-safe).
 *
 * @param rawBody      Body recebido
 * @param header       Valor do header X-Qr-Signature
 * @param secret       Segredo configurado no endpoint
 * @param timestamp    Timestamp ISO8601 opcional (do header X-Qr-Timestamp) para rejeitar replays
 * @returns            true se valido
 */
export function verify(
  rawBody: string | Buffer,
  header: string,
  secret: string,
  timestamp?: string,
): boolean {
  // Verifica timestamp para prevenir replay attacks
  if (timestamp) {
    const ts = new Date(timestamp).getTime()
    if (isNaN(ts)) return false
    if (Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) return false
  }

  const expected = sign(rawBody, secret)

  // Extrair apenas o valor apos "v1=" para comparacao
  const receivedParts = header.split(',').map((p) => p.trim())
  const v1Part = receivedParts.find((p) => p.startsWith(`${SCHEME}=`))
  if (!v1Part) return false

  try {
    const expectedBuf = Buffer.from(expected, 'utf8')
    const receivedBuf = Buffer.from(v1Part, 'utf8')
    if (expectedBuf.length !== receivedBuf.length) return false
    return timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return false
  }
}
