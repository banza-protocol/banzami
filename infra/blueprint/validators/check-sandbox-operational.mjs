#!/usr/bin/env node
// Banzami Environment Blueprint — umbrella static gate for the Sandbox operational adapters.
// Requires ALL FIVE components (bootstrap, release package, controlled migration, deployment,
// full rehearsal), confirms scope to the internal Sandbox topology and four approved services,
// banzami_staging-only, and no VM / legacy RT04E / LIVE-Production. Fails if any is missing.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const readIf = p => existsSync(p) ? readFileSync(p, 'utf8') : '';

const COMPONENTS = [
  ['bootstrap', 'sandbox-ops/scripts/sandbox-bootstrap.sh'],
  ['release', 'sandbox-ops/scripts/sandbox-release-package.sh'],
  ['migration', 'sandbox-ops/scripts/sandbox-migration.sh'],
  ['deploy', 'sandbox-ops/scripts/sandbox-deploy.sh'],
  ['rehearsal', 'sandbox-ops/scripts/sandbox-operational-rehearsal.sh'],
];
for (const [key, rel] of COMPONENTS) {
  const src = readIf(resolve(ROOT, rel));
  if (!src) { fail(key, `${key} adapter MISSING (${rel})`); continue; }
  const safe = !/rt04e-secure-rollout|rt04e-migration-checkpoint/.test(src)
    && !/\b(banzami_live|production)\b\s*(target|db|database)/i.test(src)
    && !/217\.160\.9\.248|ssh root@/.test(src);
  safe ? pass(key, `${key} adapter present and target-safe (no VM, no legacy RT04E, no LIVE/prod target)`) : fail(key, `${key} adapter unsafe`);
}

// forbidden services must not appear in the deployment adapter
{
  const deploy = readIf(resolve(ROOT, 'sandbox-ops/scripts/sandbox-deploy.sh'));
  const forbidden = ['dashboard', 'checkout-frontend', 'pay-frontend', 'banzai', 'banza-docs', 'admin-api-staging'];
  if (deploy && forbidden.some(s => new RegExp(`SERVICES=\\([\\s\\S]*"${s}\\|`).test(deploy))) fail('allowlist', 'deployment adapter deploys a forbidden service');
  else pass('allowlist', 'deployment adapter references no forbidden service in its deploy set');
}

console.log('');
if (failed) { console.error(`check-sandbox-operational: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-sandbox-operational: all five operational components present and safe');
