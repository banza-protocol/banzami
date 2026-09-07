#!/usr/bin/env node
/**
 * Does the economic-authority gate actually catch anything?
 *
 * A checker that has never failed is indistinguishable from one that cannot,
 * and this defect class has already survived two rounds of guards that looked
 * sufficient. So every instance of the class is reintroduced into the real
 * source, the gate is run, and it must fail — then the file is restored and the
 * gate must pass again, which also proves the failure came from the fixture and
 * not from something left behind.
 *
 *   node tools/check-economic-authority.selftest.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const GATE = 'tools/check-economic-authority.mjs';

const CASES = [
  {
    name: 'a pricing selector back on the transaction request',
    file: 'services/api-gateway/internal/handler/transactions.go',
    mutate: (s) => s.replace(
      /(type createTransactionBody struct \{)/,
      '$1\n\tBusinessCategory string `json:"business_category"`'),
    expect: 'accepts business_category',
  },
  {
    name: 'fee_policy_ref back on the settlement request',
    file: 'services/api-gateway/internal/handler/application_settlements.go',
    mutate: (s) => s.replace(
      /(\tvar body struct \{)/,
      '$1\n\t\tFeePolicyRef string `json:"fee_policy_ref"`'),
    expect: 'accepts fee_policy_ref',
  },
  {
    name: "the caller's input forwarded into the fee path",
    file: 'services/api-gateway/internal/handler/transactions.go',
    mutate: (s) => s.replace(
      /(\tpricingProfile := "")/,
      '$1\n\t_ = body.PricingProfile'),
    expect: 'still reads body.',
  },
  {
    name: 'a label-derived category reaching the fee path',
    file: 'services/api-gateway/internal/handler/application_settlements.go',
    mutate: (s) => s.replace(
      /(func \(h \*ApplicationSettlementHandler\) resolvePricingProfile)/,
      '// PricingCategoryForMerchant\nfunc (h *ApplicationSettlementHandler) unusedLabelPath() string { return "PricingCategoryForMerchant" }\n\n$1'),
    expect: 'label-derived category is reaching a fee path',
  },
  {
    name: 'capture consulting the Pricing Engine again',
    file: 'core/transactions/Cargo.toml',
    mutate: (s) => s.replace(/(\[dependencies\])/, '$1\nbanzami-pricing = { path = "../pricing" }'),
    expect: 'depends on banzami-pricing again',
  },
  {
    name: 'settlement back on the ranking resolver',
    file: 'core/app-settlement/src/engine.rs',
    mutate: (s) => s.replace('resolve_for_operation', 'resolve_by_ranking'),
    expect: 'settlement does not use the deterministic resolver',
  },
  {
    name: 'settlement no longer naming its operation',
    file: 'core/app-settlement/src/engine.rs',
    mutate: (s) => s.replace('PricingOperation::Settlement', 'PricingOperation::Payout'),
    expect: 'does not name its operation',
  },
  {
    name: 'payout ignoring an ambiguous configuration',
    file: 'core/payouts/src/engine.rs',
    mutate: (s) => s.replace('PricingFailure::Ambiguous', 'PricingFailure::NeverHappens'),
    expect: 'does not handle an ambiguous configuration',
  },
];

const run = () => {
  try {
    execFileSync('node', [GATE], { encoding: 'utf8', stdio: 'pipe' });
    return { pass: true, out: '' };
  } catch (e) {
    return { pass: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

let fail = 0;

if (!run().pass) {
  console.error('✗ the gate does not pass on the clean tree — fix that before trusting this self-test');
  process.exit(1);
}
console.log('  ✓ clean tree passes\n');

for (const c of CASES) {
  const original = readFileSync(c.file, 'utf8');
  const mutated = c.mutate(original);
  if (mutated === original) {
    console.error(`  ✗ ${c.name}: the mutation changed nothing — the anchor moved, so this case proves nothing`);
    fail += 1;
    continue;
  }
  writeFileSync(c.file, mutated);
  const r = run();
  writeFileSync(c.file, original);

  if (r.pass) {
    console.error(`  ✗ ${c.name}: the gate PASSED with the defect reintroduced`);
    fail += 1;
  } else if (!r.out.includes(c.expect)) {
    console.error(`  ✗ ${c.name}: the gate failed, but not for this reason (wanted "${c.expect}")`);
    fail += 1;
  } else {
    console.log(`  ✓ ${c.name}`);
  }
}

if (!run().pass) {
  console.error('\n✗ the gate does not pass after restoring — a fixture was left behind');
  process.exit(1);
}

console.log();
if (fail) { console.error(`✗ economic authority self-test FAILED (${fail})`); process.exit(1); }
console.log(`✓ all ${CASES.length} instances of the defect class are caught, and the tree is clean afterwards`);
