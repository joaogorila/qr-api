# QR-API no Continue

## Configurar o MCP Server

Edite o arquivo de configuracao do Continue:

- macOS/Linux: `~/.continue/config.json`
- Windows: `%USERPROFILE%\.continue\config.json`

Adicione a secao `mcpServers`:

```json
{
  "mcpServers": [
    {
      "name": "qr-api",
      "command": "npx",
      "args": ["-y", "@flipt/qr-api-mcp"],
      "env": {
        "QR_API_KEY": "sk_live_xxx",
        "QR_API_BASE_URL": "https://api.qrapi.flipt.com.br/v1"
      }
    }
  ]
}
```

Reinicie o VS Code ou Jetbrains (conforme onde usa o Continue) apos salvar.

## Adicionar a documentacao como contexto

No Continue, voce pode adicionar a documentacao como contexto customizado.
Edite o `config.json` e adicione em `docs`:

```json
{
  "docs": [
    {
      "title": "QR-API",
      "startUrl": "https://docs.qrapi.flipt.com.br/llms-full.txt",
      "rootUrl": "https://docs.qrapi.flipt.com.br/"
    }
  ]
}
```

Apos indexar, use `@QR-API` no chat do Continue para incluir a doc como contexto.

## Uso no chat do Continue

Abra o chat do Continue (Ctrl+L) e use prompts diretos:

```
@QR-API

Crie uma funcao Node.js que envia uma mensagem de WhatsApp de confirmacao
de pedido. Use fetch diretamente (sem SDK). A funcao deve:
- Receber phone: string e orderId: string
- Fazer POST para a QR-API com type "text"
- Incluir Idempotency-Key unico (crypto.randomUUID())
- Tratar erro 429 com Retry-After
- Logar o request_id em caso de erro
```

## Usar como slash command

Adicione ao `config.json` para ter um comando rapido:

```json
{
  "slashCommands": [
    {
      "name": "qr-send",
      "description": "Gera codigo para enviar mensagem via QR-API",
      "prompt": "Usando a QR-API, gere o codigo para enviar a seguinte mensagem: "
    }
  ]
}
```
