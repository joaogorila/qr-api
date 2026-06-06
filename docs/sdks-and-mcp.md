# SDKs oficiais & MCP (Onda 6)

A QR-API tem SDKs oficiais em 3 linguagens e um MCP server com dois transportes, para ser a referência tanto de devs tradicionais quanto de AI coders.

## SDKs oficiais

| Linguagem | Pacote | Deps | Local |
|---|---|---|---|
| Node/TS | `@flipt/qr-api` | zero (fetch nativo) | `packages/sdk-node` |
| Python | `qrapi` (PyPI) | zero (stdlib urllib) | `packages/sdk-python` |
| PHP | `flipt/qr-api` (Composer) | zero (cURL nativo) | `packages/sdk-php` |

Todos têm a **mesma superfície**: recursos `messages`, `instances`, `phones`, `webhooks` + `me()`, com **retry automático** (429 respeita `Retry-After`, 5xx com backoff exponencial), **Idempotency-Key** automática nos POSTs de criação, auth `Bearer`, e erro estruturado (`QrApiError`/`QrApiException` com `code`, `type`, `param`, `request_id`, `doc_url`).

### Python
```python
from qrapi import QrApi, QrApiError

client = QrApi(api_key="sk_live_xxx")
try:
    msg = client.messages.send(instance_id="inst_123", to="5511999998888", type="text", text="Olá!")
    print(msg["id"], msg["status"])
except QrApiError as e:
    print(e.code, e.message, e.doc_url)
```

### PHP
```php
use Flipt\QrApi\QrApi;
use Flipt\QrApi\QrApiException;

$client = new QrApi("sk_live_xxx");
try {
    $msg = $client->messages->send(["instanceId" => "inst_123", "to" => "5511999998888", "type" => "text", "text" => "Olá!"]);
    echo $msg["id"];
} catch (QrApiException $e) {
    echo $e->getCode2() . ": " . $e->getMessage();
}
```

### Node
```ts
import { QrApi } from "@flipt/qr-api";
const qr = new QrApi({ apiKey: "sk_live_xxx" });
await qr.messages.send({ instanceId: "inst_123", to: "5511999998888", type: "text", text: "Olá!" });
```

## MCP server — dois transportes

O `@flipt/qr-api-mcp` expõe as tools (`qr_send_message`, `qr_create_instance`, `qr_get_qr`, `qr_check_number`, etc.) para qualquer cliente MCP.

### stdio (local, IDEs) — Claude Code, Cursor, Cline, Windsurf
```jsonc
{
  "mcpServers": {
    "qr-api": {
      "command": "npx",
      "args": ["-y", "@flipt/qr-api-mcp"],
      "env": { "QR_API_KEY": "sk_live_xxx", "QR_API_BASE_URL": "https://api.qrapi.flipt.com.br/v1" }
    }
  }
}
```

### HTTP/SSE (remoto) — Lovable, v0, agentes web e qualquer cliente que não roda processo local
Suba o server em modo HTTP:
```bash
MCP_TRANSPORT=http PORT=8787 QR_API_KEY=sk_live_xxx npx @flipt/qr-api-mcp
# ou: npx @flipt/qr-api-mcp --http
```
- Endpoint MCP: `POST http://host:8787/mcp` (Streamable HTTP, stateless: um servidor efêmero por requisição).
- Health: `GET /health`.
- CORS liberado para clientes web.
- Hospede atrás de TLS (ex: `mcp.qrapi.flipt.com.br`) e aponte o cliente MCP remoto para ele.

> Escolha do transporte: `MCP_TRANSPORT=stdio` (padrão) para IDEs locais; `MCP_TRANSPORT=http` para um endpoint MCP remoto compartilhado.
