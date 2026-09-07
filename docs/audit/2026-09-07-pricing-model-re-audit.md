# Pricing model re-audit

**Date:** 2026-09-07
**Against:** the owner's confirmed economic model — generic Transfer is neutral;
an incoming payment/donation credits the wallet **gross**; operator fees apply
to explicit fee-bearing operations (settlement, payout); refund creates no new
fee.
**Method:** deployed Sandbox schema and rows, plus source. Nothing from memory.
**Nothing was changed.** No migration, no rename, no rate touched.

**Verdict: NEEDS MODIFICATION.** One P0, three P1. The model is not unsafe
today, but it cannot express the economic model it is now being asked to carry.

---

## The headline

**The pricing engine cannot tell a settlement from a capture.**

`transaction_type` is the only operation discriminator in the schema, and only
the payout path sets it:

| caller | `PricingContext.transaction_type` | source |
| --- | --- | --- |
| capture | `None` | `core/transactions/src/engine.rs:230` |
| application settlement | `None` | `core/app-settlement/src/engine.rs` |
| payout | `Some("wallet_withdrawal")` | `core/payouts/src/engine.rs:116` |

So a rule pinned to a `transaction_type` can never match capture or settlement,
and a rule that matches settlement necessarily also matches capture. **There is
no way to write a settlement-only rate.**

Under the confirmed model, payment is *not* fee-bearing and settlement *is* —
and the schema cannot draw that line. Today `sandbox-donation-200` prices both
at 200 bps, and the only reason a donation is not charged is that the production
payment rail uses transfers and never reaches capture at all. The correct
behaviour is currently an accident of routing rather than a property of policy.

**P0 — the model cannot express operation-scoped pricing.**

---

## 1. Current schema (deployed)

### `pricing_profiles`

| column | type | notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `code` | text | UNIQUE with `environment` |
| `name`, `description` | text | descriptive |
| `enabled` | bool | default true |
| `environment` | text | CHECK LIVE\|SANDBOX, default **LIVE** |
| `created_at`, `updated_at` | timestamptz | |

There is **no version** and **no status lifecycle** beyond `enabled`.

### `pricing_rules`

| column | type | role |
| --- | --- | --- |
| `id` | uuid | PK |
| `rule_key`, `version` | text, int | UNIQUE with `environment` |
| `environment` | text | CHECK LIVE\|SANDBOX, default **LIVE** |
| `enabled` | bool | |
| `business_category` | text NULL | **selector** |
| `pricing_profile` | text NULL | **selector** — a bare code, *no FK* |
| `fee_policy_ref` | text NULL | **selector** |
| `currency` | text NULL | **selector** |
| `country` | text NULL | **selector** |
| `transaction_type` | text NULL | **selector** — the only operation discriminator |
| `rate_bps` | int | CHECK ≥ 0 |
| `flat_minor` | bigint | CHECK ≥ 0 |
| `min_fee_minor`, `max_fee_minor` | bigint NULL | CHECK ≥ 0, min ≤ max |
| `rounding` | text | CHECK HALF_UP\|HALF_EVEN\|FLOOR\|CEIL |
| `priority` | int | tiebreak |
| `effective_from`, `effective_to` | timestamptz | CHECK to > from |

**Constraints that do NOT exist:**
- no FK from `pricing_rules.pricing_profile` to `pricing_profiles.code`
- **nothing prevents two rules matching the same context** — `UNIQUE(environment, rule_key, version)` only stops duplicate versions of one key
- nothing requires a currency when `flat_minor > 0`

### Assignment

`merchants.pricing_profile_id → pricing_profiles.id` (migration 0107), with a
trigger refusing a profile whose environment differs from the deployment.

---

## 2. Current deployed data

**Profiles**

| code | env | enabled | assigned |
| --- | --- | --- | --- |
| `sandbox-default` | SANDBOX | yes | 4 |
| `sandbox-donation-200` | SANDBOX | yes | 3 |
| `live-probe-227833730` | **LIVE** | **yes** | 0 |
| `live-probe-987313125` | **LIVE** | **yes** | 0 |

**Rules** (all SANDBOX, all enabled, all v1, all HALF_UP, all priority 100)

| rule_key | profile | category | tx_type | ccy | country | rate |
| --- | --- | --- | --- | --- | --- | --- |
| `sandbox-default-zero` | sandbox-default | * | **\*** | * | * | 0 bps |
| `sandbox-donation-200` | sandbox-donation-200 | * | **\*** | * | * | 200 bps |
| `wallet_withdrawal_default` | * | * | wallet_withdrawal | AOA | * | 75 bps |
| `donation-standard` | * | DONATION | **payment** | AOA | AO | 200 bps |

