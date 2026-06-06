<?php

declare(strict_types=1);

namespace Flipt\QrApi;

use Flipt\QrApi\Resources\Instances;
use Flipt\QrApi\Resources\Messages;
use Flipt\QrApi\Resources\Phones;
use Flipt\QrApi\Resources\Webhooks;

/**
 * Cliente oficial PHP da QR-API (WhatsApp API da Flipt).
 *
 * Exemplo:
 *
 *   $client = new \Flipt\QrApi\QrApi('sk_live_...');
 *   $msg = $client->messages->send([
 *       'instanceId' => 'inst_123',
 *       'to'         => '5511999999999',
 *       'type'       => 'text',
 *       'text'       => 'Ola!',
 *   ]);
 *
 * Recursos: ->messages, ->instances, ->phones, ->webhooks e me().
 */
class QrApi
{
    public const DEFAULT_BASE_URL = 'https://api.qrapi.flipt.com.br/v1';

    public Messages $messages;
    public Instances $instances;
    public Phones $phones;
    public Webhooks $webhooks;

    private HttpClient $http;

    /**
     * @param string $apiKey     Chave de API (Authorization: Bearer ...).
     * @param string $baseUrl    URL base (ja inclui /v1).
     * @param int    $timeout    Timeout por requisicao, em segundos.
     * @param int    $maxRetries Tentativas extra em 429/5xx/erros de rede.
     */
    public function __construct(
        string $apiKey,
        string $baseUrl = self::DEFAULT_BASE_URL,
        int $timeout = 30,
        int $maxRetries = 3
    ) {
        $this->http = new HttpClient($apiKey, $baseUrl, $timeout, $maxRetries);
        $this->messages = new Messages($this->http);
        $this->instances = new Instances($this->http);
        $this->phones = new Phones($this->http);
        $this->webhooks = new Webhooks($this->http);
    }

    /**
     * Retorna informacoes da chave de API atual.
     *
     * @return array<string,mixed>|null
     */
    public function me(): ?array
    {
        return $this->http->get('/me');
    }
}
