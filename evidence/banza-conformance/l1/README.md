# BANZA Conformance — Level 1 (gap analysis stage)

**Version:** 1.0
**Status:** Gap analysis only. **No L1 evidence. L1 is not validated. Banzami is not certified.**

---

This directory holds the **BANZA L1 (Core Payment Capability)** work for the Banzami
operator. At this stage it contains **only a gap analysis** — there is **no L1 conformance
report**, and no L1 capability is claimed or validated.

| Field | Value |
|-------|-------|
| Stage | Gap analysis + L1 implementation work in progress |
| Document | [`gap-analysis.md`](gap-analysis.md) |
| Official sandbox L1 report | **not generated** (no L1 run against the public sandbox) |
| Local pre-validation dry-run | passes **15/15** against the simulated surface on `localhost` (see below) |
| L1 status in the matrix | `PLANNED` (roadmap — `BANZA-L1-GAP-001` / `BANZA-L1-EVIDENCE-001`) — **not validated** |
| Certification | none — evidence, not certification |

## L1 conformance-shaped sandbox surface (implementation work)

The Go sandbox operator (`services/sandbox-operator/`) now carries an **additive,
simulated, in-memory** L1 surface shaped to the `banza-conformance --level 1`
contract — `POST/GET /wallets`, `POST /wallets/:id/seed`, `POST/GET /transfers`,
`GET /traces/:id`, `GET /events/history` (`cmd/sandbox-operator/l1.go`). It is:

- **gated behind `SANDBOX_L1_ENABLED` (default OFF)** — the public L0 sandbox
  behaviour (`/health` + manifest) is unchanged unless explicitly enabled;
- **simulated and in-memory** — no database, no ledger, no real funds; it does
  **not** touch or expose the production `/internal/v1` Rust core API;
- **L1 implementation work / pre-validation only** — it does **not** mean L1 is
  validated, and Banzami is **not** certified.

### Run the local dry-run (localhost only)

```bash
# build + start the operator with the L1 surface enabled, on a local port
SANDBOX_L1_ENABLED=true SANDBOX_OPERATOR_PORT=8099 \
  go run ./services/sandbox-operator/cmd/sandbox-operator &

# run the official L1 suites against localhost (never the public sandbox)
banza-conformance --url http://localhost:8099 --level 1
```

A local run currently passes **15/15** (health 2 · manifest 3 · wallets 4 ·
transfers 4 · traces 2). This is **pre-validation evidence on localhost against a
simulated surface — not an L1 validation, not certification, and not run against
the public sandbox.** The Go tests in `cmd/sandbox-operator/l1_test.go` assert the
same behaviours and run in CI-style `go test`.

## What L1 means

L1 is the **Core Payment Capability** level of the BANZA conformance suite: wallets,
internal wallet-to-wallet transfers, idempotency, balanced double-entry ledger, and
financial traceability — exercised in **sandbox/simulated** mode. L1 does **not** require
external providers (KYC/KYB, money-in/out rails, BNA); those gate launch and L2-operational,
not L1 sandbox conformance.

## Current state (summary)

Banzami's Rust core already implements the underlying primitives (wallets, atomic
transfers, gold-standard double-entry ledger, idempotency, 422 on insufficient funds). The
gaps to an L1 PASS are **shape and surface**, not core correctness:

- the public sandbox (`sandbox.banzami.org`) is **L0-only by design** (no wallet/transfer routes);
- the core API uses `/internal/v1/` paths and different field names than the runner expects;
- transfer responses do not yet expose a `trace_id`, and there is no `/traces/:id` or `/events` surface.

See [`gap-analysis.md`](gap-analysis.md) §4–§6 for the full requirement matrix, the expected
failures today, and the implementation work required.

## Generating L1 evidence (later)

An L1 report must **not** be generated until the conformance-shaped sandbox surface exists
and the `wallets + transfers + traces` suites pass locally:

```bash
# ONLY after the L1 sandbox surface is implemented and passing locally:
banza-conformance --url <local-sandbox-url> --level 1 \
  --output evidence/banza-conformance/l1/banzami-sandbox-l1-report.json
```

Running `--level 1` against the public sandbox today would only re-confirm the known
L0-only state.
