# CORE_INTERNAL_KEY — internal operational note (Sandbox)

**Internal only. Not public developer documentation. Never publish the value.**

## What it is
`CORE_INTERNAL_KEY` is the dedicated Gateway→Core service credential (Banzami D0/F4).
The API Gateway sends it to Core as the `X-Internal-Key` header on internal refund
calls; Core verifies it (constant-time) on the **refund route group only** and fails
closed. It is **distinct** from `INTERNAL_API_KEY` (Admin API → Gateway) — the two
trust boundaries never share a secret.

- Header: `X-Internal-Key`
- Gateway env: `CORE_INTERNAL_KEY` (read in `config.go`, used by `CoreApiClient`)
- Core env: `CORE_INTERNAL_KEY` (read in `main.rs`, checked by `internal_service_auth`)
- Sandbox key MUST differ from any Production key.
- Never in committed compose/`.env`/migrations/tests/fixtures/source, deploy output,
  container inspection, screenshots, evidence, request logs or traces.

## Fail-closed semantics
- Core key unset → `503 UNAVAILABLE` (boundary disabled; never fail open).
- Missing/invalid header → `401 UNAUTHORIZED`, rejected **before** any source/refund/
  merchant/ledger/DB lookup.
- Valid key → request proceeds to merchant-scoped logic.

Because Core fails closed, provision the secret to **both** Core and Gateway before
enabling the Core middleware (see the deployment sequence in the D0 package).

## Required rotation path before Production (no downtime)
A single active key is acceptable for Sandbox. Before Production, rotate as:

1. Generate a new high-entropy key (`NEW`).
2. **Overlap:** teach Core to accept **either** the current (`OLD`) or `NEW` key
   (accept-list), deployed first, so no request is rejected mid-rotation.
3. Update the Gateway to send `NEW`, in a controlled order (Gateway after Core
   accepts both).
4. Verify Gateway→Core refund calls succeed on `NEW`.
5. **Revoke** `OLD`: remove it from Core's accept-list and redeploy.
6. Confirm calls still succeed on `NEW` only.

Do **not** build a speculative rotation system now — this single-key + documented
overlap procedure is sufficient until a repository-wide secret-rotation pattern
exists. The accept-list (step 2) is the only code addition rotation would require;
it is intentionally deferred until Production is scheduled.
