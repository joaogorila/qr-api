<?php

declare(strict_types=1);

namespace Flipt\QrApi;

/**
 * Camada HTTP fina sobre cURL nativo.
 *
 * Cuida de auth, idempotencia, retry (429 com Retry-After, 5xx e erros de
 * rede com backoff exponencial) e parse de erro para QrApiException.
 *
 * @internal
 */
class HttpClient
{
    private const INITIAL_RETRY_DELAY_MS = 500;

    private string $apiKey;
    private string $baseUrl;
    private int $timeout;
    private int $maxRetries;

    public function __construct(
        string $apiKey,
        string $baseUrl,
        int $timeout,
        int $maxRetries
    ) {
        if ($apiKey === '') {
            throw new \InvalidArgumentException('apiKey e obrigatorio');
        }
        $this->apiKey = $apiKey;
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->timeout = $timeout;
        $this->maxRetries = $maxRetries;
    }

    /**
     * Executa uma requisicao e devolve o corpo JSON decodificado (array) ou null.
     *
     * @param array<string,mixed>|null $body
     * @return array<string,mixed>|null
     */
    public function request(
        string $method,
        string $path,
        ?array $body = null,
        bool $useIdempotencyKey = false
    ): ?array {
        $url = $this->baseUrl . $path;
        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Content-Type: application/json',
            'Accept: application/json',
        ];
        if ($useIdempotencyKey) {
            $headers[] = 'Idempotency-Key: ' . $this->generateIdempotencyKey();
        }

        $payload = $body !== null ? json_encode($body) : null;

        $attempt = 0;
        $lastException = null;

        while ($attempt <= $this->maxRetries) {
            [$status, $rawBody, $responseHeaders, $curlError] =
                $this->execute($method, $url, $headers, $payload);

            // Erro de rede / transporte (cURL).
            if ($curlError !== null) {
                $lastException = new QrApiException(
                    $curlError,
                    'network_error',
                    'connection_error',
                    null,
                    null,
                    null,
                    0
                );
                if ($attempt < $this->maxRetries) {
                    $this->sleepMs($this->backoffMs($attempt));
                    $attempt++;
                    continue;
                }
                throw $lastException;
            }

            // Sucesso.
            if ($status >= 200 && $status < 300) {
                if ($status === 204 || $rawBody === '' || $rawBody === null) {
                    return null;
                }
                $decoded = json_decode($rawBody, true);
                return is_array($decoded) ? $decoded : null;
            }

            $error = $this->parseError($status, $rawBody, $responseHeaders);

            // 429: respeita Retry-After (segundos).
            if ($status === 429 && $attempt < $this->maxRetries) {
                $retryAfter = $this->headerValue($responseHeaders, 'retry-after');
                $waitMs = ($retryAfter !== null && is_numeric($retryAfter))
                    ? (int) round(((float) $retryAfter) * 1000)
                    : $this->backoffMs($attempt);
                $lastException = $error;
                $this->sleepMs($waitMs);
                $attempt++;
                continue;
            }

            // 5xx: backoff exponencial.
            if ($status >= 500 && $attempt < $this->maxRetries) {
                $lastException = $error;
                $this->sleepMs($this->backoffMs($attempt));
                $attempt++;
                continue;
            }

            throw $error;
        }

        if ($lastException instanceof QrApiException) {
            throw $lastException;
        }
        throw new QrApiException(
            'falha apos maxRetries tentativas',
            'network_error',
            'connection_error',
            null,
            null,
            null,
            0
        );
    }

    /**
     * @param array<string,mixed>|null $body
     * @return array<string,mixed>|null
     */
    public function get(string $path): ?array
    {
        return $this->request('GET', $path);
    }

    /**
     * @param array<string,mixed> $body
     * @return array<string,mixed>|null
     */
    public function post(string $path, array $body, bool $idempotent = true): ?array
    {
        return $this->request('POST', $path, $body, $idempotent);
    }

    /**
     * @param array<string,mixed> $body
     * @return array<string,mixed>|null
     */
    public function patch(string $path, array $body): ?array
    {
        return $this->request('PATCH', $path, $body);
    }

    /**
     * @return array<string,mixed>|null
     */
    public function delete(string $path): ?array
    {
        return $this->request('DELETE', $path);
    }

    /**
     * Executa o cURL de fato.
     *
     * @param string[] $headers
     * @return array{0:int,1:?string,2:array<string,string>,3:?string}
     */
    private function execute(
        string $method,
        string $url,
        array $headers,
        ?string $payload
    ): array {
        $ch = curl_init();
        $responseHeaders = [];

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        if ($payload !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        }
        curl_setopt(
            $ch,
            CURLOPT_HEADERFUNCTION,
            function ($curl, string $header) use (&$responseHeaders): int {
                $len = strlen($header);
                $parts = explode(':', $header, 2);
                if (count($parts) === 2) {
                    $name = strtolower(trim($parts[0]));
                    $responseHeaders[$name] = trim($parts[1]);
                }
                return $len;
            }
        );

        $rawBody = curl_exec($ch);
        $curlError = null;
        if ($rawBody === false) {
            $curlError = curl_error($ch) !== '' ? curl_error($ch) : 'erro de rede';
        }
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return [
            $status,
            $rawBody === false ? null : (string) $rawBody,
            $responseHeaders,
            $curlError,
        ];
    }

    /**
     * @param array<string,string> $responseHeaders
     */
    private function parseError(
        int $status,
        ?string $rawBody,
        array $responseHeaders
    ): QrApiException {
        $requestId = $this->headerValue($responseHeaders, 'request-id');
        $body = [];
        if ($rawBody !== null && $rawBody !== '') {
            $decoded = json_decode($rawBody, true);
            if (is_array($decoded)) {
                $body = $decoded;
            }
        }

        $err = (isset($body['error']) && is_array($body['error']))
            ? $body['error']
            : $body;

        if ($requestId === null && isset($body['request_id'])) {
            $requestId = (string) $body['request_id'];
        }

        return new QrApiException(
            $err['message'] ?? ('HTTP ' . $status),
            $err['code'] ?? (string) $status,
            $err['type'] ?? 'api_error',
            $err['param'] ?? null,
            $requestId,
            $err['doc_url'] ?? null,
            $status
        );
    }

    /**
     * @param array<string,string> $headers
     */
    private function headerValue(array $headers, string $name): ?string
    {
        return $headers[strtolower($name)] ?? null;
    }

    private function backoffMs(int $attempt): int
    {
        return (int) (self::INITIAL_RETRY_DELAY_MS * (2 ** $attempt));
    }

    private function sleepMs(int $ms): void
    {
        if ($ms > 0) {
            usleep($ms * 1000);
        }
    }

    private function generateIdempotencyKey(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40); // versao 4
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80); // variante
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
