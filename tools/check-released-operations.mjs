#!/usr/bin/env node
/**
 * A new fee-bearing operation cannot ship without a policy.
 *
 * WHY
 *
 * The wildcard model's failure was that a fee-bearing operation introduced
 * tomorrow inherited today's rate the day it shipped — free under one profile,
 * 200 bps under another, with nobody deciding either. V2 removes that by
 * refusing to price an operation no rule names.
 *
 * But refusing at RUNTIME means the discovery happens in production, on a real
 * withdrawal or settlement. The point of this check is to move that discovery to
 * CI: the moment someone adds a variant to PricingOperation, every place that has
 * to know about it must already know.
 *
 * THE THREE PLACES
 *
 *   the Rust enum        PricingOperation — the authority
 *   the database CHECK   what a rule is allowed to name
 *   the completeness gate what every assigned profile must have a rule for
 *
 * Adding a variant to the enum alone fails here, which is the whole idea.
 *
 *   node tools/check-released-operations.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let fail = 0;
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

console.log('released fee-bearing operations\n');

// ── the authority: PricingOperation::from_code ─────────────────────────────
const DOMAIN = 'core/pricing/src/domain.rs';
if (!existsSync(DOMAIN)) {
  console.error(`✗ ${DOMAIN} is missing — the operation authority cannot be read`);
  process.exit(1);
}
const domain = readFileSync(DOMAIN, 'utf8');
const rust = [...domain.matchAll(/"([A-Z_]+)"\s*=>\s*Some\(PricingOperation::/g)].map((m) => m[1]).sort();

if (rust.length === 0) {
  console.error('✗ parsed no operations from PricingOperation::from_code — the contract source moved');
  process.exit(1);
}
ok(`Rust enum          ${rust.join(', ')}`);

// ── the database: what a rule may name ─────────────────────────────────────
//
// Read from the migrations rather than a live database, so this runs in CI. The
// LAST migration that defines the constraint wins, the same way Postgres sees it.
const MIGRATIONS = 'db/migrations';
let constraint = null;
for (const f of readdirSync(MIGRATIONS).sort()) {
  const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
  const m = [...sql.matchAll(/pricing_operation\s+IN\s*\(([^)]*)\)/gi)].pop();
  if (m) constraint = { file: f, values: [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort() };
}

if (!constraint) {
  bad('no migration constrains pricing_operation — a rule could name an operation nothing implements');
} else if (constraint.values.join(',') !== rust.join(',')) {
  bad(`the database CHECK allows ${constraint.values.join(', ')} but the enum has ${rust.join(', ')} (${constraint.file})`);
} else {
  ok(`database CHECK     ${constraint.values.join(', ')}  (${constraint.file})`);
}

// ── the completeness gate: what every profile must have ────────────────────
const GATE = 'tools/check-pricing-assignment.mjs';
if (!existsSync(GATE)) {
  bad(`${GATE} is missing — nothing would require a policy for a new operation`);
} else {
  const gate = readFileSync(GATE, 'utf8');
  const m = /const REQUIRED_OPERATIONS\s*=\s*\[([^\]]*)\]/.exec(gate);
  const required = m ? [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort() : [];
  if (required.length === 0) {
    bad('the completeness gate declares no required operations');
  } else if (required.join(',') !== rust.join(',')) {
    bad(`the completeness gate requires a policy for ${required.join(', ')} but the enum has ${rust.join(', ')} — a new operation would ship with no policy required for it`);
  } else {
    ok(`completeness gate  ${required.join(', ')}`);
  }
}

console.log();
if (fail) {
  console.error(`✗ released-operation inventory FAILED (${fail})`);
  console.error('  A new fee-bearing operation is a new place this operator charges money.');
  console.error('  It must be added to the database constraint and the completeness gate deliberately,');
  console.error('  and every assigned profile must receive an explicit policy for it, before it can ship.');
  process.exit(1);
}
console.log(`✓ ${rust.length} released operations, agreed by the enum, the database and the completeness gate`);
