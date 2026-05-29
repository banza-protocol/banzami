# Banza Python SDK

Official async Python SDK for the [Banza](https://banzami.org) payments platform — Angola's modern payment infrastructure.

## Requirements

- Python 3.12+
- `httpx`, `pydantic >= 2`, `tenacity`

## Installation

```bash
pip install banzami
```

## Quick start

```python
import asyncio
from banza import Banzami

async def main():
    async with Banzami(api_key="bz_live_...") as client:
        tx = await client.transactions.create(
            amount=50000,   # 50 000 Kz
            currency="AOA",
            description="Compra na loja",
        )
        print(tx.id, tx.status)

asyncio.run(main())
```

## QR payment

```python
from datetime import datetime, timedelta, timezone

qr = await client.qr_payments.create_dynamic(
    owner_id="wallet_...",
    amount=25000,
    expires_at=datetime.now(tz=timezone.utc) + timedelta(minutes=15),
)
print(qr.payload)          # raw QR payload to encode into an image
print(qr.qr_code.status)  # ACTIVE
```

## Instant transfer

```python
transfer = await client.transfers.send(
    sender_id="consumer_wallet_A",
    recipient_id="consumer_wallet_B",
    amount=10000,
)
print(transfer.status)  # COMPLETED
```

## Webhook verification

```python
from banza import Banzami, BanzaWebhookSignatureError

client = Banzami(api_key="...", webhook_secret="whsec_...")

# In your request handler — pass the raw bytes body, do NOT decode first.
try:
    event = client.webhooks.construct_event(
        payload=raw_body,
        signature=request.headers["Banza-Signature"],
    )
    print(event.type, event.payload)
except BanzaWebhookSignatureError:
    return 400  # reject
```

## Retry and idempotency

Retries happen automatically on `429 / 502 / 503 / 504` with exponential backoff (500 ms, 1 s, 2 s). Every `POST` is assigned an `Idempotency-Key` before the first attempt and reused across all retries, so financial operations are never duplicated.

```python
client = Banzami(
    api_key="...",
    max_retries=5,       # default 3
    retry_delay=1.0,     # base delay in seconds, default 0.5
)
```

## Observability hooks

```python
from banza import Banzami, BanzaHooks
import logging

log = logging.getLogger("payments")

client = Banzami(
    api_key="...",
    hooks=BanzaHooks(
        on_request=lambda method, path, attempt:
            log.debug("→ %s %s (attempt %d)", method, path, attempt),
        on_response=lambda method, path, status, ms:
            log.info("← %d %s %s (%dms)", status, method, path, ms),
        on_error=lambda method, path, err, attempts:
            log.error("✗ %s %s failed after %d attempts: %s", method, path, attempts, err),
    ),
)
```

## Money helpers

```python
from banza.utils.money import format_minor, to_minor, from_minor

format_minor(50000, "AOA")   # "50.000 Kz"
format_minor(5000,  "USD")   # "USD 50.00"
to_minor(1500.0, "AOA")      # 1500
to_minor(19.99,  "USD")      # 1999
```

## Pagination

```python
from banza import auto_paginate

# Iterate over every transaction without managing cursors manually.
async for tx in auto_paginate(client.transactions.list, limit=50):
    print(tx.id, tx.status)
```

## Context manager vs manual close

```python
# Preferred — closes the connection pool automatically.
async with Banzami(api_key="...") as client:
    ...

# Alternative — call close() when done.
client = Banzami(api_key="...")
try:
    ...
finally:
    await client.close()
```

## Payment links

```python
# Create a fixed-amount link
link = await client.payment_links.create(
    merchant_id="m_001",
    wallet_id="wal_001",
    amount=75000,           # 750 Kz
    description="Compra online",
)
print(link.checkout_url)   # https://pay.banzami.co/{slug}

# Open-amount link (payer enters the amount)
link = await client.payment_links.create(
    merchant_id="m_001",
    wallet_id="wal_001",
)

# Poll status (no auth required)
paid = await client.payment_links.check_status(link.slug)

# Cancel a link
await client.payment_links.cancel(link.id)
```

## Refunds

```python
refund = await client.refunds.create(
    transaction_id="tx_001",
    amount=20000,           # partial refund: 200 Kz
    reason="Produto devolvido",
)
print(refund.status)       # PENDING → SUCCEEDED

# List refunds for a transaction
page = await client.refunds.list(transaction_id="tx_001")
```

## Disputes

```python
# Open a consumer dispute
dispute = await client.disputes.open(
    transaction_id="tx_001",
    consumer_id="con_001",
    amount=50000,
    reason="Produto não recebido",
)

# Merchant submits evidence
dispute = await client.disputes.add_evidence(
    dispute.id,
    evidence="https://storage.banzami.org/receipts/rec_001.pdf",
)

# List open disputes
page = await client.disputes.list(status=DisputeStatus.OPEN)
```

## Payment requests (pedido de pagamento)

```python
from banza import PaymentRequestStatus

# Request money from a specific @banza handle
req = await client.payment_requests.create(
    requester_id="con_001",
    amount=30000,           # 300 Kz
    payer_handle="@ana",
    description="Jantar de ontem",
)

# Payer pays the request
req = await client.payment_requests.pay(req.id)
assert req.status == PaymentRequestStatus.PAID

# Or decline / cancel
await client.payment_requests.decline(req.id)
await client.payment_requests.cancel(req.id)
```

## Framework examples

See the `examples/` directory for working integrations with:

- **FastAPI** — `examples/fastapi/main.py`
- **Django** — `examples/django/views.py`
- **Flask** — `examples/flask/app.py`
- **QR checkout polling loop** — `examples/qr_checkout/checkout.py`
- **Standalone webhook handler** — `examples/webhook_handler/handler.py`

## License

MIT — © 2026 Banza
