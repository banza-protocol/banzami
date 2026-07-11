<?php
// Banzami SDK preview example.
// This is SDK-style documentation, not a public install path.
// Do not run composer require banzami/sdk until official packages are published.
//
// illustrative SDK-style API — intended ergonomics (controlled preview).
// Placeholders only; never real keys. Sandbox/Preview scope; no real money.

// The secret test key lives ONLY on the server.
$banzami = BanzamiClient::preview(getenv('BANZAMI_API_KEY')); // bz_test_sk_XXXX

// Expected contract: verify the key first (identity, no financial state).
$me = $banzami->me();
// -> ['environment' => 'SANDBOX', 'project' => 'my-project', 'scopes' => ['identity:read'], 'key_status' => 'ACTIVE']

// Expected contract: create a payment session — the SDK manages the
// Idempotency-Key (or accepts an explicit caller-provided one).
$session = $banzami->paymentSessions->create([
    'wallet_account_id' => 'wacc_xxx',
    'purpose' => 'PAGAMENTO',
    'reference_type' => 'PEDIDO',
    'reference_id' => 'order_123',
    'amount_minor' => 25000, // minor units (AOA)
    'currency' => 'AOA',
    'description' => 'Order #123',
], ['idempotency_key' => 'idem_xxx']);

// Expected contract: canonical error mapping + request_id exposure.
// catch (BanzamiException $e) { $e->getCode() === 'VALIDATION_ERROR'; $e->getRequestId() === 'req_xxx'; }
