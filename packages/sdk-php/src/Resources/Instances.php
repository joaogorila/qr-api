<?php

declare(strict_types=1);

namespace Flipt\QrApi\Resources;

use Flipt\QrApi\HttpClient;

/**
 * Operacoes sobre instancias (numeros) WhatsApp.
 */
class Instances
{
    private HttpClient $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Cria uma instancia.
     *
     * @param array<string,mixed> $params
     * @return array<string,mixed>|null
     */
    public function create(array $params = []): ?array
    {
        return $this->http->post('/instances', $params);
    }

    /**
     * Lista instancias (cursor, limit).
     *
     * @param array<string,mixed> $params
     * @return array<string,mixed>|null
     */
    public function list(array $params = []): ?array
    {
        return $this->http->get('/instances' . self::query($params));
    }

    /**
     * Busca uma instancia pelo id.
     *
     * @return array<string,mixed>|null
     */
    public function get(string $id): ?array
    {
        return $this->http->get('/instances/' . rawurlencode($id));
    }

    /**
     * Retorna o QR code (base64 PNG) para parear a instancia.
     *
     * @return array<string,mixed>|null
     */
    public function qr(string $id): ?array
    {
        return $this->http->get('/instances/' . rawurlencode($id) . '/qr');
    }

    /**
     * Pareia a instancia por codigo, usando o numero de telefone.
     *
     * @return array<string,mixed>|null
     */
    public function pair(string $id, string $phone): ?array
    {
        return $this->http->post(
            '/instances/' . rawurlencode($id) . '/pair',
            ['phone' => $phone]
        );
    }

    /**
     * Reinicia a instancia.
     *
     * @return array<string,mixed>|null
     */
    public function restart(string $id): ?array
    {
        return $this->http->post('/instances/' . rawurlencode($id) . '/restart', []);
    }

    /**
     * Desconecta (logout) a instancia.
     *
     * @return array<string,mixed>|null
     */
    public function disconnect(string $id): ?array
    {
        return $this->http->post('/instances/' . rawurlencode($id) . '/disconnect', []);
    }

    /**
     * Atualiza a instancia (inboundMode, dailyLimit, webhookUrl...).
     *
     * @param array<string,mixed> $patch
     * @return array<string,mixed>|null
     */
    public function update(string $id, array $patch): ?array
    {
        return $this->http->patch('/instances/' . rawurlencode($id), $patch);
    }

    /**
     * Remove a instancia.
     *
     * @return array<string,mixed>|null
     */
    public function remove(string $id): ?array
    {
        return $this->http->delete('/instances/' . rawurlencode($id));
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
