# QR-API no Cline

## Configurar o MCP Server

Abra as configuracoes do Cline no VS Code (icone de engrenagem no painel do Cline) e edite o campo MCP Settings, ou edite diretamente o arquivo `cline_mcp_settings.json`:

- macOS/Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "qr-api": {
      "command": "npx",
      "args": ["-y", "@flipt/qr-api-mcp"],
      "env": {
        "QR_API_KEY": "sk_live_xxx",
        "QR_API_BASE_URL": "https://api.qrapi.flipt.com.br/v1"
      },
      "disabled": false,
      "autoApprove": ["qr_send_message", "qr_message_status", "qr_instance_status", "qr_check_number"]
    }
  }
}
```

O campo `autoApprove` lista as tools que o Cline pode chamar sem pedir confirmacao.
Operacoes destrutivas como `qr_create_instance` ficam fora do autoApprove por seguranca.

## Uso no Cline

O Cline solicita aprovacao para cada tool call (exceto as listadas em autoApprove).
Voce ve exatamente quais parametros serao enviados antes de confirmar.

Exemplo de task no Cline:

```
Crie uma funcao TypeScript chamada sendOrderConfirmation que:
- Recebe orderId: string, phone: string, total: number
- Usa qr_send_message para enviar mensagem de texto confirmando o pedido
- Usa process.env.QR_INSTANCE_ID como instanceId
- Retorna o messageId da resposta
- Trata erros da API e re-lanca com mensagem clara
```

## Inspecionar as tools disponíveis

Apos configurar, clique no icone de ferramenta no painel do Cline para ver
todas as tools do servidor `qr-api` com suas descricoes e schemas de parametros.
Isso ajuda a entender o que cada tool aceita antes de usar.
