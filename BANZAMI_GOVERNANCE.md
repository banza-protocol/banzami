# Banzami Governance

## Overview

Banzami is the reference operator implementation of the BANZA open financial infrastructure protocol. This governance document covers the Banzami operator implementation — not the BANZA protocol itself.

**Protocol governance** (RFCs, ADRs, certification framework, federation) is handled in [github.com/banza-protocol/banza](https://github.com/banza-protocol/banza). No protocol rule changes happen in this repository.

Banzami is governed by the Banzami engineering team as the reference operator. Engineering decisions are guided by the BANZA protocol constraints, the reference operator identity established in ADR-024, and the ecosystem model defined in ADR-025.

---

## Decision Types

### Protocol-affecting decisions (defer to ~/banza)

Any change that would require modifying the BANZA protocol specification must go through the protocol ADR process, not through this repository:

- Changes to financial invariants (INV-LEDGER-*, INV-STL-*, INV-WALLET-*)
- Changes to the @banza handle format rules
- Changes to QR payload specifications
- Changes to SDK contract surfaces
- Changes to certification level requirements

**Process:** Open an ADR in `github.com/banza-protocol/banza`.

### Operator product decisions (this repository)

Decisions that are specific to how Banzami implements the protocol as an operator product:

- UI/UX decisions for merchant dashboard, consumer app, admin portal
- Fee structures and commercial policies
- Integration choices (EMIS, Multicaixa, bank partners)
- Deployment infrastructure choices
- Operational policies (KYC tiers, payout schedules, dispute resolution)
- API versioning decisions (within protocol bounds)

**Process:** Standard engineering review. For major operator decisions (new products, significant API changes), open an issue for discussion before implementation.

---

## API Versioning

Banzami's public APIs follow semantic versioning within the bounds set by the BANZA protocol:

| Change type | Version bump | Required |
|---|---|---|
| New endpoint, backwards compatible | Minor (`v1.Y`) | No additional process |
| Bug fix, no API shape change | Patch | No additional process |
| Breaking API change | Major (`vX`) | ADR required + 90-day deprecation |

Breaking changes require:
1. An ADR (or RFC in ~/banza if protocol-level)
2. A deprecation notice in the previous version
3. A migration guide
4. A minimum 90-day deprecation period

---

## Deployment Governance

Production deployments are governed by `deploy.sh` at the repository root. All changes to production infrastructure require:

1. A tested deployment to staging first
2. Review by at least one additional engineer
3. Deployment during a defined maintenance window for breaking changes

No changes are deployed to production without first being committed to `origin/main`. Changes are not done until in production.

---

## Engineering Standards

The engineering constitution for this repository is defined in [CLAUDE.md](CLAUDE.md). Key principles:

- Financial correctness is not negotiable
- Every monetary movement goes through double-entry accounting
- Every financial operation is idempotent
- No protocol rules are redefined locally — they are consumed from `~/banza`

---

## Ecosystem Relationship

Banzami is one implementation of the BANZA protocol:

```
BANZA (open protocol)
└── Banzami (reference operator)  ← this repository
```

If the Banzami operator ceased operations, the BANZA protocol would continue. Other operators could implement the same protocol. This is a deliberate architectural property of the ecosystem.

---

## Contact

- Engineering decisions: open a GitHub issue or PR
- Security vulnerabilities: **security@banzami.com** (do NOT open a public issue)
- Protocol questions: open a discussion in `github.com/banza-protocol/banza`
- Code of conduct: conduct@banzami.com
