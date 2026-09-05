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

// Deploy-set membership, in BOTH directions.
//
// `pay-frontend` used to be on the forbidden list. That invariant was written
// when the Sandbox project was API-only; the hosted payer surface is now part of
// the external Sandbox product (Banzami ADR-052, CAP-APP-004) and every payment
// link the platform issues points at it. The guard is replaced, not deleted:
// what it was really protecting is that no ADMIN or LIVE surface is deployed
// here, and that is now named precisely rather than by substring.
{
  const deploy = readIf(resolve(ROOT, 'sandbox-ops/scripts/sandbox-deploy.sh'));
  const inDeploySet = (svc) => !!deploy && new RegExp(`SERVICES=\\([\\s\\S]*?"${svc}\\|`).test(deploy);

  // (a) Still forbidden — admin and live surfaces have no place in this project.
  const forbidden = ['admin-api-staging', 'admin-frontend', 'dashboard-frontend', 'checkout-frontend', 'banzai', 'banza-docs'];
  const present = forbidden.filter(inDeploySet);
  if (present.length) fail('allowlist', `deployment adapter deploys a forbidden service: ${present.join(', ')}`);
  else pass('allowlist', 'deployment adapter deploys no admin/live/retired surface');

  // (b) Now REQUIRED — the authorised Sandbox application surfaces.
  const required = ['core-api-staging', 'api-gateway-staging', 'developer-api', 'public-api-staging', 'pay-frontend'];
  const missing = required.filter(s => !inDeploySet(s));
  if (missing.length) fail('deploy-set', `canonical Sandbox deploy set is missing: ${missing.join(', ')}`);
  else pass('deploy-set', 'canonical Sandbox deploy set carries every authorised surface, including pay-frontend');

  // (c) The payer surface holds no financial authority. It is the only entry
  //     with no secret mount, and adding a frontend must not broaden what the
  //     Sandbox exposes: application plane only, no data plane.
  if (!deploy || !/PAY_FRONTEND_APP_PLANE_ONLY=1/.test(deploy)) {
    fail('pay-plane', 'pay-frontend is deployed without the application-plane-only constraint');
  } else if (/pay-frontend[\s\S]{0,900}?(BZSB_DATA_NET|db_url|core_internal_key|jwt_secret)/.test(deploy)) {
    fail('pay-plane', 'pay-frontend is wired to the data plane or to a secret');
  } else {
    pass('pay-plane', 'pay-frontend is application-plane only and mounts no secret');
  }
}

console.log('');
if (failed) { console.error(`check-sandbox-operational: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-sandbox-operational: all five operational components present and safe');
