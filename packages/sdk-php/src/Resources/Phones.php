<?php

declare(strict_types=1);

namespace Flipt\QrApi\Resources;

use Flipt\QrApi\HttpClient;

/**
 * Verificacao de numeros no WhatsApp.
 */
class Phones
{
    private HttpClient $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Verifica se um numero existe no WhatsApp.
     *
     * @return array<string,mixed>|null
     */
    public function exists(string $number): ?array
    {
        return $this->http->get('/phones/' . rawurlencode($number) . '/exists');
    }

    /**
     * Verifica varios numeros de uma vez.
     *
     * @param string[] $numbers
     * @return array<string,mixed>|null
     */
    public function existsBatch(array $numbers): ?array
    {
        return $this->http->post('/phones/exists', ['numbers' => array_values($numbers)]);
    }
}
