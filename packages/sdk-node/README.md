# @flipt/qr-api

SDK oficial Node/TypeScript para a [QR-API](https://docs.qrapi.flipt.com.br) — envio de mensagens WhatsApp via instancias QR/Evolution.

## Instalacao

```bash
pnpm add @flipt/qr-api
# ou
npm install @flipt/qr-api
```

Requer Node.js >= 18 (usa `fetch` nativo).

## Quickstart

```ts
import { QrApi } from "@flipt/qr-api";

const client = new QrApi({ apiKey: process.env.QR_API_KEY! });

// Informacoes da chave
const me = await client.me();
console.log(me.mode, me.scopes);
```

## Exemplos

### Enviar mensagem de texto

```ts
const msg = await client.messages.send({
  instanceId: "inst_abc123",
  to: "5511999998888",
  type: "text",
  text: "Ola! Seu pedido #1234 saiu para entrega.",
});
console.log(msg.id, msg.status); // msg_xyz queued
```

### Criar instancia e obter QR para conectar

```ts
// 1. Criar a instancia
const instance = await client.instances.create({
  name: "minha-loja",
  inboundMode: "webhook",
});
console.log("instancia criada:", instance.id);

// 2. Buscar o QR code (base64 PNG) para escanear no WhatsApp
const { qr, expiresAt } = await client.instances.qr(instance.id);
// Salvar ou exibir a imagem base64
// <img src={`data:image/png;base64,${qr}`} />

// 3. Aguardar conexao (via webhook message.status ou polling)
const status = await client.instances.get(instance.id);
console.log(status.status); // "connected" quando escanear
```

### Registrar webhook para receber eventos

```ts
const webhook = await client.webhooks.create({
  url: "https://minha-api.com.br/webhooks/whatsapp",
  events: ["message.received", "message.status", "instance.status"],
  secret: process.env.WEBHOOK_SECRET, // usado para verificar HMAC X-Qr-Signature
});
console.log("webhook criado:", webhook.id);
```

### Validar se um numero tem WhatsApp

```ts
const { exists } = await client.phones.exists("5511999998888");
if (exists) {
  console.log("Numero tem WhatsApp, pode enviar!");
}

// Varios numeros de uma vez
const { results } = await client.phones.existsBatch([
  "5511999990001",
  "5511999990002",
  "5511999990003",
]);
results.forEach((r) => console.log(r.number, r.exists));
```

### Envio em lote (com pacing anti-ban automatico)

```ts
const { messages } = await client.messages.sendBulk({
  instanceId: "inst_abc123",
  messages: [
    { to: "5511999990001", type: "text", text: "Oi Joao!" },
    { to: "5511999990002", type: "text", text: "Oi Maria!" },
  ],
});
messages.forEach((m) => console.log(m.id, m.status));
```

### Enviar imagem com legenda

```ts
await client.messages.send({
  instanceId: "inst_abc123",
  to: "5511999998888",
  type: "image",
  media: { url: "https://cdn.minha-loja.com.br/nota-fiscal.jpg" },
  caption: "Sua nota fiscal",
});
```

### Exemplo de e-commerce: avisa no WhatsApp quando o pedido e pago

```ts
// backend/src/routes/webhook-pagamento.ts
import { QrApi } from "@flipt/qr-api";

const qr = new QrApi({ apiKey: process.env.QR_API_KEY! });
const INSTANCE_ID = process.env.QR_INSTANCE_ID!;

export async function handlePagamentoConfirmado(pedido: {
  id: string;
  clienteTelefone: string;
  valorTotal: number;
}) {
  await qr.messages.send({
    instanceId: INSTANCE_ID,
    to: pedido.clienteTelefone, // formato E.164: "5511999998888"
    type: "text",
    text: [
      `Pagamento confirmado para o pedido #${pedido.id}!`,
      `Total: R$ ${pedido.valorTotal.toFixed(2)}`,
      `Acompanhe a entrega pelo link: https://minha-loja.com.br/pedidos/${pedido.id}`,
    ].join("\n"),
    delayTyping: 1500, // simula digitacao por 1,5s (mais humano, anti-ban)
  });
}
```

## Tratamento de erros

```ts
import { QrApi, QrApiError } from "@flipt/qr-api";

const client = new QrApi({ apiKey: "..." });

try {
  await client.messages.send({ instanceId: "...", to: "...", type: "text", text: "oi" });
} catch (err) {
  if (err instanceof QrApiError) {
    console.error("Erro da API:", err.code, err.message);
    // err.type    — categoria do erro (ex: "authentication_error")
    // err.code    — codigo especifico (ex: "invalid_api_key")
    // err.param   — campo com problema (ex: "to")
    // err.docUrl  — link para documentacao do erro
    // err.requestId — id da requisicao (para suporte)
    // err.status  — HTTP status code
  }
}
```

O SDK faz retry automatico:
- **429 Too Many Requests**: respeita o header `Retry-After`, reencaminha em ate 3 tentativas.
- **5xx Server Error**: backoff exponencial (500ms, 1s, 2s), ate 3 tentativas.

## API

### `new QrApi(opts)`

| Opcao | Tipo | Padrao | Descricao |
|---|---|---|---|
| `apiKey` | `string` | obrigatorio | Chave `sk_test_*` ou `sk_live_*` |
| `baseUrl` | `string` | `https://api.qrapi.flipt.com.br/v1` | URL base da API |
| `maxRetries` | `number` | `3` | Tentativas em 429/5xx |
| `timeoutMs` | `number` | `30000` | Timeout por requisicao (ms) |

### `client.messages`

| Metodo | Descricao |
|---|---|
| `.send(params)` | Envia mensagem (todos os tipos) |
| `.sendBulk(params)` | Envio em lote com pacing anti-ban |
| `.get(id)` | Status de uma mensagem |
| `.list(params?)` | Lista mensagens (cursor) |
| `.cancel(id)` | Cancela mensagem na fila |
| `.markRead(id)` | Marca conversa como lida |

### `client.instances`

| Metodo | Descricao |
|---|---|
| `.create(params?)` | Cria nova instancia |
| `.list(params?)` | Lista instancias |
| `.get(id)` | Detalhe + status + healthScore |
| `.qr(id)` | QR code (base64) para conectar |
| `.pair(id, phone)` | Pareamento por codigo de telefone |
| `.restart(id)` | Reinicia instancia |
| `.disconnect(id)` | Desconecta instancia |
| `.update(id, patch)` | Atualiza inboundMode, dailyLimit, webhook |
| `.remove(id)` | Remove instancia |

### `client.phones`

| Metodo | Descricao |
|---|---|
| `.exists(number)` | Verifica se numero tem WhatsApp |
| `.existsBatch(numbers)` | Verifica varios numeros de uma vez |

### `client.webhooks`

| Metodo | Descricao |
|---|---|
| `.create(params)` | Registra webhook de saida |
| `.list()` | Lista webhooks |
| `.remove(id)` | Remove webhook |
| `.deliveries(id)` | Historico de entregas (retry/DLQ) |

### `client.me()`

Retorna informacoes da chave de API: tenant, scopes, modo (test/live).

## Seguranca

- Nunca commite a chave; use variaveis de ambiente.
- Use `sk_test_*` em CI e desenvolvimento; `sk_live_*` so em producao.
- Uma chave por integracao para revogar pontualmente.
- Restrinja scopes ao minimo necessario.
