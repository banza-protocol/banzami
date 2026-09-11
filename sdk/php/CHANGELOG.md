# Changelog

All notable changes to `banzami/sdk-php` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Removed — Laravel facade: payment-request methods

The facade docblock declared six payment-request methods that `BanzamiClient`
no longer has (the operator withdrew `/v1/payment-requests`, RA-057), and
`listRefunds($transactionId)` where the client takes `$sourceId`. It now
declares only what the client has; `tests/FacadeTest.php` checks it.

### Documentation — README

- It documented methods the client does not have — `sendTransfer`,
  `createStaticQr`, `createDynamicQr`, `createPayout`, `Banzami::webhooks()`
  and exception helpers such as `isInsufficientFunds()`. Those sections are
  removed or rewritten against the real client, and a repository guard
  (`tests/ops/sdk-readme-methods.test.mjs`) checks every call in the README.
- Every amount comment read minor units as kwanzas (`'amount_minor' => 12500,
  // 12 500 Kz` is 125 Kz). AOA minor units are cêntimos: 1 Kz = 100.
- Sandbox keys are `bz_test_…` (not `bz_sandbox_…`); the webhook header is
  `banza-signature` (`$_SERVER['HTTP_BANZA_SIGNATURE']`); the refund example
  names the typed source and the required `idempotency_key`; the payment-link
  URL is `https://pay.banzami.com/pay/{slug}`.
