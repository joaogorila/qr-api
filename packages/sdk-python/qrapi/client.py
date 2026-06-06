"""Cliente HTTP da QR-API.

SDK oficial Python para a QR-API (produto WhatsApp API da Flipt).
Zero dependencias: usa apenas a stdlib (urllib, json, uuid, time).
Espelha a superficie do SDK Node oficial.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any, Dict, Iterable, List, Optional

__all__ = ["QrApi", "QrApiError"]

DEFAULT_BASE_URL = "https://api.qrapi.flipt.com.br/v1"
MAX_RETRIES = 3
INITIAL_RETRY_DELAY_MS = 500


class QrApiError(Exception):
    """Erro retornado pela QR-API.

    O corpo de erro chega como
    ``{"error": {"type", "code", "message", "param", "doc_url"}, "request_id"}``.

    Atributos:
        code: codigo de erro (string) da API.
        type: categoria do erro (ex.: ``invalid_request_error``).
        message: mensagem legivel.
        param: parametro que causou o erro, se aplicavel.
        request_id: valor do header ``Request-Id``.
        doc_url: link para a documentacao do erro.
        status: status HTTP.
    """

    def __init__(
        self,
        message: str,
        *,
        code: Optional[str] = None,
        type: Optional[str] = None,  # noqa: A002 - espelha o campo da API
        param: Optional[str] = None,
        request_id: Optional[str] = None,
        doc_url: Optional[str] = None,
        status: int = 0,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.type = type
        self.param = param
        self.request_id = request_id
        self.doc_url = doc_url
        self.status = status

    def __repr__(self) -> str:  # pragma: no cover - apenas conveniencia
        return (
            f"QrApiError(status={self.status!r}, code={self.code!r}, "
            f"type={self.type!r}, message={self.message!r})"
        )


def _generate_idempotency_key() -> str:
    """Gera uma chave de idempotencia (UUID v4)."""
    return str(uuid.uuid4())


def _build_query_string(params: Optional[Dict[str, Any]]) -> str:
    """Monta a querystring ignorando valores ``None``."""
    if not params:
        return ""
    pairs = [(k, v) for k, v in params.items() if v is not None]
    if not pairs:
        return ""
    # bool -> "true"/"false" (compativel com o backend), demais via str().
    encoded = []
    for key, value in pairs:
        if isinstance(value, bool):
            value = "true" if value else "false"
        encoded.append((str(key), str(value)))
    return "?" + urllib.parse.urlencode(encoded)


class _HttpClient:
    """Camada HTTP fina com retry, idempotencia e parse de erro."""

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
        max_retries: int = MAX_RETRIES,
    ) -> None:
        if not api_key:
            raise ValueError("api_key e obrigatorio")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._max_retries = max_retries

    def _headers(self, idempotency_key: Optional[str]) -> Dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        return headers

    @staticmethod
    def _parse_error(status: int, raw: bytes, request_id: Optional[str]) -> QrApiError:
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except (ValueError, UnicodeDecodeError):
            body = {}
        err = body.get("error") if isinstance(body, dict) else None
        if not isinstance(err, dict):
            err = body if isinstance(body, dict) else {}
        request_id = request_id or (
            body.get("request_id") if isinstance(body, dict) else None
        )
        return QrApiError(
            err.get("message") or f"HTTP {status}",
            code=err.get("code") or str(status),
            type=err.get("type") or "api_error",
            param=err.get("param"),
            request_id=request_id,
            doc_url=err.get("doc_url"),
            status=status,
        )

    def request(
        self,
        method: str,
        path: str,
        body: Any = None,
        use_idempotency_key: bool = False,
    ) -> Any:
        """Executa uma requisicao com retry e devolve o JSON decodificado."""
        url = f"{self._base_url}{path}"
        idempotency_key = (
            _generate_idempotency_key() if use_idempotency_key else None
        )
        headers = self._headers(idempotency_key)
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")

        attempt = 0
        last_exc: Optional[Exception] = None

        while attempt <= self._max_retries:
            req = urllib.request.Request(
                url, data=data, headers=headers, method=method.upper()
            )
            try:
                with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                    status = resp.getcode()
                    raw = resp.read()
                    if status == 204 or not raw:
                        return None
                    return json.loads(raw.decode("utf-8"))
            except urllib.error.HTTPError as exc:
                raw = exc.read() if hasattr(exc, "read") else b""
                request_id = exc.headers.get("Request-Id") if exc.headers else None
                err = self._parse_error(exc.code, raw, request_id)

                # 429: respeita Retry-After (segundos).
                if exc.code == 429 and attempt < self._max_retries:
                    retry_after = exc.headers.get("Retry-After") if exc.headers else None
                    if retry_after:
                        try:
                            wait = float(retry_after)
                        except ValueError:
                            wait = (INITIAL_RETRY_DELAY_MS / 1000) * (2 ** attempt)
                    else:
                        wait = (INITIAL_RETRY_DELAY_MS / 1000) * (2 ** attempt)
                    attempt += 1
                    last_exc = err
                    time.sleep(wait)
                    continue

                # 5xx: backoff exponencial.
                if exc.code >= 500 and attempt < self._max_retries:
                    wait = (INITIAL_RETRY_DELAY_MS / 1000) * (2 ** attempt)
                    attempt += 1
                    last_exc = err
                    time.sleep(wait)
                    continue

                raise err
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                # Erro de rede / timeout: tenta de novo com backoff.
                last_exc = exc
                if attempt < self._max_retries:
                    wait = (INITIAL_RETRY_DELAY_MS / 1000) * (2 ** attempt)
                    attempt += 1
                    time.sleep(wait)
                    continue
                raise QrApiError(
                    str(exc) or "erro de rede",
                    code="network_error",
                    type="connection_error",
                    status=0,
                ) from exc

        if isinstance(last_exc, QrApiError):
            raise last_exc
        raise QrApiError(
            "falha apos maxRetries tentativas",
            code="network_error",
            type="connection_error",
            status=0,
        )

    def get(self, path: str) -> Any:
        return self.request("GET", path)

    def post(self, path: str, body: Any, idempotent: bool = True) -> Any:
        return self.request("POST", path, body, use_idempotency_key=idempotent)

    def patch(self, path: str, body: Any) -> Any:
        return self.request("PATCH", path, body)

    def delete(self, path: str) -> Any:
        return self.request("DELETE", path)


def _quote(value: str) -> str:
    return urllib.parse.quote(str(value), safe="")


class _MessagesResource:
    """Operacoes de envio e gestao de mensagens."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def send(self, params: Optional[Dict[str, Any]] = None, **kwargs: Any) -> Dict[str, Any]:
        """Envia uma mensagem. Aceita um dict de params ou kwargs.

        Ex.: ``client.messages.send(instance_id=..., to=..., type="text", text=...)``.
        Retorna ``{"id", "status", "request_id"}``.
        """
        payload = _merge(params, kwargs)
        return self._http.post("/messages", payload)

    def send_bulk(
        self, params: Optional[Dict[str, Any]] = None, **kwargs: Any
    ) -> Dict[str, Any]:
        """Envia varias mensagens de uma vez (``instance_id`` + ``messages``)."""
        payload = _merge(params, kwargs)
        return self._http.post("/messages/bulk", payload)

    def get(self, message_id: str) -> Dict[str, Any]:
        """Busca uma mensagem pelo id."""
        return self._http.get(f"/messages/{_quote(message_id)}")

    def list(
        self, filters: Optional[Dict[str, Any]] = None, **kwargs: Any
    ) -> Dict[str, Any]:
        """Lista mensagens com filtros opcionais (status, to, cursor, limit...)."""
        merged = _merge(filters, kwargs, require=False)
        return self._http.get(f"/messages{_build_query_string(merged)}")

    def cancel(self, message_id: str) -> None:
        """Cancela uma mensagem agendada/na fila."""
        return self._http.delete(f"/messages/{_quote(message_id)}")

    def mark_read(self, message_id: str) -> None:
        """Marca uma mensagem como lida."""
        return self._http.post(f"/messages/{_quote(message_id)}/read", {})


