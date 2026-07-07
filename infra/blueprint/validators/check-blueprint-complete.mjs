#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for Increment 2F (unified completion).
// Asserts the complete-lab orchestrates all phases, checks residue across every category,
// preserves standalone targets, and never uses global pruning — without running anything.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const read = p => readFileSync(p, 'utf8');
const cl = read(resolve(ROOT, 'complete-lab', 'complete-lab.sh'));

// 1. orchestrates all validated phases in order
{
  const ok = /lab\.sh full/.test(cl) && /migration-lab\.sh full/.test(cl) && /migration-identity\.sh full/.test(cl) && /migration-control\.sh full/.test(cl);
  ok ? pass(1, 'chains 2A → 2C → 2D → 2E standalone labs (2B via attested runner handoff inside 2D/2E)') : fail(1, 'phase chain incomplete');
}
// 2. static gates run before labs
{
  /check-blueprint-migration-control/.test(cl) && /static gates/.test(cl) ? pass(2, 'runs static gates (incl. migration-control) before the runtime labs') : fail(2, 'static gates missing');
}
// 3. residue across every category incl. migration-control
{
  const cats = ['com.banzami.blueprint.lab', 'com.banzami.blueprint.runner-lab', 'com.banzami.blueprint.migration-lab', 'com.banzami.blueprint.migration-identity', 'com.banzami.blueprint.migration-control'];
  const ok = cats.every(c => cl.includes(c)) && /builders=/.test(cl) && /temp roots=/.test(cl) && /RESIDUE_ZERO: PASS/.test(cl);
  ok ? pass(3, 'host-wide zero-residue across all five lab categories + builders + temp roots') : fail(3, 'residue coverage incomplete');
}
// 4. no global prune / unscoped deletion
{
  !/system prune|image prune|builder prune|volume prune|network prune|down -v[^\-]/.test(cl) ? pass(4, 'no global Docker prune or unscoped cleanup') : fail(4, 'global prune present');
}
// 5. preserves standalone targets (invokes them, does not reimplement labs)
{
  /bash infra\/blueprint\/lab\/scripts\/lab\.sh/.test(cl) && /bash infra\/blueprint\/migration-control\/scripts\/migration-control\.sh/.test(cl) ? pass(5, 'reuses standalone lab entrypoints (does not weaken or reimplement earlier validators)') : fail(5, 'does not reuse standalone targets');
}

console.log('');
if (failed) { console.error(`check-blueprint-complete: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-blueprint-complete: all checks passed');
