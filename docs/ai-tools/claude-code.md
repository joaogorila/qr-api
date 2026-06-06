# QR-API no Claude Code

## 1. Configurar o MCP Server

Crie ou edite o arquivo `.mcp.json` na raiz do seu projeto:

```json
{
  "mcpServers": {
    "qr-api": {
      "command": "npx",
      "args": ["-y", "@flipt/qr-api-mcp"],
      "env": {
        "QR_API_KEY": "sk_live_xxx",
        "QR_API_BASE_URL": "https://api.qrapi.flipt.com.br/v1"
      }
    }
  }
}
```

Para sandbox (sem mandar mensagem real), use `sk_test_xxx` e o mesmo BASE_URL.

Reinicie o Claude Code apos salvar o arquivo. O servidor aparece no painel de ferramentas MCP como `qr-api`.

## 2. Snippet para o CLAUDE.md do seu projeto

Cole este bloco no `CLAUDE.md` do seu projeto para que o Claude saiba como usar a QR-API:

```markdown
## QR-API (WhatsApp)

Envio de WhatsApp via MCP qr-api. Tools disponíveis:

- qr_send_message: envia texto, imagem, documento, botoes, lista, PIX, etc.
- qr_send_bulk: lote com pacing anti-ban automatico.
- qr_create_instance: cria nova conexao de numero.
- qr_get_qr: retorna QR para conectar o numero (base64).
- qr_instance_status: status e healthScore da instancia.
- qr_check_number: verifica se numero tem WhatsApp.
- qr_register_webhook: registra endpoint para receber eventos.

Regras:
- Sempre usar instanceId da instancia conectada (status=connected).
- Para envios em producao, sempre incluir Idempotency-Key (SDK gera automaticamente).
- Numero em E.164 sem + (ex.: 5511999998888).
- Chave no env QR_API_KEY, nunca no codigo.
```

## 3. Exemplos de prompt

### Conectar um numero
```
Crie uma instancia na QR-API com nome "ERP Vendas" e inboundMode "off".
Depois me mostre o QR Code para eu escanear.
```

### Enviar confirmacao de pedido
```
Quando o pedido #1234 do cliente 5511999998888 for marcado como pago,
use a QR-API para enviar uma mensagem de texto confirmando o pedido
com o instanceId inst_xxx. Use a tool qr_send_message.
```

### Enviar imagem com documento
```
Use a QR-API para enviar o PDF de nota fiscal em
https://cdn.meusite.com/nf-1234.pdf para o numero 5511999998888,
com caption "Nota fiscal do seu pedido #1234".
```

### Enviar em lote para lista de clientes
```
Tenho uma lista de numeros: ["5511999990001", "5511999990002", "5511999990003"].
Use qr_send_bulk com instanceId inst_xxx para enviar uma mensagem de texto
personalizada para cada um. Varie o inicio da mensagem para cada numero.
```

### Registrar webhook
```
Registre um webhook na QR-API para a instancia inst_xxx que escuta
os eventos message.received e message.status e entrega para
https://meuapp.com/webhooks/whatsapp.
```

## 4. Como o MCP responde

O servidor MCP retorna a resposta completa da API incluindo o request_id.
Se algo der errado, o erro inclui type, code, message e doc_url apontando
para a documentacao relevante. Cole o request_id ao pedir ajuda no suporte.
