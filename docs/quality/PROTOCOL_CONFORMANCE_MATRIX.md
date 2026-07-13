# BANZA Protocol Conformance Matrix — Banzami Operator

Programme: BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 · audited 2026-07-04
Protocol baseline: BANZA v1.0 (canonical ADR-001–ADR-036; 28 accepted, ADR-018 draft).
Capability status lives ONLY in [`quality/operator-assurance-manifest.yaml`](../../quality/operator-assurance-manifest.yaml);
this matrix records protocol-rule classification and evidence.

Classifications: `compliant` · `operator-extension` (documented, not
protocol-normative) · `internal-not-public` · `deprecated-legacy` ·
`NON-COMPLIANT` · `governance-pending` (needs ADR/RFC decision — never
silently patched).

| # | Protocol rule | Classification | Evidence |
|---|---|---|---|
| 1 | Typed sources ACQUIRING_PAYMENT / WALLET_PAYMENT (ADR-030) | compliant | sdk/typescript/src/types.ts:364; core/api/src/routes/refund_source.rs |
| 2 | Refund input = typed source, never bare transaction_id | compliant | core/api/src/routes/refunds.rs:111-119; sdk/typescript tests assert no transaction_id |
| 3 | Internal legacy `TRANSACTION` token boundary (never public) | compliant | stored internally (refunds.source_type), mapped to ACQUIRING_PAYMENT at response layer (refunds.rs:158-162); guard test added by this programme |
| 4 | banza-signature webhook signing (t=,v1=, HMAC-SHA256, 300s window, constant-time) | compliant | services/api-gateway/internal/webhook/signer.go; SDK verifiers use timingSafeEqual / hmac.Equal (HTTP header case-insensitive per RFC 7230) |
| 5 | Idempotency INV-IDEM-001 (same key → same result) | compliant (stronger than spec) | gateway Redis middleware 24h TTL (services/api-gateway/internal/middleware/idempotency.go) + indefinite DB UNIQUE at ledger/refund layer (0098) — indefinite replay is stricter, never weaker |
| 6 | Ledger invariants: zero-sum, append-only, atomic | compliant | PostingBuilder + repository re-validation; DB triggers 0033 (ledger) and 0099 (audit_log, added by this programme) |
| 7 | Proof states: partial restitution stays CONFIRMED; full → REVERSED (ADR-034/040) | compliant | core/api/src/routes/refunds.rs:237-241; proof status forward-only (gateway proof.go) |
| 8 | Refund/dispute cumulative ceiling per typed source | compliant | pg_advisory_xact_lock + shared restitution_allocations (0096); over-refund REJECTED 422 (refunds.rs:270-277). Protocol is silent on over-refund handling → operator rejects (documented; see governance list) |
| 9 | Payment sessions ADR-043 (one intent, N interfaces, one ledger result) | compliant (staging rollout) | core/api/src/routes/payment_sessions.rs; payment_session.paid emitted (services/public-api handler/payment_links.go); deployed on staging stack, pending main-stack deploy |
| 10 | Payment links + payment_link.paid | compliant | canonical event registry includes payment_link.paid; refund_source field is an operator extension (see 12) |
| 11 | QR payload format: BANZA-SBX:/BANZA: prefix (INV-QR-ENV-001) | **governance-pending (L2 gap)** | core/qr/src/engine.rs emits base64url JSON + banzami:// deep links without BANZA-SBX: prefix. Contract is unambiguous; adopting the prefix breaks printed QR compatibility. Decision needed before L2 conformance claim; Banzami claims only L0 today (sandbox-operator manifest certification_level=0), so no false claim exists. Owner: BANZA governance + product |
| 12 | refund_source on paid events / LINK GET (ADR-018 DRAFT) | operator-extension | labeled "Banzami operator extension" in SDK (types.ts:619) and payment_links.rs:49; ADR-018 pending governance — never presented as BANZA-standard |
| 13 | Wallet accounts / destination_account_ref (ADR-042) | compliant | payment_links.rs:27; core/api/src/routes/qr.rs:43 |
| 14 | Receipts/proofs (ADR-040) + /r/{ref} allow-list (ADR-033) | compliant | proof.go: secureReference, canonical hash, signature, Public() allow-list omits internal ids |
| 15 | Developer auth + API key lifecycle (bz_test_/bz_live_) | compliant | core/merchants/src/api_key.rs; SHA256-hashed storage; env binding at issuance |
| 16 | Event registry alignment | operator-extension (documented) | operator-local events (transaction.completed/failed, payout.*) are operator-scoped extensions permitted by the envelope contract; payment_session.* and payment_link.paid are registry-canonical. Docs must not present operator-local events as protocol-standard |
| 17 | Collections ADR-036 | internal-not-public | crate + migrations frozen in db/migrations.phase2; /v1/splits legacy returns 410 at edge (deprecated-legacy, justified) |
| 18 | Federation / L3+ | compliant (no claim) | no federation claims anywhere; sandbox operator manifest: certification_level 0, simulated=true |

## Governance items (require BANZA ADR/RFC decision — not silently patched)

1. **QR prefix adoption** (rule 11): adopt BANZA-SBX:/BANZA: prefixes in the
   operator QR engine (breaking printed QRs) vs. propose a protocol amendment
   recognising operator-native deep-link QR as an L2-acceptable surface.
   Owner: BANZA governance + Banzami product. Safe fallback: remain L0/L1,
   never claim L2 QR conformance.
2. **ADR-018 refund_source**: adopt as protocol-normative vs. permanent
   operator extension. Already correctly labeled everywhere as an extension.
3. **Over-refund semantics**: protocol is silent; operator rejects (422).
   Proposed for protocol clarification (candidate RFC).
4. **TRANSACTION token retirement** (ADR-018 §8): governance to decide
   whether ACQUIRING_PAYMENT becomes the sole normative name.

## Terminology audit result

- No `TRANSACTION` source-type token in public APIs, SDK types, docs, webhooks,
  or DOA surfaces (verified by grep + SDK contract guard
  `tools/check-sdk-refund-contract.mjs`, which runs in CI for both Banzami and
  DOA vendored copies).
- No `transaction_id` refund input in any public surface.
- `banza-signature` canonical everywhere (case-insensitive read).
- No unsupported event documented for DOA (payment_link.paid, payment_session.paid,
  application_settlement.* all verified emitted).
