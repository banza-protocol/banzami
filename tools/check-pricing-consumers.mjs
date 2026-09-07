#!/usr/bin/env node
/**
 * A new consumer of the Pricing Engine cannot appear without being noticed.
 *
 * WHY
 *
 * The economic authority of this operator is small and deliberately so: exactly
 * three operations resolve an operator fee, and each one had to be audited for
 * whether a caller could influence which rule applies. That audit is only worth
 * something while the list is complete.
 *
 * A fourth consumer added quietly would inherit none of that review. It would
 * also, on current evidence, inherit the defect: every consumer that existed
 * before this work treated "no rule matched" as a fee of zero, because that is
 * what the resolver's own documentation told them to do. Two of the three were
 * fixed; the third is mid-cutover.
 *
 * So the inventory is checked rather than remembered.
 *
 * WHAT IS ALLOWED, AND WHY EACH ONE IS
 *
 * The list below is not a list of crates that happen to compile. It is the
 * answer to "where can this operator charge money", and changing it is an
 * economic decision, not a refactor.
 *
 *   node tools/check-pricing-consumers.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CORE = 'core';

// Money-moving consumers: each resolves a fee and posts against it.
const FEE_BEARING = {
  transactions:      'capture — the operator fee on a payment. Refuses when no rule applies.',
  'app-settlement':  'application settlement — the fee on settling accumulated value. Refuses when no rule applies.',
  payouts:           'withdrawal — the operator fee on money leaving. Cutover in progress: still treats a missing rule as zero, gated by tools/check-pricing-assignment.mjs.',
};

// Non-money-moving: these read or manage rules. They charge nothing.
//
// The `pricing` crate is not listed: it IS the engine, so it does not depend on
// itself and cannot appear in this scan. An earlier version had it here and the
// reverse check correctly reported it as a consumer that had stopped consuming.
const ADMINISTRATIVE = {
  api: 'internal HTTP routes that read and manage rules; resolves no fee of its own.',
};

const ALLOWED = { ...FEE_BEARING, ...ADMINISTRATIVE };

// Deliberate non-consumers, named so a future author sees the decision rather
// than an absence and "fixes" it.
const DELIBERATELY_NEUTRAL = {
  transfers:   'the generic money-movement primitive. It carries merchant payments AND P2P, so a fee inside it would charge people for sending money to each other. Pricing belongs at the fee-bearing operation above it.',
  collections: 'splits an existing charge; the fee was resolved when that charge was captured.',
  refunds:     'reverses value that was already priced. Re-resolving would price the same money twice.',
};

const found = [];
for (const entry of readdirSync(CORE, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifest = join(CORE, entry.name, 'Cargo.toml');
  if (!existsSync(manifest)) continue;
  const toml = readFileSync(manifest, 'utf8');
  // A dependency line, not a mention in a comment.
  if (/^\s*banzami-pricing\s*=/m.test(toml)) found.push(entry.name);
}

let fail = 0;
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };

console.log('pricing engine consumers\n');

for (const crate of found.sort()) {
  if (ALLOWED[crate]) {
    const kind = FEE_BEARING[crate] ? 'FEE-BEARING' : 'administrative';
    console.log(`  ✓ ${crate.padEnd(18)} ${kind.padEnd(15)} ${ALLOWED[crate]}`);
    continue;
  }
  if (DELIBERATELY_NEUTRAL[crate]) {
    bad(`${crate} now depends on banzami-pricing, and it is recorded as deliberately neutral: ${DELIBERATELY_NEUTRAL[crate]}`);
    continue;
  }
  bad(`${crate} depends on banzami-pricing and is not in the reviewed inventory — a new place this operator can charge money needs an economic-authority review, not a dependency line`);
}

// The reverse direction: a reviewed consumer that quietly stopped resolving a
// fee is also a change worth seeing, because it means an operation went free.
for (const crate of Object.keys(ALLOWED)) {
  if (!found.includes(crate)) {
    bad(`${crate} no longer depends on banzami-pricing — a fee-bearing operation may have silently stopped charging`);
  }
}

// And the neutral ones must stay neutral.
for (const [crate, why] of Object.entries(DELIBERATELY_NEUTRAL)) {
  if (!existsSync(join(CORE, crate, 'Cargo.toml'))) continue;
  if (!found.includes(crate)) console.log(`  ✓ ${crate.padEnd(18)} ${'neutral'.padEnd(15)} ${why}`);
}

console.log();
if (fail) {
  console.error(`✗ pricing consumer inventory FAILED (${fail})`);
  console.error('  Update tools/check-pricing-consumers.mjs deliberately, with the reason, after the review.');
  process.exit(1);
}
console.log(`✓ ${Object.keys(FEE_BEARING).length} fee-bearing consumers, all reviewed; the neutral primitives are still neutral`);
