# ADR-018: Provider-Agnostic Money In / Money Out

**Status:** Accepted  
**Date:** 2026-06-18  
**Authors:** Banzami Engineering  
**Supersedes:** —  
**Related:** [ADR-017](ADR-017-wallet-domain-architecture.md) · [ADR-002](ADR-002-double-entry-ledger.md)

---

## Context

Money In (real Kwanza entering a Banzami wallet) and Money Out (money leaving a
wallet to a bank account or external rail) require integration with external
payment infrastructure. The first rail Banzami targets is EMIS / Multicaixa
Express, the Angolan interbank network.

The risk is conflating the **capability** ("real money can enter / leave the
system") with a **specific implementation** ("EMIS is integrated"). Earlier
validation modelling and documentation described Money In / Money Out as if EMIS
were the sole structural dependency — e.g. items titled "Integração EMIS" living
directly under the Money In / Money Out pillars, and glossary text stating that
acquiring *is* EMIS. This is both technically inaccurate and strategically
limiting: it makes Banzami look blocked exclusively by EMIS, when in reality it
is blocked by the absence of *any* operational funding / withdrawal provider.

Banzami is an operator on the open BANZA protocol. Which rail an operator uses
for funding, withdrawal, and settlement is **operator policy**, not a protocol
rule — see `~/banza/docs/governance/BANZA-PROTOCOL-VS-OPERATOR-POLICY.md`. The
protocol defines the ledger invariants and contracts; the operator chooses its
rails. This ADR therefore lives in the operator repo and needs no protocol ADR.

The code already reflects the right shape: `core/acquiring` defines an
`AcquirerProvider` trait (`provider_name`, `initiate`, `validate_callback`),
with EMIS as one implementation and a `SimulatedProvider` for sandbox. The
provider is selected at runtime via `ACQUIRING_PROVIDER` (unset ⇒ simulated,
`EMIS` ⇒ EMIS). The conceptual error was in the *modelling and documentation*,
not the core abstraction.

---

## Decision

**Money In, Money Out, and Settlement/Reconciliation are modelled as
provider-agnostic capabilities. EMIS and partner banks are possible provider
implementations of those capabilities — never the capability itself.**

1. **Capabilities** (what must be true to operate):
   - **Money In** — real Kwanza can enter a wallet through *at least one*
     approved funding provider/rail.
   - **Money Out** — money can leave a wallet to a bank account / external rail
     through *at least one* approved withdrawal provider.
   - **Settlement & Reconciliation** — the ledger reconciles against whichever
     external rail is used, with full traceability.

2. **Provider implementations** (one possible way to satisfy a capability):
   - EMIS / Multicaixa Express
   - partner banks (direct bank transfer, settlement accounts)
   - other licensed/integrated providers, present or future

3. **No rail is hard-coded as the single source of truth.** Money In / Money Out
   depend on the `AcquirerProvider` abstraction, not on EMIS directly.

4. **Blockers are stated against the capability, not a single vendor.** Generic
   blockers express the real launch dependency:
   - `FUNDING_PROVIDER_REQUIRED` — no production Money In provider configured
   - `WITHDRAWAL_PROVIDER_REQUIRED` — no production Money Out provider configured
   - `SETTLEMENT_RAIL_REQUIRED` — no production settlement rail configured
   - `RECONCILIATION_REQUIRED` — no validated reconciliation flow
   EMIS-specific blockers apply *only* when EMIS is the chosen rail.

5. **Status semantics** for each capability/provider item:
   - `BLOCKED` — no real provider operational in production
   - `IN_PROGRESS` — a technical seam, sandbox, mock, or partial integration exists
   - `READY`/`VALIDATED` — at least one real provider validated for production

---

## Consequences

**Positive**
- The validation studio truthfully shows Banzami as blocked by *the absence of
  an operational provider*, not by EMIS specifically.
- Strategy stays open: a partner bank can unblock Money In / Money Out without
  EMIS.
- Modelling matches the code, which is already provider-agnostic.

**Negative / trade-offs**
- Slightly more matrix items (capability + provider-impl rows) than a single
  "EMIS" row.
- Requires discipline to keep new rails as provider implementations rather than
  letting one vendor's name leak back into capability titles.

**Neutral**
- No code change is required for the abstraction itself — `AcquirerProvider`
  already exists. This ADR primarily corrects modelling and documentation and
  records the architectural intent for future rails.
