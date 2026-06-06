# Portal SaaS & Billing (Onda 4)

O produto standalone `qr-api` ganhou onboarding público, contas de usuário e cobrança por número, sem nenhuma dependência nova (Stripe via REST, JWT e hash de senha via `crypto` nativo).

## Como funciona

```
Visitante  →  /portal (SPA)  →  /portal/api/signup  →  Account + User + chave de teste
                                      │
   login (JWT)  ──────────────────────┤
                                      ▼
   Dashboard: assinatura · uso · números (+ QR) · chaves de API
                                      │
   Assinar plano  →  /portal/api/billing/checkout  →  Stripe Checkout (ou mock)
                                      ▼
   Stripe webhook  →  /webhooks/billing/stripe  →  sincroniza Subscription + Invoice
```

## Autenticação (dois mundos separados)
- **Portal** (humano): JWT via `Authorization: Bearer <jwt>` nas rotas `/portal/api/*`. Login/senha (scrypt).
- **API pública** (máquina): API key `sk_live_/sk_test_` nas rotas `/v1/*`. Inalterada.

## Planos (âncora de mercado vs. Z-API)
| Plano | Preço | Números | Limite/dia por número |
|---|---|---|---|
| Starter | R$ 99/mês | 1 | 1.000 |
| Pro | R$ 299/mês | 5 | 5.000 |
| Business | R$ 899/mês | 20 | 10.000 |

`quantity` na assinatura permite contratar mais números dentro do mesmo plano.

## Enforcement (onde o billing "morde")
- **Provisionar número**: `instanceService.createInstance` chama `assertCanProvisionInstance` (bloqueia se números ativos ≥ permitido pelo plano × quantity).
- **Enviar mensagem**: `sendService.enqueueMessage` chama `assertActiveForSend` (bloqueia se assinatura `past_due`/`canceled`). Trial implícito (sem assinatura) é permitido com 1 número.
- **Limite diário** da nova instância vem do plano (`planDailyLimit`).

## Provedores de pagamento (multi-provedor)

O checkout escolhe o provedor por requisição (campo `provider`) ou pelo padrão `BILLING_PROVIDER`:

| Provedor | Meios | Foco | API |
|---|---|---|---|
| **Mercado Pago** (padrão) | PIX + cartão | Brasil | Preapproval (assinatura recorrente) |
| **Stripe** | Cartão internacional | Global | Checkout Session (subscription) |

No portal, ao assinar, o usuário escolhe: `pix` (Mercado Pago) ou `card` (Stripe). Ambos caem no mesmo `Subscription` (o campo `stripeSubscriptionId` guarda o id do provedor; o do MP fica prefixado `mp_`).

Cada provedor tem seu webhook: `/webhooks/billing/stripe` e `/webhooks/billing/mercadopago`. Sem o token do provedor (`MERCADOPAGO_ACCESS_TOKEN` / `STRIPE_SECRET_KEY`), o checkout roda em **modo mock** (ativa a assinatura na hora, sem cobrança).

### Mercado Pago (REST, sem SDK)
`src/billing/mercadoPagoClient.ts`:
- `createSubscriptionCheckout` → `POST /preapproval` (recorrência mensal, `transaction_amount` = preço × quantidade), retorna `init_point`.
- `getPreapproval` para sincronizar status no webhook.
- `verifyWebhook`: valida `x-signature` (HMAC-SHA256 do template `id:<dataId>;request-id:<x-request-id>;ts:<ts>;`).
- Status: `authorized`→ACTIVE, `pending`→INCOMPLETE, `paused`→PAST_DUE, `cancelled`→CANCELED.

## Stripe (REST, sem SDK)
`src/billing/stripeClient.ts` fala direto com `api.stripe.com/v1` via `fetch`:
- `createCustomer`, `createCheckoutSession` (mode=subscription), `createBillingPortalSession`.
- `verifyWebhook`: valida o header `Stripe-Signature` (HMAC-SHA256 de `timestamp.payload`).
- **Modo mock**: sem `STRIPE_SECRET_KEY`, o checkout ativa a assinatura na hora (`activateMock`) para você testar o fluxo end-to-end sem conta Stripe.

### Webhook (sincronização)
`/webhooks/billing/stripe` (raw body, montado antes do `express.json`) trata:
`customer.subscription.created/updated/deleted` → `syncFromStripe`; `invoice.paid/payment_failed` → grava `Invoice`.

## Variáveis de ambiente
```bash
PORTAL_JWT_SECRET=                 # segredo do JWT do portal
PORTAL_PUBLIC_URL=https://app.qrapi.flipt.com.br/portal
STRIPE_SECRET_KEY=                 # vazio = modo mock (dev)
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=              # price_... do Stripe por plano
STRIPE_PRICE_PRO=
STRIPE_PRICE_BUSINESS=
```

## Arquivos (Onda 4)
- `prisma/schema.prisma`: + Account, User, Subscription, Invoice (+ enums)
- `src/lib/jwt.ts`, `src/lib/password.ts`
- `src/billing/stripeClient.ts`
- `src/services/authService.ts`, `src/services/subscriptionService.ts`
- `src/middleware/portalAuth.ts`
- `src/routes/portal.ts`, `src/routes/billingWebhook.ts`
- `public/portal/index.html` (SPA do portal)
- `src/app.ts` (montagem), `instanceService.ts` + `sendService.ts` (enforcement)

> PIX como meio de pagamento alternativo ao cartão fica como evolução: a camada de billing já está isolada em `stripeClient` + `subscriptionService`, então plugar um provedor PIX é trocar o adapter.