**`donation-standard` is dead code.** It requires `transaction_type = "payment"`,
and no context ever sets that value — capture passes `None`. It has never
matched anything and cannot.

---

## 3. Matching algorithm and specificity audit

`rule_matches` requires, for each non-null selector on the rule, an equal value
in the context. A `None` selector is a wildcard. Critically, a rule with a
selector set does **not** match a context whose corresponding field is `None` —
which is why the profile-keyed rules cannot leak onto payouts.

`select_rule` ranks: `specificity` → `priority` → `version` → **rule id (uuid)**.

`specificity()` counts non-null selectors — all six weighted equally.

| question | answer |
| --- | --- |
| 0 matches | fee 0, `rule_id = None`. Capture and settlement now refuse; payout still charges zero. |
| >1 equally specific matches | **silently resolved by comparing UUIDs.** Deterministic, economically arbitrary, and never reported. |
| depends on row order? | No — `max_by` over a total order. |
| caller-controllable? | Not any more. The three public selectors are gone and guarded. |

**P1 — an ambiguous configuration is resolved by UUID comparison rather than
refused.** The owner's §6 invariant says >1 applicable rule should be
`PRICING_CONFIGURATION_ERROR`. Today it silently picks one.

**Is generic specificity necessary?** On the evidence, no. Four rules exist;
three use exactly one selector, the fourth is dead. Equal weighting is also
questionable in principle: it says a country-specific rule and an
operation-specific rule are equally authoritative, which is how a
`fee_policy_ref` rule was able to outrank an assigned profile.

---

## 4. What a pricing profile currently *is*

Empirically: **(E) a matching dimension** — a bare text selector on a rule, with
no foreign key. It is *used as if* it were (D) an assigned commercial policy,
but nothing in the schema makes it one.

Each deployed profile has **exactly one rule**, which prices **every**
profile-carrying operation. So a profile is currently *one wildcard rate*, not a
bundle of per-operation tariffs.

**Profile vs rule responsibilities are mixed**, not separated: because the rule
cannot name an operation, the profile's single rule *is* its whole economics.

---

## 5. Wildcard-zero audit (the owner's §12)

`sandbox-default-zero` is `pricing_profile=sandbox-default` with **every other
selector null**, including `transaction_type`.

It cannot reach payouts — the payout context carries no profile, so a
profile-keyed rule cannot match it. That is luck rather than design.

But it is a **catch-all zero across operations**: any future fee-bearing
operation that carries a pricing profile in its context becomes **free** for
every `sandbox-default` owner, silently, on the day it ships. `sandbox-donation-200`
has the mirror problem — a new operation would be charged 200 bps without anyone
deciding so.

**P1 — a new fee-bearing operation inherits an unintended rate.** This is
precisely the failure the owner's §30 describes, and the current model produces
it by construction.

`sandbox-default` therefore currently means **"all pricing is zero"**, not "each
released fee-bearing operation has an explicit zero rule". The owner prefers the
second. So do I: the first cannot fail closed.

---

## 6. `sandbox-donation-200` audit

- **one** rule; prices every profile-carrying operation, not settlement only
- does **not** affect payout (no profile in that context)
- "donation" is a **business vertical**; "200" is a **rate**

The name therefore encodes two things that should not be in an identity: a
vertical the profile does not actually depend on, and a rate that will change.
Changing settlement to 150 bps would leave a profile called `…-200` charging
150 — or force an identity change, rewriting what historical rows point at.

**P2 — the profile code mixes vertical and tariff into a supposedly stable
identity.**

---

## 7. Operation matrix

| operation | moves money | developer-visible | resolves a fee today | should be fee-bearing | why |
| --- | --- | --- | --- | --- | --- |
| Transfer | yes | yes (pay links, QR, sessions) | **no** | **no** | shared with P2P; a fee here charges people for sending money to each other |
| Payment / donation | yes (via Transfer) | yes | no | no | credits gross by design |
| Transaction capture | yes | **no public route** | **yes** | undecided | the fee point the model does not currently use |
| Application settlement | yes | yes | **yes** | **yes** | the canonical fee-bearing operation |
| Settlement (`core/settlement`) | yes | no | no | to decide | not a pricing consumer |
| Payout / withdrawal | yes | yes | **yes** | **yes** | money leaving |
| Collection | yes | yes | no | no | splits an already-priced charge |
| Refund | yes | yes | no | **no** | reverses priced value; re-pricing would charge twice |

Only three crates depend on `banzami-pricing`, now guarded by
`tools/check-pricing-consumers.mjs`.

