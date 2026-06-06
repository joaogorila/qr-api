# Prompts prontos para a QR-API

Colecao de prompts copy-paste para qualquer assistente de IA (Claude, GPT, Gemini, etc.).
Substitua os valores entre chaves {} pelo que e especifico do seu projeto.

---

## Conectar um numero

```
Usando a QR-API (documentacao em https://docs.qrapi.flipt.com.br ou via MCP qr-api):

1. Crie uma instancia chamada "{NOME DA INSTANCIA}" com inboundMode "{off | webhook | followfy}".
2. Retorne o QR Code para eu escanear no WhatsApp.
3. Apos eu confirmar que escanei, verifique se o status mudou para "connected".

Usa o instanceId retornado para todas as proximas operacoes.
Chave de API: process.env.QR_API_KEY. Base URL: https://api.qrapi.flipt.com.br/v1.
```

---

## Enviar mensagem de texto quando evento ocorrer

```
Crie um endpoint POST /{ROTA} em {FRAMEWORK} que:
1. Recebe { phone: string, {OUTROS CAMPOS DO SEU CONTEXTO} } no body.
2. Usa a QR-API para enviar a seguinte mensagem de texto para phone:
   "{TEXTO DA MENSAGEM COM VARIAVEIS}"
3. O instanceId vem de process.env.QR_INSTANCE_ID.
4. A chave de API vem de process.env.QR_API_KEY (nunca exposta no cliente).
5. Inclui Idempotency-Key unico para evitar envio duplicado em retries.
6. Em caso de erro, loga o error.code e o request_id e retorna status HTTP correto.
```

---

## Enviar imagem/documento

```
Usando a QR-API, crie uma funcao que envia {imagem | documento} para um numero de WhatsApp.

Parametros:
- phone: numero destino em E.164 sem + (ex.: 5511999998888)
- fileUrl: URL publica do arquivo (PDF, JPG, PNG, MP4, etc.)
- caption: legenda opcional

Use type "{image | document | video}" dependendo do tipo de arquivo.
Para documento, inclua filename com o nome do arquivo.
A chave de API vem de process.env.QR_API_KEY.
O instanceId vem de process.env.QR_INSTANCE_ID.
```

---

## Enviar em lote para lista de clientes

```
Usando a QR-API, implemente uma funcao que:
1. Recebe uma lista de clientes: [{ phone: string, nome: string, {OUTROS CAMPOS} }]
2. Usa POST /messages/bulk para enviar mensagens personalizadas com pacing automatico.
3. A mensagem para cada cliente e: "{TEMPLATE COM {{nome}} E OUTRAS VARIAVEIS}"
4. Varia o inicio da mensagem para cada destinatario (anti-ban).
5. Retorna um array com { phone, messageId, status } para cada envio.

instanceId: process.env.QR_INSTANCE_ID
Chave: process.env.QR_API_KEY
```

---

## Registrar webhook e validar assinatura

```
Usando a QR-API:

1. Registre um webhook para a instancia {INSTANCE_ID} que entrega para
   {URL DO SEU ENDPOINT} os eventos: {message.received, message.status, instance.connected}.

2. Implemente o endpoint receptor em {FRAMEWORK} que:
   a. Lê o corpo bruto (raw body, nao parseado)
   b. Valida o header X-Qr-Signature usando HMAC-SHA256 com o secret retornado na criacao
   c. Rejeita com 401 se a assinatura for invalida
   d. Rejeita se o X-Qr-Timestamp tiver mais de 5 minutos de diferenca (anti-replay)
   e. Responde 200 imediatamente e processa o evento de forma assincrona
   f. Faz dedup pelo campo id do evento

O secret fica em process.env.QR_WEBHOOK_SECRET.
```

---

## Verificar numeros antes de enviar

```
Usando a QR-API, crie uma funcao que:
1. Recebe uma lista de numeros de telefone
2. Usa POST /phones/exists para verificar quais tem WhatsApp
3. Retorna separados: { comWhatsApp: string[], semWhatsApp: string[] }

Numero no formato E.164 sem + (ex.: 5511999998888).
Chave: process.env.QR_API_KEY.
```

---

## Monitorar saude da instancia

```
Usando a QR-API, crie uma funcao de health check que:
1. Chama GET /instances/{INSTANCE_ID} e retorna o healthScore
2. Se healthScore < 60, loga um aviso "RISCO DE BAN" e aciona {ALERTA/REDUCAO DE VOLUME}
3. Se healthScore < 40, loga "CRITICO" e para o envio de mensagens novas
4. Se status != "connected", tenta reconectar via POST /instances/{id}/restart

Rodar a cada {N} minutos via cron/setInterval.
Chave: process.env.QR_API_KEY.
```

---

## Enviar mensagem PIX (cobranca via WhatsApp)

```
Usando a QR-API, crie uma rota POST /cobrar que:
1. Recebe { phone: string, valor: number, chavePixTipo: string, chavePix: string }
2. Envia mensagem do tipo "pix" com:
   - key: {CHAVE PIX}
   - keyType: {cpf | cnpj | email | phone | random}
   - name: "{NOME DO BENEFICIARIO}"
   - amount: valor
3. Antes de enviar, verifica se o numero tem WhatsApp via GET /phones/{phone}/exists
4. Se nao tiver WhatsApp, retorna 422 com mensagem clara

Chave: process.env.QR_API_KEY. InstanceId: process.env.QR_INSTANCE_ID.
```

---

## Enviar mensagem com botoes

```
Usando a QR-API, implemente uma funcao que envia uma mensagem de confirmacao
com botoes de resposta rapida:

- text: "Confirma o agendamento para {DATA} as {HORA}?"
- botao 1: id "confirmar", label "Confirmar"
- botao 2: id "cancelar", label "Cancelar"
- botao 3: id "reagendar", label "Reagendar"

Para o destino: phone = {NUMERO}
instanceId = process.env.QR_INSTANCE_ID
Chave: process.env.QR_API_KEY

Apos enviar, registre um webhook para message.received e, quando a resposta
chegar com data.text == "confirmar"/"cancelar"/"reagendar", execute a acao correspondente.
```

---

## Lidar com rate limit (429)

```
Usando a QR-API, implemente uma funcao de envio com retry inteligente:
1. Tenta enviar a mensagem
2. Se receber 429, le o header Retry-After e aguarda aquele numero de segundos
3. Aplica backoff exponencial: 1s, 2s, 4s, 8s (maximo 3 tentativas)
4. Se ainda assim falhar, lanca excecao com o error.code e request_id
5. Para todos os outros erros (4xx), nao tenta novamente (exceto com Idempotency-Key para 500)

Chave: process.env.QR_API_KEY.
```

---

## Integrar QR-API com {PLATAFORMA DE E-COMMERCE}

```
Integre a QR-API com {Shopify | WooCommerce | Loja Integrada | VTEX | outra}.

Quando um pedido for {criado | pago | enviado | entregue}:
1. Extraia o telefone do cliente do payload do evento
2. Formate o numero para E.164 sem + (remova espacos, parenteses, hifen, 0 inicial)
3. Envie a seguinte mensagem via QR-API: "{TEMPLATE}"

Use process.env.QR_API_KEY e process.env.QR_INSTANCE_ID.
Inclua Idempotency-Key baseado no ID do pedido para evitar envio duplicado em retries.
Exemplo: Idempotency-Key: "pedido-{orderId}-{evento}"
```
