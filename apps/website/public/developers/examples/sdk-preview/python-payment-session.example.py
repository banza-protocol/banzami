# Banzami SDK preview example.
# This is SDK-style documentation, not a public install path.
# Do not run pip install banzami until official packages are published.
#
# illustrative SDK-style API — intended ergonomics (controlled preview).
# Placeholders only; never real keys. Sandbox/Preview scope; no real money.

# The secret test key lives ONLY on the server.
banzami = BanzamiClient.preview(api_key=os.environ["BANZAMI_API_KEY"])  # bz_test_sk_XXXX

# Expected contract: verify the key first (identity, no financial state).
me = banzami.me()
# -> {"environment": "SANDBOX", "project": "my-project", "scopes": ["identity:read"], "key_status": "ACTIVE"}

# Expected contract: create a payment session — the SDK manages the
# Idempotency-Key (or accepts an explicit caller-provided one).
session = banzami.payment_sessions.create(
    wallet_account_id="wacc_xxx",
    purpose="ORDER",
    reference_type="PEDIDO",
    reference_id="order_123",
    amount_minor=25000,  # minor units (AOA)
    currency="AOA",
    description="Order #123",
    idempotency_key="idem_xxx",
)

# Expected contract: canonical error mapping + request_id exposure.
# except BanzamiError as err: err.code == "VALIDATION_ERROR"; err.request_id == "req_xxx"