---

## 8. Pricing matrix

| profile | operation | fee model | rate | missing behaviour | status |
| --- | --- | --- | --- | --- | --- |
| `sandbox-default` | *any profile-carrying op* | bps | 0 | n/a (wildcard always matches) | **dangerous wildcard** |
| `sandbox-donation-200` | *any profile-carrying op* | bps | 200 | n/a (wildcard always matches) | dangerous wildcard |
| *(none)* | payout | bps | 75 | **implicit zero** | seeded by 0108, refusal not yet cut over |
| *(none)* | capture | — | — | **refuses** | correct |
| *(none)* | settlement | — | — | **refuses** | correct |

---

## 9. Payout / RA-063 audit

- **the rule:** `wallet_withdrawal_default` v1, SANDBOX, enabled,
  `transaction_type = wallet_withdrawal`, `currency = AOA`, **75 bps**, flat 0,
  HALF_UP, priority 100, effective 2026-09-05, open-ended
- **restored** by hand through core's internal pricing API after a financial
  reset left `pricing_rules` empty and a withdrawal was measured at zero
- **now durable:** migration 0108 seeds exactly this rule, guarded on the
  matching dimension
- **missing still becomes zero:** yes. The refusal is deliberately not yet in
  place — the seed and the completeness gate come first, or a revenue leak
  becomes a customer-facing outage

### The incident, reconstructed from the ledger

The evidence file said the harness "measured a fee of ZERO". The ledger says
exactly which withdrawal, and exactly when:

| fact | value |
| --- | --- |
| payouts on record | 34 (18 PENDING, 16 PROCESSING) |
| processed, i.e. carrying a ledger posting | 16 |
| carrying a paired operator-fee posting | **15** |
| the one without a fee | **80 000** minor units, 2026-09-05 **06:55:36** |
| `wallet_withdrawal_default` created | 2026-09-05 **06:56:49** |
| gap | **73 seconds** |

One withdrawal was processed 73 seconds before the rule existed, and it moved
money out at no fee. Everything after it was charged correctly: 15 payouts,
gross 1 060 000, fee 7 950 — exactly 0.75%, to the minor unit.

The uncharged amount is 600 minor units of Sandbox money, so nothing of value
was lost. What the reconstruction shows is the shape of the failure: it is
silent, it is bounded only by how long the rule is missing, and the only reason
anyone found it was a test asserting an amount. The current repair — a row added
by hand — leaves that same 73-second shape available after every reset, which is
why migration 0108 seeds the rule and why the refusal has to follow.

It also demonstrates the P1 above: the payout record cannot tell you any of
this. Reconstructing it required joining `payouts` to `ledger_postings` on a
derived idempotency key (`<key>:process:fee`), because the payout row itself
holds no fee, no rule, and no version.

Two further findings on this path:

**P1 — `payouts` records no pricing evidence at all.** Its columns are
`amount_minor` and nothing else: no fee, no `pricing_rule_id`, no version, no
snapshot. Capture writes `operator_fees` and settlement writes
`pricing_snapshot_json`; a withdrawal's decision survives only as a ledger
posting. The owner's §20 question — "which rule and version priced this?" —
cannot be answered from the payout record.

**P2 — the withdrawal rule is currency-pinned to AOA.** A withdrawal in any
other currency matches no rule, and today that means free.

---

## 10. Decision points (§19)

| operation | pricing fixed at | snapshot | retry behaviour |
| --- | --- | --- | --- |
| capture | capture | `operator_fees` row + `snapshot_json` | idempotent on `<key>:capture`; replay returns the existing posting |
| settlement | **create** | `pricing_snapshot_json` on `app_settlements` | `complete` posts the stored fee; it does not re-resolve |
| payout | **process** (`post_initiation`) | **none** | posting is idempotent on `<key>:process`, so a replay does not re-charge — but a first attempt after a rule change uses the new rate |

Settlement's split (decide at create, post at complete) is the strongest of the
three and worth keeping as the pattern.

---

## 11. Fee model, base, currency, rounding

- **Supported:** `rate_bps` + `flat_minor`, clamped by optional
  `min_fee_minor`/`max_fee_minor`, with an explicit rounding mode. That is
  enough for the current product; nothing here needs adding.
- **Base:** the gross of the operation — `tx.amount` at capture,
  `gross_amount` at settlement, `payout.amount` at process. Consistent, but
  written down nowhere.
- **Rounding:** one code path (`apply_bps`), integer-only, i128 intermediate.
  It cannot vary by entrypoint. Covered by the 200-bps boundary matrix.
