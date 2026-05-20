"""FastAPI example — payment link creation and webhook reception.

Run:
    pip install fastapi uvicorn banzami
    uvicorn examples.fastapi.main:app --reload
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel

from banza import Banzami, BanzaWebhookSignatureError
from banza.models import PaymentLink, Transaction, WebhookEvent

client: Banzami


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    client = Banzami(
        api_key=os.environ["BANZAMI_API_KEY"],
        webhook_secret=os.environ.get("BANZAMI_WEBHOOK_SECRET"),
    )
    yield
    await client.close()


app = FastAPI(title="Banzami FastAPI Demo", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Create a transaction
# ---------------------------------------------------------------------------

class CreateTransactionRequest(BaseModel):
    amount_kz: float
    description: str | None = None


@app.post("/pay", response_model=dict)
async def create_payment(body: CreateTransactionRequest):
    """Accept a payment amount in Kwanza and return a checkout URL."""
    from banza.utils.money import to_minor

    tx = await client.transactions.create(
        amount=to_minor(body.amount_kz, "AOA"),
        currency="AOA",
        description=body.description,
    )
    return {"transaction_id": tx.id, "status": tx.status}


# ---------------------------------------------------------------------------
# QR checkout
# ---------------------------------------------------------------------------

class QrRequest(BaseModel):
    amount_kz: float
    expires_in_minutes: int = 15


@app.post("/qr", response_model=dict)
async def create_qr(body: QrRequest):
    """Generate a dynamic QR code for an exact amount."""
    from banza.utils.money import to_minor
    from datetime import datetime, timedelta, timezone

    owner_id = os.environ["BANZAMI_WALLET_ID"]
    qr = await client.qr_payments.create_dynamic(
        owner_id=owner_id,
        amount=to_minor(body.amount_kz, "AOA"),
        expires_at=datetime.now(tz=timezone.utc) + timedelta(minutes=body.expires_in_minutes),
    )
    return {
        "qr_id":      qr.qr_code.id,
        "payload":    qr.payload,
        "expires_at": qr.qr_code.expires_at.isoformat() if qr.qr_code.expires_at else None,
    }


# ---------------------------------------------------------------------------
# Webhook handler
# ---------------------------------------------------------------------------

@app.post("/webhooks/banzami")
async def handle_webhook(
    request: Request,
    x_banzami_signature: str = Header(...),
):
    """Receive and verify Banzami webhook events."""
    raw = await request.body()

    try:
        event: WebhookEvent = client.webhooks.construct_event(raw, x_banzami_signature)
    except BanzaWebhookSignatureError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    match event.type:
        case "transaction.completed":
            tx_id = event.payload.get("transaction_id")
            print(f"[webhook] Transaction {tx_id} completed")
        case "payout.completed":
            payout_id = event.payload.get("payout_id")
            print(f"[webhook] Payout {payout_id} completed")
        case _:
            print(f"[webhook] Unhandled event type: {event.type}")

    return {"received": True}
