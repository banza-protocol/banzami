#!/usr/bin/env node
/**
 * Surfaces that were retired must stay retired.
 *
 * Deleting an application is easy to half-do: the directory goes and a deploy
 * entry, a compose service, a CI job or a doc page stays, and the next person
 * reads that residue as a product that exists. Worse, a retired app can come
 * back by accident — a branch merged, a directory restored — and nothing would
 * say so.
 *
 * Each retired surface below names what must NOT exist, and why it was retired,
 * so the reason survives the deletion.
 *
 *   node tools/check-retired-surfaces.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => { try { return readFileSync(resolve(ROOT, p), 'utf8'); } catch { return ''; } };

const RETIRED = [
  {
    name: 'apps/dashboard — merchant dashboard (CAP-APP-002)',
    why: 'unrouted, in no container, named by no CI job, imported by nothing, and it kept a SECRET API key in localStorage and called the Gateway from the browser, which CLAUDE.md §13 forbids',
    dir: 'apps/dashboard',
    // Files that must not name it as something that exists.
    absentFrom: [
      ['deploy.sh', /dashboard-frontend/],
      ['dev.sh', /dashboard/],
      ['.github/workflows/ci.yml', /apps\/dashboard/],
      ['quality/deployed-component-coverage.json', /apps\/dashboard/],
      ['ops/asset-inventory.yaml', /dashboard-frontend/],
    ],
    // The capability entry must record the retirement rather than vanish.
    manifestId: 'CAP-APP-002',
  },
  {
    name: 'apps/checkout — second payer surface (Banzami ADR-052)',
    why: 'a redundant second application presenting the same payment and claiming the same host; apps/pay is canonical',
    dir: 'apps/checkout',
    absentFrom: [['deploy.sh', /checkout-frontend/]],
    manifestId: null,
  },
];

let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

const manifest = read('quality/operator-assurance-manifest.yaml');

for (const r of RETIRED) {
  console.log(`\n── ${r.name} ──`);
  console.log(`   retired because: ${r.why}`);

  existsSync(resolve(ROOT, r.dir))
    ? fail(`${r.dir} exists again — a retired surface is back in the tree`)
    : pass(`${r.dir} is gone`);

  for (const [file, re] of r.absentFrom) {
    const src = read(file);
    if (!src) { pass(`${file} does not exist`); continue; }
    re.test(src)
      ? fail(`${file} still names it: ${(src.match(re) ?? [''])[0]}`)
      : pass(`${file} does not name it`);
  }

  if (r.manifestId) {
    // The capability is not deleted from the manifest — a reader asking "what
    // happened to the merchant dashboard" must find the answer, not a gap.
    const block = manifest.split('\n  - id: ').find((b) => b.startsWith(r.manifestId));
    if (!block) fail(`${r.manifestId} is missing from the manifest — the retirement has no record`);
    else if (!/disposition:\s*removed/.test(block) || !/status:\s*removed/.test(block)) {
      fail(`${r.manifestId} does not record the retirement (disposition/status must be "removed")`);
    } else pass(`${r.manifestId} records the retirement in the manifest`);
  }
}

if (failures) { console.error(`\n✗ ${failures} retired-surface violation(s)`); process.exit(1); }
console.log('\n✓ every retired surface is still retired, and each says why');