class _InstancesResource:
    """Operacoes sobre instancias (numeros) WhatsApp."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def create(
        self, params: Optional[Dict[str, Any]] = None, **kwargs: Any
    ) -> Dict[str, Any]:
        """Cria uma instancia."""
        payload = _merge(params, kwargs, require=False) or {}
        return self._http.post("/instances", payload)

    def list(
        self, params: Optional[Dict[str, Any]] = None, **kwargs: Any
    ) -> Dict[str, Any]:
        """Lista instancias (cursor, limit)."""
        merged = _merge(params, kwargs, require=False)
        return self._http.get(f"/instances{_build_query_string(merged)}")

    def get(self, instance_id: str) -> Dict[str, Any]:
        """Busca uma instancia pelo id."""
        return self._http.get(f"/instances/{_quote(instance_id)}")

    def qr(self, instance_id: str) -> Dict[str, Any]:
        """Retorna o QR code (base64 PNG) para parear a instancia."""
        return self._http.get(f"/instances/{_quote(instance_id)}/qr")

    def pair(self, instance_id: str, phone: str) -> None:
        """Pareia a instancia por codigo, usando o numero de telefone."""
        return self._http.post(
            f"/instances/{_quote(instance_id)}/pair", {"phone": phone}
        )

    def restart(self, instance_id: str) -> None:
        """Reinicia a instancia."""
        return self._http.post(f"/instances/{_quote(instance_id)}/restart", {})

    def disconnect(self, instance_id: str) -> None:
        """Desconecta (logout) a instancia."""
        return self._http.post(f"/instances/{_quote(instance_id)}/disconnect", {})

    def update(self, instance_id: str, patch: Optional[Dict[str, Any]] = None, **kwargs: Any) -> Dict[str, Any]:
        """Atualiza a instancia (inbound_mode, daily_limit, webhook_url...)."""
        body = _merge(patch, kwargs, require=False) or {}
        return self._http.patch(f"/instances/{_quote(instance_id)}", body)

    def remove(self, instance_id: str) -> None:
        """Remove a instancia."""
        return self._http.delete(f"/instances/{_quote(instance_id)}")


class _PhonesResource:
    """Verificacao de numeros no WhatsApp."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def exists(self, number: str) -> Dict[str, Any]:
        """Verifica se um numero existe no WhatsApp."""
        return self._http.get(f"/phones/{_quote(number)}/exists")

    def exists_batch(self, numbers: Iterable[str]) -> Dict[str, Any]:
        """Verifica varios numeros de uma vez."""
        return self._http.post("/phones/exists", {"numbers": list(numbers)})


