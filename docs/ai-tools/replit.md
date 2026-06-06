# QR-API no Replit

## 1. Configurar o secret QR_API_KEY

No Replit, NUNCA coloque a chave direto no codigo. Use os Secrets:

1. Abra seu Repl.
2. No menu lateral, clique em "Secrets" (icone de cadeado).
3. Adicione:
   - Key: `QR_API_KEY`, Value: `sk_live_xxx`
   - Key: `QR_INSTANCE_ID`, Value: `inst_xxx`

Os secrets ficam disponiveis como variaveis de ambiente (`process.env.QR_API_KEY`).

## 2. Instalar o SDK

No shell do Replit:

```bash
npm install @flipt/qr-api
```

## 3. Exemplo completo (Node.js / Express)

```javascript
// index.js
const express = require("express");
const QrApi = require("@flipt/qr-api").default;

const app = express();
app.use(express.json());

const client = new QrApi({ apiKey: process.env.QR_API_KEY });

// Enviar mensagem de texto
app.post("/notificar", async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: "phone e message sao obrigatorios" });
  }

  try {
    const msg = await client.messages.send({
      instanceId: process.env.QR_INSTANCE_ID,
      to: phone,
      type: "text",
      text: message,
    });

    res.json({ messageId: msg.id, status: msg.status });
  } catch (err) {
    console.error("[QR-API]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Verificar se numero tem WhatsApp
app.get("/verificar/:phone", async (req, res) => {
  try {
    const result = await client.phones.checkExists(req.params.phone);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
```

## 4. Exemplo sem SDK (fetch puro)

```javascript
// sem-sdk.js
const apiKey = process.env.QR_API_KEY;
const instanceId = process.env.QR_INSTANCE_ID;
const BASE = "https://api.qrapi.flipt.com.br/v1";

async function enviarWhatsApp(phone, message) {
  const res = await fetch(`${BASE}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ instanceId, to: phone, type: "text", text: message }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`${data.error?.code}: ${data.error?.message} [${data.request_id}]`);
  }

  return data; // { id, status, request_id }
}

enviarWhatsApp("5511999998888", "Ola do Replit!")
  .then(console.log)
  .catch(console.error);
```

## 5. Testar na sandbox (sem enviar de verdade)

Troque o secret `QR_API_KEY` por uma chave `sk_test_xxx`.
Com a chave de teste, a API simula o envio sem mandar mensagem real.
Ideal para desenvolver e testar no Replit antes de ativar a producao.

## Observacoes sobre o Replit

- O Replit reinicia o processo ao editar o codigo. Use `npm start` ou `node index.js`.
- Para persistir logs, use o console do Replit ou um servico externo.
- O URL publico do seu Repl (https://seu-repl.replit.app) pode ser usado como destino de webhook da QR-API.
