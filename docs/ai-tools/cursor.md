# QR-API no Cursor

## 1. Configurar o MCP Server

Crie o arquivo `.cursor/mcp.json` na raiz do seu projeto:

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

Abra Settings > MCP no Cursor e verifique se o servidor `qr-api` aparece ativo.

## 2. Indexar a documentacao via @Docs

No Cursor, va em Settings > Features > Docs e adicione as URLs:

- `https://docs.qrapi.flipt.com.br/llms-full.txt` (nome sugerido: QR-API Full Docs)
- `https://docs.qrapi.flipt.com.br/openapi.json` (nome sugerido: QR-API OpenAPI)

Apos indexar, use `@QR-API Full Docs` no Composer para dar contexto ao modelo.

## 3. Cursor Rules (opcional)

Crie `.cursor/rules/qr-api.mdc`:

```
---
description: Regras para integracao com a QR-API
globs: ["**/*.ts", "**/*.js"]
alwaysApply: false
---

Ao integrar a QR-API:
- Use o MCP tool qr_send_message para enviar mensagens simples
- Use qr_send_bulk para lotes (pacing aplicado automaticamente)
- Numero destino sempre em E.164 sem + (ex.: 5511999998888)
- Chave de API sempre via process.env.QR_API_KEY, nunca inline
- Para receber eventos, registre webhook com qr_register_webhook
- Valide assinatura X-Qr-Signature com HMAC-SHA256 no endpoint receptor
```

## 4. Uso no Composer

Abra o Composer (Ctrl+I), cole um prompt e mencione as tools pelo nome:

```
@QR-API Full Docs

Crie um endpoint POST /notificar-pedido que:
1. Recebe { pedidoId, telefone, valor } no body
2. Usa a QR-API (qr_send_message) para enviar mensagem de texto
   confirmando o pedido para o telefone
3. O instanceId vem de process.env.QR_INSTANCE_ID
4. A chave de API vem de process.env.QR_API_KEY
5. Retorna 200 com o id da mensagem ou 500 com detalhes do erro
```

O Composer vai usar o MCP para chamar a API diretamente enquanto gera o codigo.

## 5. Importar o OpenAPI no Postman / Thunder Client

Baixe ou aponte para `https://docs.qrapi.flipt.com.br/openapi.json`.
No Postman: Import > Link > cole a URL.
No Thunder Client: Collections > Import > OpenAPI.

Isso gera todas as requests pre-configuradas com os schemas corretos.