- **P2 — currency ambiguity:** `currency` is nullable and `flat_minor` is a
  bare integer, so a wildcard-currency rule with a flat fee means "N minor units
  of whatever currency this happens to be". All deployed `flat_minor` are 0, so
  this is latent, not live. No constraint prevents it.

---

## 12. Authority audit

**Operator writes** go through admin-api (`pricing_rules.go`,
`pricing_catalogs.go`) with `auditAfter`/`auditChange` on create and update, and
through core's internal `PUT /internal/v1/merchants/:id/pricing-profile` for
assignment. Rule edits are versioned when a rule is in use.

**Developer/caller writes:** none. The three selectors are gone from both public
requests and from the gateway's service structs; the SDK's `createTransaction`
no longer accepts them and the types are removed. Guarded by
`tools/check-economic-authority.mjs` with a self-test that reintroduces every
instance.

**P2 — two enabled LIVE pricing profiles exist as harness residue.**

`live-probe-227833730` and `live-probe-987313125`, created 2026-09-07 00:12,
25 seconds apart. Verified referenced by nothing:

| profile | env | enabled | assignments | rules | settlements | operator fees |
| --- | --- | --- | --- | --- | --- | --- |
| `live-probe-227833730` | LIVE | yes | 0 | 0 | 0 | 0 |
| `live-probe-987313125` | LIVE | yes | 0 | 0 | 0 | 0 |

Not exploitable — LIVE is fail-closed and neither is assigned — but they are
authority-shaped objects sitting in a financial table.

**Cause, now fixed.** `pricing-authority-e2e.sh` created the probe, tested it,
and deleted it in three separate statements. Any exit between the first and the
last leaked one. The run manifest is the usual answer and does not fit: it
retires objects over HTTP, and a pricing profile has no retirement route. So the
window is closed rather than cleaned up after — the insert, the attempted
assignment and the delete are now a single `DO` block, which either completes
with the probe deleted or aborts entirely and rolls the insert back with it.
There is no state in which the probe survives. The harness also asserts
afterwards that nothing named `live-probe-<run>` remains, so a regression in the
block itself cannot quietly reintroduce the leak.

**The two existing rows are NOT deleted here.** They are referenced by no
financial operation, so removing them would destroy no history — but deleting
rows from a financial table on a deployed system is the owner's call, not a
side effect of an audit, and the standing instruction is that cleanup must never
rest on a name prefix alone. The evidence above is assembled so the decision is
a one-word one.

---

## 13. Answers to the owner's ten questions

1. **Is `pricing_profile` a robust abstraction?** No. It is an unconstrained
   text selector with no FK, no version, and no ability to carry more than one
   operation's rate.
2. **Should a profile be a commercial plan / bundle of tariffs?** Yes — that is
   what it is already being used as, and what the model cannot currently support.
3. **Should rates live exclusively in operation-specific rules?** Yes. The rate
   belongs to (profile × operation), and today the operation half does not exist
   for capture or settlement.
4. **Is `sandbox-donation-200` a good long-term name?** No — it encodes a
   vertical and a rate into an identity that should survive both changing.
5. **Is `sandbox-default` safe?** It is not *currently* exploitable, but it is
   the dangerous wildcard zero the owner's §12 describes: a future operation
   becomes free by existing.
6. **How should settlement and payout coexist under one profile?** As two rules
   under one profile, discriminated by operation — which requires the operation
   selector this model lacks.
7. **What happens when a new fee-bearing operation is introduced?** Today it
   silently inherits the profile's wildcard rate — free under `sandbox-default`.
   It should fail closed.
8. **Can any caller-controlled field still change economic policy?** No, on
   every surface audited, and it is guarded and mutation-tested.
9. **Are historical decisions independently auditable?** For capture and
   settlement, yes — rule id, version, engine version and a snapshot. For
   **payout, no**.
10. **What is the minimal robust model?** Below.

---

## 14. Recommended canonical model (not implemented)

**A deterministic key, and one rule.**

```
(pricing_profile, fee_bearing_operation, environment)  ->  exactly one rule
```

with `currency` added to the key only where a fixed component genuinely needs
it, and `effective_from/to` for time.

- 0 rules → `PRICING_NOT_CONFIGURED` (already true for capture and settlement)
- 1 rule → apply it
- >1 rules → `PRICING_CONFIGURATION_ERROR`, refused rather than ranked

**Keep:** the rule/version/effective-window machinery, the snapshot columns, the
single `apply_bps` implementation and its rounding modes, the environment guard,
the assignment trigger, the completeness gate, the consumer inventory, the
economic-authority gate.

