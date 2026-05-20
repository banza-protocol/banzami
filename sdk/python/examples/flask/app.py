"""Flask example — payment and webhook integration.

Run:
    pip install flask banzami
    BANZAMI_API_KEY=bz_live_... flask --app examples.flask.app run
"""

from __future__ import annotations

import asyncio
import os

from flask import Flask, jsonify, request

from banza import Banzami, BanzaWebhookSignatureError
from banza.utils.money import to_minor

app = Flask(__name__)


def _client() -> Banzami:
    return Banzami(
        api_key=os.environ["BANZAMI_API_KEY"],
        webhook_secret=os.environ.get("BANZAMI_WEBHOOK_SECRET"),
    )


@app.post("/pay")
def create_payment():
    body      = request.get_json()
    amount_kz = float(body["amount_kz"])

    async def _run():
        async with _client() as c:
            return await c.transactions.create(
                amount=to_minor(amount_kz, "AOA"),
                description=body.get("description"),
            )

    tx = asyncio.run(_run())
    return jsonify({"transaction_id": tx.id, "status": tx.status})


@app.post("/webhooks/banzami")
def handle_webhook():
    raw = request.get_data()
    sig = request.headers.get("X-Banzami-Signature", "")

    c = _client()
    try:
        event = c.webhooks.construct_event(raw, sig)
    except BanzaWebhookSignatureError:
        return jsonify({"error": "bad signature"}), 400

    print(f"[banzami] Event received: {event.type}")
    return jsonify({"received": True})
