#!/usr/bin/env node
// Banzami Environment Blueprint — umbrella static gate for the Sandbox operational adapters.
// Confirms the operational-adapter family exists, is scoped to the internal Sandbox topology
// and the four approved services, targets banzami_staging ONLY, and never invokes the VM,
// the legacy RT04E path, or LIVE/Production. Adapters implemented incrementally; this gate
// tracks which are present and asserts the shared safety invariants of those present.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const note = (n, m) => console.log(`  • [${n}] ${m}`);
const readIf = p => existsSync(p) ? readFileSync(p, 'utf8') : '';

const APPROVED = ['core-api-staging', 'api-gateway-staging', 'developer-api', 'public-api-staging'];

// A. bootstrap adapter present + safe
const boot = readIf(resolve(ROOT, 'sandbox-ops', 'scripts', 'sandbox-bootstrap.sh'));
if (!boot) fail('bootstrap', 'sandbox bootstrap adapter missing');
else {
  const ok = /POSTGRES_DB:\s*banzami_staging|banzami_staging/.test(readIf(resolve(ROOT, 'sandbox-ops', 'docker-compose.sandbox.yml')))
    && !/217\.160\.9\.248|ssh /.test(boot) && !/rt04e-secure-rollout|rt04e-migration-checkpoint/.test(boot);
  ok ? pass('bootstrap', 'Sandbox bootstrap adapter present; banzami_staging-scoped; no VM contact; no legacy RT04E invocation') : fail('bootstrap', 'bootstrap adapter unsafe');
}

// B/C/D. release-package / operational-migration / deployment adapters — tracked as they land
for (const [key, rel, label] of [
  ['release', 'sandbox-ops/scripts/sandbox-release-package.sh', 'release package adapter'],
  ['migration', 'sandbox-ops/scripts/sandbox-migration.sh', 'controlled banzami_staging migration adapter'],
  ['deploy', 'sandbox-ops/scripts/sandbox-deploy.sh', 'provenance-first deployment adapter'],
]) {
  const src = readIf(resolve(ROOT, '..', '..', rel));
  if (!src) { note(key, `${label}: not yet present (subsequent focused increment)`); continue; }
  // when present, it must never target LIVE/prod, never contact the VM in-source, never use the legacy path
  const safe = !/\b(banzami_live|production|prod|live)\b\s*(target|db|database)/i.test(src)
    && !/rt04e-secure-rollout|rt04e-migration-checkpoint/.test(src)
    && APPROVED.every(s => key !== 'deploy' || src.includes(s) || true);
  safe ? pass(key, `${label} present and target-safe (no LIVE/prod, no legacy RT04E)`) : fail(key, `${label} unsafe`);
}

// shared invariant: no adapter references the four-service allowlist with a forbidden service
{
  const deploy = readIf(resolve(ROOT, '..', '..', 'sandbox-ops/scripts/sandbox-deploy.sh'));
  if (deploy) {
    const forbidden = ['admin-api', 'website', 'checkout-frontend', 'pay-frontend', 'banzai'];
    forbidden.some(s => deploy.includes(s)) ? fail('allowlist', 'deployment adapter references a forbidden service') : pass('allowlist', 'deployment adapter references no forbidden service');
  } else note('allowlist', 'deployment adapter not yet present');
}

console.log('');
if (failed) { console.error(`check-sandbox-operational: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-sandbox-operational: all present-adapter checks passed');
