# 16 — External dependency matrix

Version: 1.0
Purpose: **separate a product defect from a dependency that does not exist.**

---

## 1. Matrix

| Dependency | Used by | Sandbox state | Classification | If unavailable |
|---|---|---|---|---|
| **Bank / EMIS / Multicaixa rail** | Cash-In, Cash-Out, acquiring | not connected; simulated | `EXTERNAL_DEPENDENCY` | rail-dependent ops fail closed (ADR-061) |
| **Resend** (email) | Console OTP, operator email, Business activation | connected, quota-bound | `EXTERNAL_DEPENDENCY` | Console sign-in blocked → preflight `UNHEALTHY` |
| **npm registry** | `@banzami/sdk` acceptance | reachable | `EXTERNAL_DEPENDENCY` | S12 TypeScript blocked |
| **pub.dev** | `banzami_client` acceptance | reachable | `EXTERNAL_DEPENDENCY` | S12 Dart blocked |
| **Packagist / PyPI / pkg.go.dev** | PHP, Python, Go acceptance | **not published** | `NOT_IMPLEMENTED` | — |
| **Cloudflare (DNS/CDN/TLS)** | every public host | active | infrastructure | everything blocked |
| **Cloudflare R2** | KYB storage, proposed evidence store | active | `EXTERNAL_DEPENDENCY` | KYB + evidence blocked |
| **Firebase / FCM** | push topics | configured | `EXTERNAL_DEPENDENCY` | push journeys blocked |
| **DOA (Supabase)** | S14 | live | `EXTERNAL_DEPENDENCY` | S14 blocked, Banzami unaffected |
| **GitHub Actions + OIDC** | SDK publication | available; **trusted publishing not configured** | owner ceremony | Repair Run cannot ship an SDK |
| **SMS gateway** | consumer phone onboarding | **does not exist** | `NOT_IMPLEMENTED` | — |

## 2. Cash-In and Cash-Out — a more precise answer than the prompt assumed

The prompt expected both to be
`EXTERNAL_DEPENDENCY_NOT_AVAILABLE`. The audit shows they are **not
symmetrical**, and recording them identically would misstate the platform.

### Cash-Out — implemented at the operator boundary, blocked at the rail

- full payout lifecycle exists: `POST /v1/payouts`, and admin
  `process` / `sent` / `confirm` / `returned` / `fail`;
- pricing is real: 0.75 % wallet-withdrawal fee, two paired ledger postings;
- `CAP-PAYOUT-001` is `verified` with a Sandbox E2E
  (`tests/phase0/payout-sandbox-e2e.sh`);
- ADR-061 names payout submission/confirmation as rail-crossing.

**Classification: `EXTERNAL_DEPENDENCY` at the rail boundary;
`PASS` at the operator boundary.** Both are reported. A single
`EXTERNAL_DEPENDENCY` would hide a fully working, fee-bearing capability.

### Cash-In — no external surface at all

- **no public deposit route exists** on any of the 361 external routes;
- the *internal* machinery does exist: `consumer_deposits`,
  `core/consumer-wallets/src/funding.rs`, and boundary reconciliation already
  classifies `CASH_IN` (ADR-063);
- what a Sandbox actually uses is `POST /v1/sandbox/fund` — synthetic funding.

**Classification: `NOT_IMPLEMENTED` at the external boundary, with an absence
proof** (no route mounted), and a note that the ledger and reconciliation
substrate is present.

### Sandbox funding is not Cash-In

This distinction must appear in the registry, the catalog and every report.

| | Sandbox funding | Cash-In |
|---|---|---|
| What | synthetic value issued by a balanced posting from transit | real money entering from an external rail |
| Route | `POST /v1/sandbox/fund` (Sandbox only) | none |
| Reversible | yes — exact reverse posting | no |
| Classification | test support mechanism | external product capability |

Calling the first the second would let a green Sandbox report imply Angola can
put money into a Banzami wallet. It cannot.

## 3. ⚠ The binding constraint: `BANZAMI_PILOT_LIMITS=1`

This is the finding that shapes the whole programme. It is filed as **VL-001**
in [19](19-gap-contradiction-report.md); the mechanism is here.

