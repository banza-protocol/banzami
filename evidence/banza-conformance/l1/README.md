# BANZA Conformance — Level 1 (gap analysis stage)

**Version:** 1.0
**Status:** Gap analysis only. **No L1 evidence. L1 is not validated. Banzami is not certified.**

---

This directory holds the **BANZA L1 (Core Payment Capability)** work for the Banzami
operator. At this stage it contains **only a gap analysis** — there is **no L1 conformance
report**, and no L1 capability is claimed or validated.

| Field | Value |
|-------|-------|
| Stage | Gap analysis (planning) |
| Document | [`gap-analysis.md`](gap-analysis.md) |
| L1 conformance report | **not generated** |
| L1 status in the matrix | `PLANNED` (roadmap — `BANZA-L1-GAP-001` / `BANZA-L1-EVIDENCE-001`) |
| Certification | none — evidence, not certification |

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
