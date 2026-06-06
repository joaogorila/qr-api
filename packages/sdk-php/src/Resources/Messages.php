<?php

declare(strict_types=1);

namespace Flipt\QrApi\Resources;

use Flipt\QrApi\HttpClient;

/**
 * Operacoes de envio e gestao de mensagens.
 */
class Messages
{
    private HttpClient $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Envia uma mensagem. Retorna ['id','status','request_id'].
     *
     * @param array<string,mixed> $params
     * @return array<string,mixed>|null
     */
    public function send(array $params): ?array
    {
        return $this->http->post('/messages', $params);
    }

    /**
     * Envia varias mensagens de uma vez (instanceId + messages).
     *
     * @param array<string,mixed> $params
     * @return array<string,mixed>|null
     */
    public function sendBulk(array $params): ?array
    {
        return $this->http->post('/messages/bulk', $params);
    }

    /**
     * Busca uma mensagem pelo id.
     *
     * @return array<string,mixed>|null
     */
    public function get(string $id): ?array
    {
        return $this->http->get('/messages/' . rawurlencode($id));
    }

    /**
     * Lista mensagens com filtros opcionais (status, to, cursor, limit...).
     *
     * @param array<string,mixed> $filters
     * @return array<string,mixed>|null
     */
    public function list(array $filters = []): ?array
    {
        return $this->http->get('/messages' . self::query($filters));
    }

    /**
     * Cancela uma mensagem agendada/na fila.
     *
     * @return array<string,mixed>|null
     */
    public function cancel(string $id): ?array
    {
        return $this->http->delete('/messages/' . rawurlencode($id));
    }

    /**
     * Marca uma mensagem como lida.
     *
     * @return array<string,mixed>|null
     */
    public function markRead(string $id): ?array
    {
        return $this->http->post('/messages/' . rawurlencode($id) . '/read', []);
    }

    /**
     * @param array<string,mixed> $params
     */
    private static function query(array $params): string
    {
        $filtered = array_filter(
            $params,
            static fn ($v) => $v !== null
        );
        if ($filtered === []) {
            return '';
        }
        $normalized = [];
        foreach ($filtered as $key => $value) {
            if (is_bool($value)) {
                $value = $value ? 'true' : 'false';
            }
            $normalized[$key] = $value;
        }
        return '?' . http_build_query($normalized);
    }
}