The pilot-limit overlay (ADR-048) is **enabled** on every Sandbox service.
It is operator-local policy — Sandbox-only, config-gated, never Live — so
changing it needs no BANZA ADR.

| Limit | Value | Scope | Reversible |
|---|---:|---|---|
| Consumer per payment | Kz 25 000 | per payment | n/a |
| Consumer daily | Kz 50 000 | rolling day | yes |
| Consumer max balance | Kz 50 000 | balance | yes (retire) |
| Merchant per receive | Kz 25 000 | per payment | n/a |
| Merchant daily receive | Kz 100 000 | rolling day | yes |
| Merchant max balance | Kz 100 000 | balance | yes (retire) |
| **Aggregate funds in circulation** | Kz 500 000 | **whole Sandbox** | **yes** |
| **Aggregate transaction volume** | **Kz 2 000 000** | **whole Sandbox** | ❌ **NO** |

### Why the last row is different

```sql
-- aggregate_funds_minor: a SIGNED sum — retirement reduces it
SELECT SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END)
  FROM ledger_entries
 WHERE account_id IN (SELECT available_account_id FROM wallets
                      UNION SELECT available_account_id FROM consumer_wallets);

-- aggregate_volume_minor: CREDITS ONLY — monotonic, and nothing reduces it
SELECT SUM(amount_minor) FROM ledger_entries
 WHERE entry_type='CREDIT'
   AND account_id IN (SELECT available_account_id FROM wallets);
```

Retirement posts `DR owner / CR transit`. The debit is on the owner account, so
it **does not reduce a credits-only sum**. `aggregate_volume_minor` can only
ever increase, for the lifetime of the database.

### Measured, 2026-09-18

```
aggregate_volume_minor   92 988 840 / 200 000 000   =  46.5 %   IRREVERSIBLE
aggregate_funds_minor     6 532 600 /  50 000 000   =  13.1 %   reversible
```

Daily burn, merchant credits:

```
2026-09-14   31 165 620   (509 entries)   ← 15.6 % of the LIFETIME cap in one day
2026-09-11   16 460 000   (229)
2026-09-08   10 750 000   (133)
2026-09-16    8 170 000   (25)
2026-09-09    7 250 000   (88)
```

Headroom: **Kz 1 070 111**. At the 2026-09-14 rate that is **~3.4 heavy harness
days**.

### What happens at 100 %

`PILOT_LIMIT_AGGREGATE_VOLUME_EXCEEDED` on **every merchant payment in the
Sandbox, permanently** — for real self-service developers (ADR-060), for DOA,
and for the Validation Studio alike. There is no reset that preserves history.

### Why this is incompatible with the programme as specified

A Full Sandbox Validation Run exercises every payment capability, with multiple
actors, negative paths and repeats. Golden Runs are meant to be **repeatable**.
Each run spends budget that cannot be recovered. The design as written would
consume the Sandbox it is meant to certify.

**This blocks Phase B.** Options are put to the owner in
[21](21-owner-decisions.md) D1.

## 4. Other quotas

| Quota | Value | Mitigation |
|---|---|---|
| `application-submit` | 30 / 24h / IP | persistent Businesses; onboarding journeys use one slot |
| `beta-register` | 20 / 24h / IP | one journey |
| `FIXTURE_EMAIL_DAILY_BUDGET` | 40 / day | persistent Developers; fixture-session minting for the rest |
| Credential endpoints | 15 / min / IP | serialize; negatives are budgeted |
| Anonymous | 60 / min / IP | throttle public-surface crawls |
| Authenticated | 1000 / min / merchant | not binding |
| Realtime | 120 / min / IP | not binding |
| Resend account | provider-side | has been exhausted before; preflight reads it |

All appear on the Health page and in `budgets_at_start` / `budgets_at_end`.

## 5. Reporting rule

An `EXTERNAL_DEPENDENCY` verdict must always carry: the dependency name, the
boundary it sits at, its observed state, and what *is* proven on the operator
side of that boundary. "Cash-Out is not PASS" is not an answer; "Cash-Out's
operator lifecycle passes and its rail is not connected" is.
