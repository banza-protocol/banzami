# Banzami Python SDK

Official async Python SDK for the [Banzami](https://banzami.com) payments platform — Angola's modern payment infrastructure.

## Requirements

- Python 3.12+
- `httpx`, `pydantic >= 2`, `tenacity`

## Installation

The distribution is `banzami-python` (imported as `banzami`). It is **not
published on PyPI** — a `pip install` of a registry name would fetch nothing, or
someone else's package. Install it from this repository:

```bash
pip install ./sdk/python
```

## Environments

The key's prefix picks the gateway, as in every Banzami SDK:

| Key | Gateway |
|-----|---------|
| `bz_test_…` | `https://sandbox-api.banzami.com` (Sandbox) |
| `bz_live_…` | `https://api.banzami.com` (Live — not enabled by default) |

The client adds the `/v1` prefix itself. Pass `base_url=` only to point at
another deployment (a local gateway, for instance).

## Quick start

```python
import asyncio
from banzami import Banzami

async def main():
    async with Banzami(api_key="bz_test_...") as client:
        tx = await client.transactions.create(
            amount=50000,   # 500 Kz (minor units are cêntimos: 1 Kz = 100)
            currency="AOA",
            description="Compra na loja",
        )
        print(tx.id, tx.status)

asyncio.run(main())
```

## Being paid by QR

Show the QR of a **payment link**: encode `link.checkout_url` (the hosted pay
URL, `https://pay.banzami.com/pay/{slug}`) into the QR image. Any phone camera
opens the pay page. See [Payment links](#payment-links).

`client.qr_payments.create_static()` / `create_dynamic()` issue structured
Banzami QR codes. No route pays a structured QR today (the QR-pay route is being
rebuilt on the consumer surface), so do not present them to payers.

A server key never moves a person's money, so this SDK has no transfer call: the
id-based merchant transfer surface was retired, and consumer-to-consumer
transfers belong to the consumer app.

## Webhook verification

```python
from banzami import Banzami, BanzamiWebhookSignatureError

client = Banzami(api_key="...", webhook_secret="whsec_...")

# In your request handler — pass the raw bytes body, do NOT decode first.
try:
    event = client.webhooks.construct_event(
        payload=raw_body,
        signature=request.headers["banza-signature"],
    )
    print(event.type, event.payload)
except BanzamiWebhookSignatureError:
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
from banzami import Banzami, BanzamiHooks
import logging

log = logging.getLogger("payments")

client = Banzami(
    api_key="...",
    hooks=BanzamiHooks(
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
from banzami.utils.money import format_minor, to_minor, from_minor

# Minor units are cêntimos for AOA: 1 Kz = 100 minor units.
format_minor(5000000, "AOA") # "50 000 Kz"
format_minor(5000050, "AOA") # "50 000,50 Kz"
format_minor(5000,  "USD")   # "USD 50.00"
to_minor(1500.0, "AOA")      # 150000
to_minor(19.99,  "USD")      # 1999
```

## Pagination

```python
from banzami import auto_paginate

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
print(link.checkout_url)   # https://pay.banzami.com/pay/{slug}

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
    source_type="WALLET_PAYMENT",   # or ACQUIRING_PAYMENT
    source_id="wp_001",
    amount=20000,           # partial refund: 200 Kz
    currency="AOA",
    reason="Produto devolvido",
    idempotency_key="refund-order-001",  # required: a stable key for this refund
)
print(refund.status)       # PENDING → SUCCEEDED

# List refunds, optionally for one source
page = await client.refunds.list(source_id="wp_001")
```

## Disputes

```python
# Open a consumer dispute
dispute = await client.disputes.open(
    transaction_id="tx_001",
    consumer_id="con_001",
    amount=50000,           # 500 Kz
    reason="Produto não recebido",
)

# Merchant submits evidence
dispute = await client.disputes.add_evidence(
    dispute.id,
    evidence="https://storage.banzami.com/receipts/rec_001.pdf",
)

# List open disputes
page = await client.disputes.list(status=DisputeStatus.OPEN)
```

## Framework examples

See the `examples/` directory for working integrations with:

- **FastAPI** — `examples/fastapi/main.py`
- **Django** — `examples/django/views.py`
- **Flask** — `examples/flask/app.py`
- **QR checkout polling loop** — `examples/qr_checkout/checkout.py`
- **Standalone webhook handler** — `examples/webhook_handler/handler.py`

## License

MIT — © 2026 Banzami
