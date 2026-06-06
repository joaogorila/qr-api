// @flipt/qr-api — SDK oficial Node/TS para a QR-API
// Thin client HTTP sobre fetch nativo. Sem dependencias pesadas.

// ---------------------------------------------------------------------------
// Tipos de erro
// ---------------------------------------------------------------------------

export interface QrApiErrorBody {
  type: string;
  code: string;
  message: string;
  param?: string;
  doc_url?: string;
}

export class QrApiError extends Error {
  readonly type: string;
  readonly code: string;
  readonly param?: string;
  readonly requestId?: string;
  readonly docUrl?: string;
  readonly status: number;

  constructor(body: QrApiErrorBody, status: number, requestId?: string) {
    super(body.message);
    this.name = "QrApiError";
    this.type = body.type;
    this.code = body.code;
    this.param = body.param;
    this.requestId = requestId;
    this.docUrl = body.doc_url;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Tipos de dominio
// ---------------------------------------------------------------------------

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "location"
  | "contact"
  | "sticker"
  | "buttons"
  | "list"
  | "poll"
  | "pix"
  | "reaction"
  | "reply";

export type MessageStatus =
  | "queued"
  | "scheduled"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "cancelled";

export interface MediaField {
  url?: string;
  base64?: string;
}

export interface SendMessageParams {
  instanceId: string;
  to: string;
  type: MessageType;
  // Texto
  text?: string;
  linkPreview?: boolean;
  // Midia (image, video, audio, document, sticker)
  media?: MediaField;
  caption?: string;
  ptt?: boolean;
  filename?: string;
  // Localizacao
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
  // Contato
  contact?: { fullName: string; phone: string };
  // Botoes
  buttons?: Array<{ id: string; label: string }>;
  // Lista
  buttonText?: string;
  sections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
  // Enquete
  question?: string;
  options?: string[];
  multiSelect?: boolean;
  // PIX
  pix?: {
    key: string;
    keyType: "cpf" | "cnpj" | "email" | "phone" | "evp";
    name: string;
    amount: number;
  };
  // Reacao
  messageId?: string;
  emoji?: string;
  // Resposta
  replyTo?: string;
  // Opcoes gerais
  externalId?: string;
  scheduledAt?: string;
  delayTyping?: number;
}

export interface SendBulkParams {
  instanceId: string;
  messages: Omit<SendMessageParams, "instanceId">[];
}

export interface MessageResponse {
  id: string;
  status: MessageStatus;
  request_id: string;
}

export interface Message extends MessageResponse {
  instanceId: string;
  to: string;
  type: MessageType;
  externalId?: string;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageListParams {
  instanceId?: string;
  status?: MessageStatus;
  to?: string;
  cursor?: string;
  limit?: number;
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  next_cursor?: string;
  has_more: boolean;
}

export type InstanceStatus = "pending" | "connecting" | "connected" | "disconnected" | "banned";
export type InboundMode = "off" | "webhook" | "followfy";

export interface Instance {
  id: string;
  name?: string;
  status: InstanceStatus;
  healthScore: number;
  inboundMode: InboundMode;
  dailyLimit: number;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInstanceParams {
  name?: string;
  inboundMode?: InboundMode;
  dailyLimit?: number;
  webhookUrl?: string;
}

export interface UpdateInstanceParams {
  inboundMode?: InboundMode;
  dailyLimit?: number;
  webhookUrl?: string;
}

export interface QrResponse {
  qr: string; // base64 PNG
  expiresAt: string;
}

export interface PairParams {
  phone: string;
}

export interface PhoneExistsResponse {
  number: string;
  exists: boolean;
}

export interface PhoneExistsBatchParams {
  numbers: string[];
}

export type WebhookEvent =
  | "message.received"
  | "message.status"
  | "instance.status"
  | "instance.qr";

export interface CreateWebhookParams {
  url: string;
  events: WebhookEvent[];
  secret?: string;
}

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  createdAt: string;
}

export interface MeResponse {
  keyId: string;
  prefix: string;
  scopes: string[];
  mode: "test" | "live";
  tenantId: string;
  lastUsedAt?: string;
}

// ---------------------------------------------------------------------------
// HTTP client base
// ---------------------------------------------------------------------------

export interface QrApiOptions {
  apiKey: string;
  baseUrl?: string;
  version?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.qrapi.flipt.com.br/v1";
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(opts: QrApiOptions) {
    if (!opts.apiKey) throw new Error("apiKey e obrigatorio");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.maxRetries = opts.maxRetries ?? MAX_RETRIES;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private buildHeaders(
    idempotencyKey?: string,
    requestId?: string
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (requestId) headers["Request-Id"] = requestId;
    return headers;
  }

  private generateIdempotencyKey(): string {
    // Implementacao de uuid v4 sem dependencias externas
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private async parseError(res: Response): Promise<QrApiError> {
    const requestId = res.headers.get("Request-Id") ?? undefined;
    try {
      const body = await res.json();
      const err = body.error ?? body;
      return new QrApiError(
        {
          type: err.type ?? "api_error",
          code: err.code ?? String(res.status),
          message: err.message ?? res.statusText,
          param: err.param,
          doc_url: err.doc_url,
        },
        res.status,
        requestId
      );
    } catch {
      return new QrApiError(
        {
          type: "api_error",
          code: String(res.status),
          message: res.statusText,
        },
        res.status,
        requestId
      );
    }
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    useIdempotencyKey = false,
    requestId?: string
  ): Promise<T> {
    const idempotencyKey =
      useIdempotencyKey ? this.generateIdempotencyKey() : undefined;
    const url = `${this.baseUrl}${path}`;
    const headers = this.buildHeaders(idempotencyKey, requestId);

    let attempt = 0;
    let lastError: QrApiError | Error | null = null;

    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          if (res.status === 204) return undefined as unknown as T;
          return (await res.json()) as T;
        }

        const err = await this.parseError(res);

        // 429: respeita Retry-After
        if (res.status === 429 && attempt < this.maxRetries) {
          const retryAfter = res.headers.get("Retry-After");
          const waitMs = retryAfter
            ? parseFloat(retryAfter) * 1000
            : INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          attempt++;
          await sleep(waitMs);
          lastError = err;
          continue;
        }

        // 5xx: backoff exponencial
        if (res.status >= 500 && attempt < this.maxRetries) {
          const waitMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          attempt++;
          await sleep(waitMs);
          lastError = err;
          continue;
        }

        throw err;
      } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof QrApiError) throw e;
        // Erro de rede / timeout: tenta de novo
        lastError = e as Error;
        if (attempt < this.maxRetries) {
          const waitMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          attempt++;
          await sleep(waitMs);
          continue;
        }
        throw e;
      }
    }

    throw lastError ?? new Error("Falha apos maxRetries tentativas");
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body: unknown, idempotent = true): Promise<T> {
    return this.request<T>("POST", path, body, idempotent);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

class MessagesResource {
  constructor(private readonly http: HttpClient) {}

  send(params: SendMessageParams): Promise<MessageResponse> {
    return this.http.post<MessageResponse>("/messages", params);
  }

  sendBulk(params: SendBulkParams): Promise<{ messages: MessageResponse[] }> {
    return this.http.post<{ messages: MessageResponse[] }>("/messages/bulk", params);
  }

  get(id: string): Promise<Message> {
    return this.http.get<Message>(`/messages/${encodeURIComponent(id)}`);
  }

  list(params?: MessageListParams): Promise<PaginatedResponse<Message>> {
    const qs = buildQueryString(params ?? {});
    return this.http.get<PaginatedResponse<Message>>(`/messages${qs}`);
  }

  cancel(id: string): Promise<void> {
    return this.http.delete<void>(`/messages/${encodeURIComponent(id)}`);
  }

  markRead(id: string): Promise<void> {
    return this.http.post<void>(`/messages/${encodeURIComponent(id)}/read`, {});
  }
}

export interface InstanceListParams {
  cursor?: string;
  limit?: number;
  [key: string]: unknown;
}

class InstancesResource {
  constructor(private readonly http: HttpClient) {}

  create(params?: CreateInstanceParams): Promise<Instance> {
    return this.http.post<Instance>("/instances", params ?? {});
  }

  list(params?: InstanceListParams): Promise<PaginatedResponse<Instance>> {
    const qs = buildQueryString(params ?? {});
    return this.http.get<PaginatedResponse<Instance>>(`/instances${qs}`);
  }

  get(id: string): Promise<Instance> {
    return this.http.get<Instance>(`/instances/${encodeURIComponent(id)}`);
  }

  qr(id: string): Promise<QrResponse> {
    return this.http.get<QrResponse>(`/instances/${encodeURIComponent(id)}/qr`);
  }

  pair(id: string, phone: string): Promise<void> {
    return this.http.post<void>(
      `/instances/${encodeURIComponent(id)}/pair`,
      { phone }
    );
  }

  restart(id: string): Promise<void> {
    return this.http.post<void>(
      `/instances/${encodeURIComponent(id)}/restart`,
      {}
    );
  }

  disconnect(id: string): Promise<void> {
    return this.http.post<void>(
      `/instances/${encodeURIComponent(id)}/disconnect`,
      {}
    );
  }

  update(id: string, patch: UpdateInstanceParams): Promise<Instance> {
    return this.http.patch<Instance>(
      `/instances/${encodeURIComponent(id)}`,
      patch
    );
  }

  remove(id: string): Promise<void> {
    return this.http.delete<void>(`/instances/${encodeURIComponent(id)}`);
  }
}

class PhonesResource {
  constructor(private readonly http: HttpClient) {}

  exists(number: string): Promise<PhoneExistsResponse> {
    return this.http.get<PhoneExistsResponse>(
      `/phones/${encodeURIComponent(number)}/exists`
    );
  }

  existsBatch(
    numbers: string[]
  ): Promise<{ results: PhoneExistsResponse[] }> {
    return this.http.post<{ results: PhoneExistsResponse[] }>(
      "/phones/exists",
      { numbers }
    );
  }
}

class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  create(params: CreateWebhookParams): Promise<Webhook> {
    return this.http.post<Webhook>("/webhooks", params);
  }

  list(): Promise<PaginatedResponse<Webhook>> {
    return this.http.get<PaginatedResponse<Webhook>>("/webhooks");
  }

  remove(id: string): Promise<void> {
    return this.http.delete<void>(`/webhooks/${encodeURIComponent(id)}`);
  }

  deliveries(id: string): Promise<PaginatedResponse<WebhookDelivery>> {
    return this.http.get<PaginatedResponse<WebhookDelivery>>(
      `/webhooks/${encodeURIComponent(id)}/deliveries`
    );
  }
}

// ---------------------------------------------------------------------------
// Utilitarios
// ---------------------------------------------------------------------------

function buildQueryString(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (entries.length === 0) return "";
  const qs = entries
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join("&");
  return `?${qs}`;
}

// ---------------------------------------------------------------------------
// Cliente principal
// ---------------------------------------------------------------------------

export class QrApi {
  readonly messages: MessagesResource;
  readonly instances: InstancesResource;
  readonly phones: PhonesResource;
  readonly webhooks: WebhooksResource;

  private readonly http: HttpClient;

  constructor(opts: QrApiOptions) {
    this.http = new HttpClient(opts);
    this.messages = new MessagesResource(this.http);
    this.instances = new InstancesResource(this.http);
    this.phones = new PhonesResource(this.http);
    this.webhooks = new WebhooksResource(this.http);
  }

  me(): Promise<MeResponse> {
    return this.http.get<MeResponse>("/me");
  }
}

export default QrApi;
