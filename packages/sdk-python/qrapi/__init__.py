"""SDK oficial Python para a QR-API (produto WhatsApp API da Flipt).

Exemplo rapido::

    from qrapi import QrApi, QrApiError

    client = QrApi(api_key="sk_live_...")
    msg = client.messages.send(
        instance_id="inst_123",
        to="5511999999999",
        type="text",
        text="Ola!",
    )
    print(msg["id"], msg["status"])
"""

from .client import QrApi, QrApiError

__all__ = ["QrApi", "QrApiError"]
__version__ = "0.1.0"
