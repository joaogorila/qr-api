<?php

declare(strict_types=1);

namespace Flipt\QrApi\Resources;

use Flipt\QrApi\HttpClient;

/**
 * Gestao de webhooks.
 */
class Webhooks
{
    private HttpClient $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Registra um webhook (url, events, secret).
     *
     * @param array<string,mixed> $params
     * @return array<string,mixed>|null
     */
    public function create(array $params): ?array
    {
        return $this->http->post('/webhooks', $params);
    }

    /**
     * Lista os webhooks registrados.
     *
     * @return array<string,mixed>|null
     */
    public function list(): ?array
    {
        return $this->http->get('/webhooks');
    }

    /**
     * Remove um webhook.
     *
     * @return array<string,mixed>|null
     */
    public function remove(string $id): ?array
    {
        return $this->http->delete('/webhooks/' . rawurlencode($id));
    }

    /**
     * Lista as tentativas de entrega de um webhook.
     *
     * @return array<string,mixed>|null
     */
    public function deliveries(string $id): ?array
    {
        return $this->http->get('/webhooks/' . rawurlencode($id) . '/deliveries');
    }
}
