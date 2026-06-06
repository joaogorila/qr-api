<?php

declare(strict_types=1);

namespace Flipt\QrApi;

use Exception;

/**
 * Erro retornado pela QR-API.
 *
 * O corpo de erro chega como:
 *   { "error": { "type", "code", "message", "param", "doc_url" }, "request_id" }
 *
 * Observacao: Exception::getCode() do PHP e um int, entao o "code" string da
 * API e guardado separadamente e exposto via getCode2().
 */
class QrApiException extends Exception
{
    private ?string $errorCode;
    private ?string $errorType;
    private ?string $param;
    private ?string $requestId;
    private ?string $docUrl;
    private int $status;

    public function __construct(
        string $message,
        ?string $errorCode = null,
        ?string $errorType = null,
        ?string $param = null,
        ?string $requestId = null,
        ?string $docUrl = null,
        int $status = 0
    ) {
        parent::__construct($message, $status);
        $this->errorCode = $errorCode;
        $this->errorType = $errorType;
        $this->param = $param;
        $this->requestId = $requestId;
        $this->docUrl = $docUrl;
        $this->status = $status;
    }

    /** Codigo de erro (string) da API. */
    public function getCode2(): ?string
    {
        return $this->errorCode;
    }

    /** Categoria do erro (ex.: invalid_request_error). */
    public function getType(): ?string
    {
        return $this->errorType;
    }

    /** Parametro que causou o erro, se aplicavel. */
    public function getParam(): ?string
    {
        return $this->param;
    }

    /** Valor do header Request-Id. */
    public function getRequestId(): ?string
    {
        return $this->requestId;
    }

    /** Link para a documentacao do erro. */
    public function getDocUrl(): ?string
    {
        return $this->docUrl;
    }

    /** Status HTTP. */
    public function getStatus(): int
    {
        return $this->status;
    }
}
