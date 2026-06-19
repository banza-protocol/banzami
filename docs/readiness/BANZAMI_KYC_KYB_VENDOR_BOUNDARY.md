# Banzami — KYC/KYB Vendor-Agnostic vs Vendor-Specific Boundary

**Version:** 1.0
**Date:** 2026-06-19
**Related:** [VENDOR_RFP_SCORECARD](BANZAMI_KYC_KYB_VENDOR_RFP_SCORECARD.md) · [LAUNCH_BLOCKERS_DOSSIER](BANZAMI_LAUNCH_BLOCKERS_DOSSIER.md)

> No KYC/KYB vendor is selected and none is integrated. The simulated provider is
> **development-only**. KYC-001 / KYC-002 / KYB-001 remain **not VALIDATED** and
> externally blocked. This note fixes the boundary so vendor-agnostic prep does not
> drift into premature vendor-specific work.

## Vendor-agnostic (safe to build before a vendor is chosen)

These are provider-neutral and carry no rework risk from the vendor decision:

- The `KycProvider` trait seam (`verify_customer` / `verify_merchant`) and the
  `KycProviderKind` selection (`KYC_PROVIDER`, default `SIMULATED`).
- Internal data shapes that are facts about the customer/business, not vendor
  outputs: ID document **types** (B.I., Passport, Carta de Condução), KYC **levels**
  and gating, KYB business facts (e.g. NIF), compliance **status** model.
- **Audit logging** of KYC/KYB decisions (approve / reject / suspend / AML / consumer
  KYC) to the immutable audit log.
- **Contract tests** that lock the trait behaviour a real adapter must satisfy.
- The RFP / scorecard / questionnaire used to select a vendor.

## Vendor-specific (MUST remain deferred until a vendor is selected)

These depend on the chosen vendor's API and must **not** be built speculatively:

- **API endpoints** — base URL, authentication, request/response payloads.
- **OCR / liveness mapping** — how the vendor's extraction and liveness signals map
  to our outcome.
- **Document-authenticity scoring** — vendor-specific authenticity/forgery signals.
- **Webhook / callback signature scheme** — HMAC scheme, headers, idempotency keys.
- **Error codes** — the vendor's taxonomy → our error model.
- **Production integration tests** — real-money/identity tests against the live vendor.
- **Vendor-specific document support** — which documents the chosen vendor actually
  verifies (e.g. Carta support is *not* guaranteed).
- **BNA / regulatory evidence** — certification and compliance proof tied to the
  selected provider and rail.

## Rule of thumb

> Build the **shape** (types, levels, status, audit, contract) now. Defer the
> **wire** (vendor API, OCR/liveness, authenticity, webhook signatures, error
> mapping, production tests) until a vendor is selected. Carta de Condução is an
> accepted internal document type only — vendor support is unverified and must not
> be claimed. The simulated provider is never production.
