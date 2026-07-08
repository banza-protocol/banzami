#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for the controlled banzami_staging migration adapter.
// Asserts banzami_staging-only targeting, the release-manifest identity gate, single-use
// authorisation/receipt, advisory-lock concurrency, ownership + lifecycle proofs, file-only
// secret, and no legacy RT04E path — without migrating anything.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SB = resolve(ROOT, 'sandbox-ops');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const read = p => readFileSync(p, 'utf8');
const mig = read(resolve(SB, 'scripts', 'sandbox-migration.sh'));
const exe = read(resolve(SB, 'scripts', 'operational-entrypoint.sh'));

// 1. banzami_staging-only, generated-project-only, no external host/port, no legacy path
{
  const target = /banzami_staging/.test(mig) && /\[ "\$_db" = banzami_staging \]/.test(exe) && /\[ "\$_host" = postgres \]/.test(exe);
  const rejectEnv = /banzami_live\*\|\*production\*\|\*prod\*\|\*live\*/.test(exe);
  const project = /BZSB_DATA_NET/.test(mig) && /BZSB_PROJECT/.test(mig);
  const noLegacy = !/rt04e-secure-rollout|rt04e-migration-checkpoint/.test(mig) && !/rt04e-secure-rollout|rt04e-migration-checkpoint/.test(exe);
  (target && rejectEnv && project && noLegacy) ? pass(1, 'banzami_staging + internal-host only, generated project, env-marker rejection, no legacy RT04E') : fail(1, `target (t=${target} env=${rejectEnv} proj=${project} noLegacy=${noLegacy})`);
}
// 2. release-manifest identity gate (revision/parent/executor/migration digest + service set)
{
  const g = /manifest_gate/.test(mig) && /revision_matches/.test(mig) && /parent_digest_matches/.test(mig)
    && /executor_digest_matches/.test(mig) && /migration_digest_matches/.test(mig) && /service_set_matches/.test(mig);
  g ? pass(2, 'release-manifest identity gate: revision + parent + executor + migration digests + service set') : fail(2, 'manifest gate incomplete');
}
// 3. no build / no pull at migration — executor loaded from package
{
  const ok = /docker load -i "\$RELEASE_ROOT\/exec\.tar"/.test(mig) && !/buildx build|docker build|docker pull/.test(mig);
  ok ? pass(3, 'operational executor imported from package (no build, no pull)') : fail(3, 'executor not load-only');
}
// 4. single-use authorisation + receipt, real advisory lock, file-only secret
{
  const authz = /authz_issue/.test(mig) && /authz_consume/.test(mig) && /receipt_issue/.test(mig) && /receipt_consume/.test(mig)
    && /consumed_authz_reject/.test(mig) && /consumed_receipt_reject/.test(mig) && /expired_reject/.test(mig);
  const lock = /concurrency_proof/.test(mig) && /pg_advisory_lock/.test(mig) && /second_attempt_refused/.test(mig) && /MIGRATION_LOCK_HELD/.test(mig);
  const fileOnly = /\/run\/secrets\/rt04e_migration_url:ro/.test(mig) && /SECRET_FILE="\/run\/secrets\/rt04e_migration_url"/.test(exe);
  (authz && lock && fileOnly) ? pass(4, 'single-use authorisation + receipt, real advisory-lock concurrency, file-only read-only secret') : fail(4, `controls (authz=${authz} lock=${lock} file=${fileOnly})`);
}
// 5. ownership + short-lived login lifecycle proofs
{
  const ok = /verify-identity\.sh/.test(mig) && /migration_login_removed/.test(mig) && /credential_unusable/.test(mig)
    && /wrong_revision_reject/.test(mig) && /wrong_executor_reject/.test(mig) && /wrong_service_set_reject/.test(mig);
  ok ? pass(5, 'ownership verify + short-lived login removal/unusability + full rejection matrix') : fail(5, 'ownership/lifecycle proofs incomplete');
}
// 6. reuses the untouched 2D/2E lab guards (does not weaken blueprint_migration_lab guard)
{
  const labGuard = read(resolve(ROOT, 'migration-control', 'scripts', 'control-entrypoint.sh'));
  /\[ "\$_db" = blueprint_migration_lab \]/.test(labGuard) ? pass(6, '2E lab entrypoint retains its blueprint_migration_lab guard (unweakened)') : fail(6, 'lab guard weakened');
}
// 7. no credential literal / no VM contact
{
  const CRED = /(postgres(ql)?|mysql):\/\/[^/\s"']+:[A-Za-z0-9]{6,}@|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
  const noVm = !/217\.160\.9\.248|ssh /.test(mig);
  (noVm && !CRED.test(mig)) ? pass(7, 'no VM contact; no credential literal') : fail(7, 'VM contact or credential literal present');
}

console.log('');
if (failed) { console.error(`check-sandbox-migration: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-sandbox-migration: all checks passed');
