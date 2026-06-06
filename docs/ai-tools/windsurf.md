# QR-API no Windsurf

## Configurar o MCP Server

Edite o arquivo de configuracao MCP do Windsurf. Localizacao padrao:

- macOS/Linux: `~/.codeium/windsurf/mcp_config.json`
- Windows: `%APPDATA%\Codeium\windsurf\mcp_config.json`

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

Salve e reinicie o Windsurf. O servidor aparece em Settings > MCP Servers.

## Uso no Cascade

Abra o Cascade e use prompts diretos. O Windsurf chama as tools automaticamente:

```
Conecte um numero de WhatsApp usando a QR-API:
1. Crie uma instancia chamada "Notificacoes" com inboundMode "off"
2. Me mostre o QR Code para escanear
3. Apos conectar, envie uma mensagem de teste para 5511999998888
```

```
Implemente um sistema de notificacao de pagamento:
- Ao receber um POST /pagamento-confirmado com { orderId, phone, amount }
- Use a QR-API para enviar: "Pagamento de R$ {amount} confirmado para o pedido {orderId}."
- Salve o messageId retornado no banco de dados
- Em caso de erro da API, retorne o error.code e o request_id no log
```

## Variavel de ambiente recomendada

Nunca coloque a chave direto no mcp_config.json em repositorios compartilhados.
Use variaveis de ambiente do sistema ou um arquivo `.env` fora do controle de versao:

```bash
export QR_API_KEY=sk_live_xxx
```

E no mcp_config.json referencie como `${QR_API_KEY}` (suporte varia por versao do Windsurf;
verifique a documentacao atual do Windsurf para expansao de variaveis de ambiente).
