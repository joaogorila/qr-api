# QR-API no Lovable

O Lovable nao executa processos locais, entao o MCP Server stdio nao se aplica.
A integracao correta e via SDK Node em uma funcao de backend ou edge function.

## IMPORTANTE: nunca exponha a chave no client-side

A chave de API (QR_API_KEY) deve ficar SEMPRE no servidor.
Nunca coloque sk_live_xxx em codigo que roda no browser, componente React,
ou qualquer arquivo que vai para o cliente. Isso compromete toda a sua conta.

## Opcao 1: Supabase Edge Function (recomendado no Lovable)

No Lovable, crie uma edge function via Supabase. Cole o prompt abaixo no chat:

```
Crie uma Supabase Edge Function chamada "send-whatsapp" que:
1. Recebe um POST com { phone: string, message: string, instanceId: string }
2. Chama a QR-API em https://api.qrapi.flipt.com.br/v1/messages
   com Authorization: Bearer {Deno.env.get("QR_API_KEY")}
   e Idempotency-Key: crypto.randomUUID()
3. Retorna { messageId, status } em caso de sucesso
4. Retorna o error.code e request_id da QR-API em caso de falha
5. A chave fica no secret QR_API_KEY do Supabase (nunca no codigo)
```

Exemplo de implementacao da edge function:

```typescript
// supabase/functions/send-whatsapp/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { phone, message, instanceId } = await req.json();

  if (!phone || !message || !instanceId) {
    return new Response(
      JSON.stringify({ error: "phone, message e instanceId sao obrigatorios" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiKey = Deno.env.get("QR_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "QR_API_KEY nao configurada" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const res = await fetch("https://api.qrapi.flipt.com.br/v1/messages", {
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
      text: message,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return new Response(JSON.stringify({ error: data.error, request_id: data.request_id }), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ messageId: data.id, status: data.status }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
```

Configure o secret no painel Supabase: Settings > Edge Functions > Secrets > QR_API_KEY.

## Opcao 2: Prompt para o Lovable gerar a integracao

Cole no chat do Lovable:

```
Crie uma integracao com a QR-API para enviar WhatsApp quando um pedido for confirmado.

Regras de seguranca:
- A chave QR_API_KEY fica APENAS no servidor (Supabase Edge Function ou Supabase RPC)
- Nunca no client-side, nunca em variavel VITE_ ou NEXT_PUBLIC_

Fluxo:
1. Componente React chama /api/notificar-pedido com { pedidoId, phone, total }
2. A funcao de backend busca QR_API_KEY do ambiente servidor
3. Chama POST https://api.qrapi.flipt.com.br/v1/messages com:
   - Authorization: Bearer {QR_API_KEY}
   - Idempotency-Key: UUID aleatorio
   - body: { instanceId: process.env.QR_INSTANCE_ID, to: phone, type: "text",
             text: "Pedido #{pedidoId} confirmado. Total: R$ {total}" }
4. Retorna o messageId para o frontend
5. Em caso de erro, loga o error.code e request_id

instanceId vem de QR_INSTANCE_ID no ambiente servidor.
```

## Chamar a edge function do componente React

```tsx
// Componente React no Lovable (sem a chave, apenas chama o backend)
async function notificarCliente(phone: string, message: string) {
  const res = await fetch("/functions/v1/send-whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone,
      message,
      instanceId: "inst_123", // ou vem do contexto/env publico
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error("Erro QR-API:", err.error?.code, err.request_id);
    throw new Error(err.error?.message || "Erro ao enviar mensagem");
  }

  return res.json(); // { messageId, status }
}
```
