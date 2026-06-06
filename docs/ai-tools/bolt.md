# QR-API no Bolt

O Bolt gera aplicacoes full-stack. A chave de API da QR-API deve ficar SEMPRE
no codigo de servidor, nunca no bundle do cliente.

## IMPORTANTE: seguranca da chave

Nunca use a QR_API_KEY em arquivos que rodam no browser (componentes, hooks, stores).
Sempre em: server actions, API routes, Express handlers, Cloudflare Workers, etc.

## Prompt para o Bolt

Cole no chat do Bolt para gerar a integracao completa:

```
Crie uma aplicacao Node.js/Express com as seguintes funcionalidades:

1. Rota POST /api/notificar que recebe { phone, orderId, total } e envia
   uma mensagem de WhatsApp de confirmacao de pedido via QR-API.

2. A chave de API fica em process.env.QR_API_KEY (nunca exposta no cliente).
   O instanceId fica em process.env.QR_INSTANCE_ID.

3. A mensagem enviada deve ser:
   "Seu pedido #${orderId} foi confirmado. Total: R$ ${total}. Obrigado!"

4. Em caso de erro, retorna { success: false, error: { code, message }, requestId }.

5. Em caso de sucesso, retorna { success: true, messageId }.

Usa fetch nativo (Node 18+). Inclui Idempotency-Key com crypto.randomUUID().
```

## Implementacao do handler Express

```javascript
// server/routes/notificar.js
const express = require("express");
const router = express.Router();

router.post("/api/notificar", async (req, res) => {
  const { phone, orderId, total } = req.body;

  if (!phone || !orderId || !total) {
    return res.status(400).json({ success: false, error: { message: "phone, orderId e total sao obrigatorios" } });
  }

  const apiKey = process.env.QR_API_KEY;
  const instanceId = process.env.QR_INSTANCE_ID;

  if (!apiKey || !instanceId) {
    return res.status(500).json({ success: false, error: { message: "configuracao de API ausente" } });
  }

  try {
    const response = await fetch("https://api.qrapi.flipt.com.br/v1/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        instanceId,
        to: phone,
        type: "text",
        text: `Seu pedido #${orderId} foi confirmado. Total: R$ ${total}. Obrigado!`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[QR-API] Erro:", data.error?.code, data.request_id);
      return res.status(response.status).json({
        success: false,
        error: { code: data.error?.code, message: data.error?.message },
        requestId: data.request_id,
      });
    }

    return res.json({ success: true, messageId: data.id });
  } catch (err) {
    console.error("[QR-API] Excecao:", err.message);
    return res.status(500).json({ success: false, error: { message: "Erro interno" } });
  }
});

module.exports = router;
```

## Arquivo .env (nunca commitar)

```
QR_API_KEY=sk_live_xxx
QR_INSTANCE_ID=inst_xxx
```

Adicione `.env` ao `.gitignore`.

## Enviar para o frontend (componente simples)

```html
<!-- Exemplo de formulario HTML que chama o backend -->
<form id="form-notificar">
  <input type="tel" id="phone" placeholder="5511999998888" />
  <input type="text" id="orderId" placeholder="ID do pedido" />
  <input type="number" id="total" placeholder="49.90" step="0.01" />
  <button type="submit">Notificar</button>
</form>

<script>
  document.getElementById("form-notificar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("/api/notificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: document.getElementById("phone").value,
        orderId: document.getElementById("orderId").value,
        total: document.getElementById("total").value,
      }),
    });
    const data = await res.json();
    alert(data.success ? "Mensagem enviada: " + data.messageId : "Erro: " + data.error.message);
  });
</script>
```

Nota: a chave nunca aparece neste HTML. Toda a autenticacao fica no Express.
