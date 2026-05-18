# Banzami SDK Certification Suite

Shared golden test vectors and per-SDK test runners that verify all Banzami SDK implementations produce identical webhook signature verification behavior.

---

## Purpose

This suite enforces the **cross-SDK contract**: every official Banzami SDK must verify webhook signatures identically to the canonical Go implementation in `services/api-gateway/internal/webhook/signer.go`.

Passing this certification is a **merge requirement** for all SDK PRs.

---

## Directory Layout

```
sdk-certification/
├── README.md                          ← this file
├── vectors/
│   └── webhook_signatures.json        ← shared golden test vectors
├── python/
│   └── test_webhook_vectors.py        ← Python SDK certification
└── typescript/
    └── webhook_vectors.test.ts        ← TypeScript SDK certification
```

---

## Running Certification Tests

### Python

```bash
cd sdk-certification/python
../../sdk/python/.venv/bin/pytest test_webhook_vectors.py -v
```

### TypeScript

```bash
cd sdk/typescript
npx vitest run ../../sdk-certification/typescript/webhook_vectors.test.ts
```

### Future SDKs (Go, PHP, etc.)

Add a new directory `sdk-certification/<language>/` with a test runner that:
1. Reads `../vectors/webhook_signatures.json`
2. Runs each vector through the SDK's `verifySignature` implementation
3. Asserts the result matches `expected_result`
4. Verifies `generateTestSignature` output matches `expected_header` for valid vectors

---

## Adding New Test Vectors

1. Compute the expected HMAC using the canonical Go implementation or any verified SDK
2. Add the vector to `vectors/webhook_signatures.json`
3. All existing SDK test runners will automatically pick it up on next run

---

## Result Codes

| `expected_result` | Meaning |
|-------------------|---------|
| `valid` | Signature is correct and within the replay window |
| `replay_rejected` | Timestamp is outside the 300-second tolerance window |
| `signature_mismatch` | HMAC does not match |
| `malformed_header` | Header format cannot be parsed |

---

## Specification

See [docs/standards/webhook-signature-spec.md](../docs/standards/webhook-signature-spec.md) for the full canonical specification.