class _WebhooksResource:
    """Gestao de webhooks."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def create(
        self, params: Optional[Dict[str, Any]] = None, **kwargs: Any
    ) -> Dict[str, Any]:
        """Registra um webhook (url, events, secret)."""
        payload = _merge(params, kwargs)
        return self._http.post("/webhooks", payload)

    def list(self) -> Dict[str, Any]:
        """Lista os webhooks registrados."""
        return self._http.get("/webhooks")

    def remove(self, webhook_id: str) -> None:
        """Remove um webhook."""
        return self._http.delete(f"/webhooks/{_quote(webhook_id)}")

    def deliveries(self, webhook_id: str) -> Dict[str, Any]:
        """Lista as tentativas de entrega de um webhook."""
        return self._http.get(f"/webhooks/{_quote(webhook_id)}/deliveries")


def _merge(
    params: Optional[Dict[str, Any]],
    kwargs: Dict[str, Any],
    require: bool = True,
) -> Dict[str, Any]:
    """Combina um dict posicional com kwargs.

    ``require=True`` exige que ao menos um dos dois traga dados.
    """
    merged: Dict[str, Any] = {}
    if params:
        if not isinstance(params, dict):
            raise TypeError("params deve ser um dict")
        merged.update(params)
    if kwargs:
        merged.update(kwargs)
    if require and not merged:
        raise ValueError("informe os parametros via dict ou kwargs")
    return merged


class QrApi:
    """Cliente oficial da QR-API.

    Args:
        api_key: chave de API (``Authorization: Bearer <api_key>``).
        base_url: URL base (ja inclui ``/v1``).
        timeout: timeout por requisicao em segundos.
        max_retries: numero de tentativas extra em 429/5xx/erros de rede.

    Recursos:
        ``client.messages``, ``client.instances``, ``client.phones``,
        ``client.webhooks`` e ``client.me()``.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
        max_retries: int = MAX_RETRIES,
    ) -> None:
        self._http = _HttpClient(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
        )
        self.messages = _MessagesResource(self._http)
        self.instances = _InstancesResource(self._http)
        self.phones = _PhonesResource(self._http)
        self.webhooks = _WebhooksResource(self._http)

    def me(self) -> Dict[str, Any]:
        """Retorna informacoes da chave de API atual."""
        return self._http.get("/me")
