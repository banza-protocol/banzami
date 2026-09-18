#!/usr/bin/env node
/**
 * The reuse contract, proven without touching the Sandbox.
 *
 * `provisionBusiness` documents that a Business supplied through BZ_BIZ_HANDLE
 * persists for the next run. Seven of nine proofs used to retire it anyway —
 * retireBusiness SUSPENDS the merchant, so the next run signing in with that
 * handle got a login error that looks nothing like "your fixture was retired".
 * The rule now lives in the function that does the damage; this holds it there.
 */
process.env.BZ_BIZ_HANDLE = 'fixture-under-test';
process.env.BZ_BIZ_MERCHANT_ID = '00000000-0000-4000-8000-000000000001';

const { provisionBusiness, retireBusiness } = await import('./business-provision.mjs');

let failures = 0;
const check = (title, actual, expected) => {
  if (actual === expected) return console.log(`  ✓ ${title}`);
  console.log(`  ✗ ${title}\n      expected ${expected}, got ${actual}`);
  failures++;
};

console.log('\nfixture reuse contract\n');
const biz = await provisionBusiness({});
check('a supplied fixture is marked reused', biz.reused, true);
check('retire REFUSES it', await retireBusiness(biz.merchantId), 'skipped-reused');
check('and refuses nothing else', await retireBusiness(''), 'no-op');

console.log(failures === 0 ? '\n✓ FIXTURE_REUSE_CONTRACT=PASS\n' : `\n✗ FIXTURE_REUSE_CONTRACT=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
