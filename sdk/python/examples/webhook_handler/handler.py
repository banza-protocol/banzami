"""Standalone async webhook handler — bare asyncio HTTP server.

Demonstrates signature verification and typed event parsing without any framework.

Run:
    BANZAMI_WEBHOOK_SECRET=whsec_... python -m examples.webhook_handler.handler
"""

from __future__ import annotations

import asyncio
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from banza import Banzami, BanzaWebhookSignatureError
from banza.models.webhook import WebhookEvent

WEBHOOK_SECRET = os.environ["BANZAMI_WEBHOOK_SECRET"]
PORT           = int(os.environ.get("PORT", "8090"))

_client = Banzami(api_key="not_used_for_verification", webhook_secret=WEBHOOK_SECRET)


class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        length    = int(self.headers.get("Content-Length", 0))
        raw       = self.rfile.read(length)
        signature = self.headers.get("X-Banzami-Signature", "")

        try:
            event = _client.webhooks.construct_event(raw, signature)
        except BanzaWebhookSignatureError:
            self._respond(400, {"error": "invalid signature"})
            return
        except ValueError as exc:
            self._respond(400, {"error": str(exc)})
            return

        _dispatch(event)
        self._respond(200, {"received": True})

    def _respond(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):  # silence default access log
        pass


def _dispatch(event: WebhookEvent) -> None:
    handlers = {
        "transaction.completed": _on_transaction_completed,
        "transaction.failed":    _on_transaction_failed,
        "payout.completed":      _on_payout_completed,
        "payout.failed":         _on_payout_failed,
    }
    handler = handlers.get(event.type, _on_unknown)
    handler(event)


def _on_transaction_completed(event: WebhookEvent) -> None:
    tx_id  = event.payload.get("transaction_id")
    amount = event.payload.get("amount_minor")
    print(f"[✓] Transação concluída: {tx_id} — {amount} Kz")


def _on_transaction_failed(event: WebhookEvent) -> None:
    print(f"[✗] Transação falhada: {event.payload.get('transaction_id')}")


def _on_payout_completed(event: WebhookEvent) -> None:
    print(f"[✓] Pagamento completado: {event.payload.get('payout_id')}")


def _on_payout_failed(event: WebhookEvent) -> None:
    print(f"[✗] Pagamento falhado: {event.payload.get('payout_id')}")


def _on_unknown(event: WebhookEvent) -> None:
    print(f"[?] Evento desconhecido: {event.type}")


if __name__ == "__main__":
    server = HTTPServer(("", PORT), WebhookHandler)
    print(f"Webhook handler a escutar na porta {PORT}")
    server.serve_forever()
