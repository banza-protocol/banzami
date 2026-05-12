# docs

All non-code documentation for Banzami.

## Contents

- `architecture/` — System-wide architecture documents and diagrams.
- `adr/` — Architecture Decision Records. One file per decision: `ADR-NNN-short-title.md`.
- `security/` — Security architecture, threat models, control mappings.
- `compliance/` — Regulatory documentation (BNA, AML, data protection, audit obligations).
- `runbooks/` — Operational procedures for routine tasks.
- `playbooks/` — Step-by-step responses to known scenarios.
- `incident-management/` — Incident response procedures and post-mortems.
- `api/` — Public and internal API references, schemas, examples, error catalogs.
- `domains/` — One subdirectory per business domain (`ledger/`, `wallets/`, `payouts/`, …).

## Standards

See CLAUDE.md §5 for full documentation requirements.

- Every domain in [`core/`](../core/) must have a corresponding `domains/<name>/` directory covering business purpose, architecture, flows, invariants, failure scenarios, reconciliation logic, and security assumptions.
- Every major technical decision must produce an ADR with context, decision, rationale, alternatives considered, consequences, and tradeoffs.
- READMEs must remain synchronized with implementation. **Outdated documentation is a defect.**

## ADR Workflow

1. Open a new file `docs/adr/ADR-NNN-short-title.md` (NNN = next sequential number, zero-padded).
2. Include sections: Context · Decision · Rationale · Alternatives Considered · Consequences · Tradeoffs.
3. Link the ADR from any README or domain doc affected by the decision.
4. ADRs are immutable once accepted. Supersede with a new ADR rather than editing.
