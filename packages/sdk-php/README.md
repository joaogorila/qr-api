# flipt/qr-api — SDK oficial PHP da QR-API

Cliente PHP para a **QR-API**, a API de WhatsApp da Flipt.

- **cURL nativo**, zero dependencias de runtime.
- **PHP 8.0+**, PSR-4 (`Flipt\QrApi\`).
- Retry automatico (429 com `Retry-After`, 5xx e erros de rede com backoff exponencial).
- Idempotencia automatica nos POSTs de criacao.
- Erros tipados via `QrApiException`.

## Instalacao

```bash
composer require flipt/qr-api
```

## Inicializacao

```php
<?php
require 'vendor/autoload.php';

use Flipt\QrApi\QrApi;

$client = new QrApi('sk_live_...');

// Opcoes (todas com default):
$client = new QrApi(
    apiKey: 'sk_live_...',
    baseUrl: 'https://api.qrapi.flipt.com.br/v1', // ja inclui /v1
    timeout: 30,      // segundos por requisicao
    maxRetries: 3     // tentativas extra em 429/5xx/rede
);
```

A autenticacao usa o header `Authorization: Bearer <apiKey>`.

## Enviar uma mensagem de texto

```php
$msg = $client->messages->send([
    'instanceId' => 'inst_123',
    'to'         => '5511999999999',
    'type'       => 'text',
    'text'       => 'Ola! Mensagem enviada pela QR-API.',
]);

echo $msg['id'], ' ', $msg['status'], ' ', $msg['request_id'];
```

### Envio em massa

```php
$client->messages->sendBulk([
    'instanceId' => 'inst_123',
    'messages'   => [
        ['to' => '5511999999999', 'type' => 'text', 'text' => 'Oi 1'],
        ['to' => '5511888888888', 'type' => 'text', 'text' => 'Oi 2'],
    ],
]);
```

### Outras operacoes de mensagem

```php
$client->messages->get('msg_abc');                          // buscar
$client->messages->list(['status' => 'sent', 'limit' => 50]); // listar com filtros
$client->messages->cancel('msg_abc');                       // cancelar agendada
$client->messages->markRead('msg_abc');                     // marcar como lida
```

## Criar uma instancia + obter o QR code

```php
$inst = $client->instances->create([
    'name'        => 'Atendimento',
    'inboundMode' => 'webhook',
    'dailyLimit'  => 1000,
    'webhookUrl'  => 'https://meusite.com/webhook',
]);
$instanceId = $inst['id'];

// QR code (base64 PNG) para escanear no WhatsApp
$qr = $client->instances->qr($instanceId);
echo $qr['qr'];        // data base64 do PNG
echo $qr['expiresAt'];

// Alternativa: parear por codigo, informando o numero
$client->instances->pair($instanceId, '5511999999999');

// Ciclo de vida
$client->instances->list();
$client->instances->get($instanceId);
$client->instances->restart($instanceId);
$client->instances->disconnect($instanceId);
$client->instances->update($instanceId, ['dailyLimit' => 2000]);
$client->instances->remove($instanceId);
```

## Verificar numeros no WhatsApp

```php
$client->phones->exists('5511999999999');
$client->phones->existsBatch(['5511999999999', '5511888888888']);
```

## Registrar um webhook

```php
$hook = $client->webhooks->create([
    'url'    => 'https://meusite.com/webhook',
    'events' => ['message.received', 'message.status'],
    'secret' => 'um-segredo-para-validar-hmac',
]);

$client->webhooks->list();
$client->webhooks->deliveries($hook['id']); // historico de entregas
$client->webhooks->remove($hook['id']);
```

## Dados da chave de API

```php
$me = $client->me();
echo $me['mode'], ' ', implode(',', $me['scopes']);
```

## Tratamento de erros

Toda falha da API lanca `QrApiException`. Como `Exception::getCode()` do PHP e
um `int`, o codigo de erro (string) da API e exposto via `getCode2()`:

```php
use Flipt\QrApi\QrApi;
use Flipt\QrApi\QrApiException;

$client = new QrApi('sk_live_...');

try {
    $client->messages->send([
        'instanceId' => 'inst_123',
        'to'         => 'numero-invalido',
        'type'       => 'text',
        'text'       => 'oi',
    ]);
} catch (QrApiException $err) {
    echo 'status  : ', $err->getStatus(), PHP_EOL;     // status HTTP (ex.: 400)
    echo 'code    : ', $err->getCode2(), PHP_EOL;      // codigo de erro da API
    echo 'type    : ', $err->getType(), PHP_EOL;       // categoria
    echo 'message : ', $err->getMessage(), PHP_EOL;    // mensagem legivel
    echo 'param   : ', $err->getParam(), PHP_EOL;      // parametro problematico
    echo 'req id  : ', $err->getRequestId(), PHP_EOL;  // do header Request-Id
    echo 'doc     : ', $err->getDocUrl(), PHP_EOL;     // link da documentacao
}
```

## Referencia rapida

| Recurso     | Metodos |
|-------------|---------|
| `messages`  | `send`, `sendBulk`, `get`, `list`, `cancel`, `markRead` |
| `instances` | `create`, `list`, `get`, `qr`, `pair`, `restart`, `disconnect`, `update`, `remove` |
| `phones`    | `exists`, `existsBatch` |
| `webhooks`  | `create`, `list`, `remove`, `deliveries` |
| (cliente)   | `me` |

## Licenca

MIT
