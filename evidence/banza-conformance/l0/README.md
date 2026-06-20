# BANZA Conformance — Level 0 evidence (operator candidate)

**Version:** 1.0
**Scope:** Operator-side conformance evidence. Not a certificate.

---

This directory holds the **BANZA conformance evidence** produced by running the
official BANZA conformance suite against the Banzami **sandbox** operator. Banzami
runs the suite as an **operator candidate** — to demonstrate that the sandbox is
reference-compatible at Level 0. The result is **evidence, not certification.**

| Field | Value |
|-------|-------|
| Target | `https://sandbox.banzami.org` (Banzami sandbox operator) |
| Tool | `banza-conformance` `0.1.0` (PyPI) — equivalently `ghcr.io/banza-protocol/banza-conformance:v0.1.0` |
| Requested level | 0 — Protocol Sandbox |
| Level achieved | **0 — Reference-compatible** |
| Result | **5 passed · 0 failed · 0 skipped** |
| Report | [`banzami-sandbox-l0-report.json`](banzami-sandbox-l0-report.json) |
| Statement (from the tool) | *"This report is conformance evidence, not a production certificate."* |

## What this is — and is not

This is **dry-run conformance evidence**: a record that the Banzami sandbox
responds correctly to the Level 0 (sandbox-basics) suite — health and operator
manifest, both declaring `simulated=true` and `production_allowed=false`.

It is **NOT**, and must never be represented as:

- a BANZA certificate (no `certificate.json` is issued or served — the sandbox
  correctly returns 404 for `/.well-known/banza/certificate.json`),
- a claim that **Banzami is a certified operator** — it is not,
- a claim of **production readiness** or **production federation** — the target is
  a simulated sandbox with `production_allowed=false`,
- entry into any BANZA operator registry.

**The BANZA protocol owns the certification framework** (levels, rules, expiry,
provenance). A real certification claim requires recorded provenance (suite
commit, environment, signed/recorded evidence) per `BANZA_CERTIFICATION.md` in the
[BANZA protocol repository](https://github.com/banza-protocol/banza) — Banzami
neither defines nor operates that process. Production certification is gated on
later operator milestones (M2/M3: real rails, KYC/KYB, production keys), none of
which are complete.

## How this evidence was generated

```bash
# PyPI tool (used to produce the committed report)
pip install banza-conformance==0.1.0
banza-conformance \
  --url https://sandbox.banzami.org \
  --level 0 \
  --output evidence/banza-conformance/l0/banzami-sandbox-l0-report.json

# Equivalent, pinned Docker image (cross-checked — same 5/5 result)
docker run --rm -v "$PWD/evidence/banza-conformance/l0:/reports" \
  ghcr.io/banza-protocol/banza-conformance:v0.1.0 \
  --url https://sandbox.banzami.org --level 0 \
  --output /reports/banzami-sandbox-l0-report.json
```

Both the PyPI `0.1.0` and the GHCR `v0.1.0` images were run against the same
sandbox and produced identical results (5 passed / 0 failed). Only the PyPI report
is committed here to avoid a duplicate artifact; the Docker path is documented for
independent reproduction.

Convenience wrapper: [`tools/banza-conformance-l0.sh`](../../../tools/banza-conformance-l0.sh)
or `make banza-conformance-l0`.

## Reproducing

The report is reproducible at any time against the live sandbox. Re-running
regenerates `banzami-sandbox-l0-report.json` with a fresh `report_id` and
`generated_at`; the suite result (5/5 at Level 0) is stable as long as the sandbox
keeps declaring a simulated, non-production Level 0 manifest.

See the operator conformance roadmap (L0 → L4) in the root
[`README.md`](../../../README.md#banza-conformance-status).