**Modify:** add an explicit `fee_bearing_operation` to rules and to every
`PricingContext`; make every deployed rule name its operation; add a partial
unique index so overlap is prevented in the database rather than ranked at
runtime; add pricing evidence columns to `payouts`; give profiles a lifecycle
(`ACTIVE`/`RETIRED`) instead of a bare boolean.

**Remove / deprecate:** the generic specificity ranking and its UUID tiebreak;
`business_category` and `fee_policy_ref` as rule selectors (nothing sets them in
any context any more); the dead `donation-standard` rule; the wildcard-operation
rules, replaced by one explicit rule per released operation.

**Add:** a completeness gate v2 — every active profile × every *required*
fee-bearing operation has exactly one valid rule; and a registry of released
fee-bearing operations so a new one fails the gate until priced.

**Naming principle (recommended, not applied):** a profile code should name the
*commercial policy*, not a vertical or a rate — e.g. `sandbox-standard`,
`sandbox-partner` — so that changing settlement from 200 to 150 bps is a rule
version, not an identity change.

---

## 15. Findings by severity

**P0**
- The pricing model cannot express operation-scoped rates. `transaction_type` is
  the only operation discriminator and only payouts set it, so no rule can
  target settlement without also targeting capture.

**P1**
- A wildcard-operation rule makes any future fee-bearing operation free
  (`sandbox-default`) or unintentionally priced (`sandbox-donation-200`).
- More than one equally specific rule is resolved by comparing UUIDs instead of
  being refused.
- `payouts` records no pricing evidence; a withdrawal's rule and version are not
  independently auditable.
- A missing payout rule is still an implicit zero (cutover in progress by
  design: seeded in 0108, gated, refusal pending).

**P2**
- `sandbox-donation-200` mixes a business vertical and a rate into a stable
  identity.
- `flat_minor` with a null `currency` is an ambiguous amount; nothing prevents it.
- The withdrawal rule is pinned to AOA; another currency resolves no rule.
- Two enabled LIVE probe profiles remain as harness residue, because the probe
  is cleaned up by a manual statement rather than the run manifest.
- `pricing_rules.pricing_profile` has no foreign key to `pricing_profiles.code`.
- **The migration ledger does not reflect the deployed schema.** `_sqlx_migrations`
  holds 102 rows with a highest version of 105, while the schema plainly carries
  0106's and 0107's effects — `pricing_profiles` exists,
  `merchants.pricing_profile_id` exists, and `merchant_profiles.pricing_profile_id`
  has been dropped. They were applied through a path that did not record them.

  No risk, and no action needed beyond knowing it: both migrations are
  idempotent (`ADD COLUMN IF NOT EXISTS`, and every `CREATE TRIGGER` preceded by
  `DROP TRIGGER IF EXISTS`), so `sqlx migrate run` would re-apply them harmlessly
  and then apply 0108. The cost is that "which schema is deployed" cannot be
  answered from the tracker, only by inspecting the schema.

  Two false alarms on the way to this, both caught before reporting and both
  worth recording as method: a query comparing the ledger against a dense
  1..108 range reported 64, 65 and 66 as missing — those numbers were never used,
  there are 105 files for versions up to 108; and a line-based grep for unguarded
  DDL flagged `ALTER TABLE ... ADD COLUMN`, whose `IF NOT EXISTS` sits on the
  next line. A deployed-database finding is worth re-deriving before it is
  stated.

**P3**
- `donation-standard` is dead and should be retired with a recorded reason.
- The fee base per operation is consistent but undocumented.
- Profiles have no version and no retirement state.

---

## 16. If the changes are accepted — sequence

1. Add `fee_bearing_operation` to `pricing_rules` (nullable), and set it on every
   `PricingContext`. Additive; nothing refuses yet.
2. Backfill the deployed rules to name their operation; retire
   `donation-standard`.
3. Completeness gate v2 proves every active profile × required operation has
   exactly one rule.
4. **Only then** make the resolver refuse a rule that names no operation, and
   refuse >1 match with `PRICING_CONFIGURATION_ERROR`.
5. Partial unique index preventing overlap.
6. Payout evidence columns + the payout refusal, in that order.
7. DB-backed CI, deploy, E2E.

Steps 3 and 4 must not be reversed, for the same reason they must not be
reversed on the payout path.

---

**PRICING MODEL: NEEDS MODIFICATION.**

It is not unsafe today — no caller can steer it, capture and settlement fail
closed, and the wildcards cannot reach the payout path. It is not robust for the
model it is now being asked to carry: it cannot say *which operation* a rate is
for, which is the one thing the confirmed economic model is built on.
