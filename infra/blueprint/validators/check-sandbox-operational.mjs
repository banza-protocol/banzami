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
  // Membership is read from the DEPLOY_ONE_ALLOWED_SERVICES set (the authorised deploy-one
  // surfaces, "<name>|<port>|<bin>"); the ceremony subset is CEREMONY_APPLY_SERVICES.
  const deploySet = (deploy.match(/DEPLOY_ONE_ALLOWED_SERVICES=\(([\s\S]*?)\)/) || [])[1] || '';
  const inDeploySet = (svc) => new RegExp(`"${svc}\\|`).test(deploySet);

  // (a) Still forbidden — retired/live surfaces have no place in this project. admin-api and
  // admin-frontend LEFT this list when Stage D approved the operator console (they are now
  // authorised app-plane deploy-one surfaces); this mirrors sandbox-deploy.sh's own FORBIDDEN.
  const forbidden = ['admin-api-staging', 'dashboard-frontend', 'checkout-frontend', 'reverse-proxy', 'banzai', 'banza-docs'];
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
  // The real guard: the app-plane frontend first-create runs on the APPLICATION network only,
  // with non-secret config env, NO secret mounts (-v) and NO data network. Assert that block
  // directly rather than by a fragile proximity scan (which false-matched unrelated data-plane
  // setup for the ceremony services nearby).
  const appOnlyFlag = /PAY_FRONTEND_APP_PLANE_ONLY=1/.test(deploy);
  const frontendCreate = (deploy.match(/first create on \$appnet \(application plane only, no secrets\)[\s\S]*?"\$tag" >\/dev\/null/) || [])[0] || '';
  const appNetOnly = /docker run -d --name "\$cname" --network "\$appnet"/.test(frontendCreate)
    && !/ -v /.test(frontendCreate)
    && !/BZSB_DATA_NET|datanet|db_url|core_internal_key|jwt_secret/.test(frontendCreate);
  if (!deploy || !appOnlyFlag) {
    fail('pay-plane', 'pay-frontend is deployed without the application-plane-only constraint');
  } else if (!frontendCreate || !appNetOnly) {
    fail('pay-plane', 'the app-plane frontend create is not application-network-only / mounts a secret or the data plane');
  } else {
    pass('pay-plane', 'pay-frontend (app-plane frontend) is application-network only and mounts no secret');
  }
}

console.log('');
if (failed) { console.error(`check-sandbox-operational: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-sandbox-operational: all five operational components present and safe');
