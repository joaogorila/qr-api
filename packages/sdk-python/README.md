# qrapi — SDK oficial Python da QR-API

Cliente Python para a **QR-API**, a API de WhatsApp da Flipt.

- **Zero dependencias**: usa apenas a biblioteca padrao (`urllib`, `json`, `uuid`, `time`).
- **Python 3.8+**.
- Retry automatico (429 com `Retry-After`, 5xx e erros de rede com backoff exponencial).
- Idempotencia automatica nos POSTs de criacao.
- Erros tipados via `QrApiError`.

## Instalacao

```bash
pip install qrapi
```

Ou direto do diretorio do pacote:

```bash
pip install .
```

## Inicializacao

```python
from qrapi import QrApi

client = QrApi(api_key="sk_live_...")

# Opcoes (todas com default):
client = QrApi(
    api_key="sk_live_...",
    base_url="https://api.qrapi.flipt.com.br/v1",  # ja inclui /v1
    timeout=30.0,        # segundos por requisicao
    max_retries=3,       # tentativas extra em 429/5xx/rede
)
```

A autenticacao usa o header `Authorization: Bearer <api_key>`.

## Enviar uma mensagem de texto

```python
msg = client.messages.send(
    instance_id="inst_123",
    to="5511999999999",
    type="text",
    text="Ola! Mensagem enviada pela QR-API.",
)
print(msg["id"], msg["status"], msg["request_id"])
```

Tambem aceita um dict:

```python
client.messages.send({
    "instance_id": "inst_123",
    "to": "5511999999999",
    "type": "text",
    "text": "Ola!",
})
```

### Envio em massa

```python
client.messages.send_bulk(
    instance_id="inst_123",
    messages=[
        {"to": "5511999999999", "type": "text", "text": "Oi 1"},
        {"to": "5511888888888", "type": "text", "text": "Oi 2"},
    ],
)
```

### Outras operacoes de mensagem

```python
client.messages.get("msg_abc")                 # buscar
client.messages.list(status="sent", limit=50)  # listar com filtros
client.messages.cancel("msg_abc")              # cancelar agendada
client.messages.mark_read("msg_abc")           # marcar como lida
```

## Criar uma instancia + obter o QR code

```python
inst = client.instances.create(
    name="Atendimento",
    inbound_mode="webhook",
    daily_limit=1000,
    webhook_url="https://meusite.com/webhook",
)
instance_id = inst["id"]

# QR code (base64 PNG) para escanear no WhatsApp
qr = client.instances.qr(instance_id)
print(qr["qr"])         # data base64 do PNG
print(qr["expiresAt"])

# Alternativa: parear por codigo, informando o numero
client.instances.pair(instance_id, "5511999999999")

# Ciclo de vida
client.instances.list()
client.instances.get(instance_id)
client.instances.restart(instance_id)
client.instances.disconnect(instance_id)
client.instances.update(instance_id, {"daily_limit": 2000})
client.instances.remove(instance_id)
```

## Verificar numeros no WhatsApp

```python
client.phones.exists("5511999999999")
client.phones.exists_batch(["5511999999999", "5511888888888"])
```

## Registrar um webhook

```python
hook = client.webhooks.create(
    url="https://meusite.com/webhook",
    events=["message.received", "message.status"],
    secret="um-segredo-para-validar-hmac",
)

client.webhooks.list()
client.webhooks.deliveries(hook["id"])  # historico de entregas
client.webhooks.remove(hook["id"])
```

## Dados da chave de API

```python
me = client.me()
print(me["mode"], me["scopes"])
```

## Tratamento de erros

Toda falha da API levanta `QrApiError`:

```python
from qrapi import QrApi, QrApiError

client = QrApi(api_key="sk_live_...")

try:
    client.messages.send(
        instance_id="inst_123",
        to="numero-invalido",
        type="text",
        text="oi",
    )
except QrApiError as err:
    print("status  :", err.status)       # status HTTP (ex.: 400)
    print("code    :", err.code)         # codigo de erro da API
    print("type    :", err.type)         # categoria (ex.: invalid_request_error)
    print("message :", err.message)      # mensagem legivel
    print("param   :", err.param)        # parametro problematico, se houver
    print("req id  :", err.request_id)   # do header Request-Id
    print("doc     :", err.doc_url)      # link da documentacao
```

## Referencia rapida

| Recurso     | Metodos |
|-------------|---------|
| `messages`  | `send`, `send_bulk`, `get`, `list`, `cancel`, `mark_read` |
| `instances` | `create`, `list`, `get`, `qr`, `pair`, `restart`, `disconnect`, `update`, `remove` |
| `phones`    | `exists`, `exists_batch` |
| `webhooks`  | `create`, `list`, `remove`, `deliveries` |
| (cliente)   | `me` |

## Licenca

MIT
