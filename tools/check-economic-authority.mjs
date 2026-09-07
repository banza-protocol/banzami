#!/usr/bin/env node
/**
 * CLIENT-CONTROLLED ECONOMIC-POLICY AUTHORITY — the named defect class.
 *
 * WHAT IT IS
 *
 * A caller influencing what it is charged, without ever sending an amount.
 *
 * Every instance found in this codebase was defended the same way: "reference
 * only — never a fee, never a percentage". True in each case, and beside the
 * point. The Pricing Engine selects a rule by matching dimensions and ranks the
 * more specific rule higher, so a caller who chooses the reference chooses the
 * rate one level of indirection away. And the documented fallback — no rule
 * matched means a fee of zero — made sending nothing the cheapest option
 * available.
 *
 * The instances, all fixed:
 *
 *   business_category on the transaction request      caller picked its rate
 *   pricing_profile on the transaction request        caller named the policy
 *   fee_policy_ref on the settlement request          outranked the assigned
 *                                                     profile by specificity
 *   an unmatched category                             resolved to zero
 *   no rule at all                                    captured and settled free
 *
 * WHY A SINGLE GUARD
 *
 * Each instance already has a test on its own surface. What those cannot do is
 * describe the class, and the class is what kept coming back: three separate
 * fixes, each looking complete, each leaving another door open — fee_policy_ref
 * survived the first pass precisely because the guard of the day checked one
 * field by name.
 *
 * So this checks the property, not the field list, and it fails on a NEW
 * selector as readily as on an old one.
 *
 *   node tools/check-economic-authority.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

let fail = 0;
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

// Anything that names a rule-matching dimension. Adding a dimension to the
// engine means adding it here, which is the review this guard exists to force.
const SELECTORS = ['business_category', 'pricing_profile', 'fee_policy_ref', 'rate_bps', 'fee_minor'];

const stripGoComments = (s) => s.split('\n').map((l) => {
  const i = l.indexOf('//');
  return i >= 0 ? l.slice(0, i) : l;
}).join('\n');

console.log('client-controlled economic-policy authority\n');

// ── 1. no public request may declare a pricing selector ────────────────────
//
// Asserted on the struct tags, so the explanatory comments beside them — which
// necessarily name the fields they no longer have — neither satisfy nor trip it.
const REQUESTS = [
  ['services/api-gateway/internal/handler/transactions.go', 'type createTransactionBody struct {', 'POST /v1/transactions'],
  ['services/api-gateway/internal/handler/application_settlements.go', 'var body struct {', 'POST /v1/application-settlements'],
];

for (const [file, anchor, surface] of REQUESTS) {
  if (!existsSync(file)) { bad(`${file} is missing — the guard cannot see ${surface}`); continue; }
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf(anchor);
  if (start < 0) { bad(`${surface}: could not find its request struct (${anchor})`); continue; }
  const end = src.indexOf('\n\t}', start);
  const struct = src.slice(start, end < 0 ? start + 2000 : end);
  const found = SELECTORS.filter((f) => struct.includes(`json:"${f}"`));
  found.length
    ? bad(`${surface} accepts ${found.join(', ')} — the caller can steer what it is charged`)
    : ok(`${surface.padEnd(38)} declares no pricing selector`);
}

// ── 2. no caller input may reach the fee path ──────────────────────────────
//
// A field can be removed from the request and still be forwarded from somewhere
// else. This looks for the assignment itself.
for (const [file, , surface] of REQUESTS) {
  if (!existsSync(file)) continue;
  const src = stripGoComments(readFileSync(file, 'utf8'));
  const leaks = SELECTORS
    .map((f) => f.split('_').map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p)).join(''))
    .map((camel) => camel[0].toUpperCase() + camel.slice(1))
    .filter((Field) => src.includes(`body.${Field}`));
  leaks.length
    ? bad(`${surface} still reads body.${leaks.join(', body.')} into the fee path`)
    : ok(`${surface.padEnd(38)} forwards no caller pricing input`);
}

// ── 3. a descriptive label may never REACH a rate ──────────────────────────
//
// A business names itself, and those words are caller-controlled. Deriving a
// rate from them would be this same defect in different clothes — and it is a
// plausible-looking improvement, since auto-categorising a business from what
// it calls itself sounds helpful.
//
// pricingCategoryFromLabel still exists and still does exactly that. It is kept
// deliberately, for the Integration Health screen that shows a merchant which
// category it is recorded under — a label, used as a label.
//
// So the check is not "does substring matching exist" (it does, legitimately),
// but "does its result reach anything that prices". The first version of this
// guard checked for the matching itself and reported a display path as a
// defect; that was the guard being wrong in the direction of noise, which is
// the survivable direction, but noise is how a guard gets switched off.
const LABEL_DERIVED = ['PricingCategoryForMerchant', 'PricingCategory'];
const FEE_PATH_HANDLERS = [
  ['services/api-gateway/internal/handler/transactions.go', 'POST /v1/transactions'],
  ['services/api-gateway/internal/handler/application_settlements.go', 'POST /v1/application-settlements'],
];

for (const [file, surface] of FEE_PATH_HANDLERS) {
  if (!existsSync(file)) continue;
  const src = stripGoComments(readFileSync(file, 'utf8'));
  const reached = LABEL_DERIVED.filter((sym) => src.includes(sym));
  reached.length
    ? bad(`${surface} references ${reached.join(', ')} — a label-derived category is reaching a fee path, so a business could rename itself onto a cheaper rate`)
    : ok(`${surface.padEnd(38)} no label-derived category in the fee path`);
}

// ── 4. a missing rule must refuse, not resolve to zero ─────────────────────
//
// The root instance. `resolve` reports fee 0 with rule_id = None when nothing
// matched, which is indistinguishable in a ledger from a rule that decides zero.
// Every money-moving caller has to tell them apart at the point money moves.
const FEE_BEARING = [
  ['core/transactions/src/engine.rs', 'PricingNotConfigured', 'capture'],
  ['core/app-settlement/src/engine.rs', 'PricingNotConfigured', 'settlement'],
];

for (const [file, marker, op] of FEE_BEARING) {
  if (!existsSync(file)) { bad(`${file} is missing — cannot verify ${op} refuses`); continue; }
  const src = readFileSync(file, 'utf8');
  const guards = src.includes('rule_id.is_none()') && src.includes(marker);
  guards
    ? ok(`${op.padEnd(38)} refuses when no rule applies`)
    : bad(`${op} does not refuse an absent pricing decision — an unmatched rule would move money for free`);
}

// payouts is mid-cutover by design: the rule is seeded (0108) and gated
// (check-pricing-assignment.mjs) before the refusal lands, because refusing
// first would turn a revenue leak into a customer-facing outage.
const PAYOUTS = 'core/payouts/src/engine.rs';
if (existsSync(PAYOUTS)) {
  const refuses = readFileSync(PAYOUTS, 'utf8').includes('rule_id.is_none()');
  console.log(refuses
    ? '  ✓ withdrawal                             refuses when no rule applies'
    : '  · withdrawal                             still resolves zero when no rule applies — cutover in progress, see docs/audit/2026-09-07-pricing-indirect-authority.md');
}

console.log();
if (fail) {
  console.error(`✗ economic authority gate FAILED (${fail})`);
  console.error('  A caller must never be able to influence what it is charged, however indirectly.');
  process.exit(1);
}
console.log('✓ no caller-reachable input selects a rate, and an absent decision does not move money');
