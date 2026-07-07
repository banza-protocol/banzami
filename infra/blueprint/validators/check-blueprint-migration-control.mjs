#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for Increment 2E (migration control).
// Asserts single-use authorisation + receipt lifecycle, real advisory-lock concurrency,
// file-only secret execution, the rejection matrix and controlled failure path — no Docker.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MC = resolve(ROOT, 'migration-control');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const read = p => readFileSync(p, 'utf8');

const df = read(resolve(MC, 'Dockerfile.migrate-control'));
const compose = read(resolve(MC, 'docker-compose.migration-control.yml'));
const entry = read(resolve(MC, 'scripts', 'control-entrypoint.sh'));
const authz = read(resolve(MC, 'scripts', 'authz.sh'));
const orch = read(resolve(MC, 'scripts', 'migration-control.sh'));

// 1. control entrypoint: file-only secret, PGPASSFILE (no argv secret), real advisory lock, target guard
{
  const fileOnly = /SECRET_FILE="\/run\/secrets\/rt04e_migration_url"/.test(entry) && /DATABASE_URL must NOT be provided via environment/.test(entry);
  const noArgvSecret = /PGPASSFILE=/.test(entry) && !/psql "\$_url"/.test(entry) && !/-U .*\$_pw/.test(entry);
  const lock = /pg_try_advisory_lock/.test(entry) && /pg_advisory_unlock/.test(entry) && /LOCK_FIFO/.test(entry);
  const target = /\[ "\$_db" = blueprint_migration_lab \]/.test(entry);
  const failMode = /fail-after-lock/.test(entry) && /MIGRATION_LOCK_HELD/.test(entry);
  (fileOnly && noArgvSecret && lock && target && failMode) ? pass(1, 'control entrypoint: file-only secret via PGPASSFILE (no argv), real advisory lock, target guard, fail mode') : fail(1, `entry (file=${fileOnly} noArgv=${noArgvSecret} lock=${lock} target=${target} fail=${failMode})`);
}
// 2. attested derived executor: FROM base-runner, identity labels, non-root, control entrypoint
{
  const ok = /FROM base-runner/.test(df) && /migration-control\.parent-digest/.test(df) && /migrations-digest/.test(df)
    && /USER runner/.test(df) && /ENTRYPOINT \["\/usr\/local\/bin\/bz-migration-control-entrypoint"\]/.test(df);
  ok ? pass(2, 'attested control executor: FROM base-runner, identity labels, non-root, control entrypoint') : fail(2, 'derived df incomplete');
}
// 3. authz+receipt lifecycle: fixed banzami_staging target, single-use atomic consume, file-shape + secret-free
{
  const target = /AUTHZ_TARGET_FIXED="banzami_staging"/.test(authz);
  const atomic = /state=issued.*state=consumed/s.test(authz) && /mv -f "\$tmp" "\$f"/.test(authz);
  const singleUse = /not in issued state \(single-use\)/.test(authz);
  const fileShape = /_file_ok\(\)/.test(authz) && /hard-link/i.test(orch.length ? authz : authz) && /\[ ! -L "\$f" \]/.test(authz) && /'%l'/.test(authz);
  const secretFree = /grep -qiE 'password\|secret\|:\/\/\[\^ \]\*:\[\^ \]\*@/.test(authz);
  const bindings = /parent_digest/.test(authz) && /executor_digest/.test(authz) && /migration_digest/.test(authz) && /service_set/.test(authz) && /issued_epoch/.test(authz) && /expiry_epoch/.test(authz);
  (target && atomic && singleUse && fileShape && secretFree && bindings) ? pass(3, 'authz+receipt: banzami_staging-bound, single-use atomic consume, file-shape checks, secret-free, full identity bindings') : fail(3, `authz (target=${target} atomic=${atomic} single=${singleUse} file=${fileShape} secretFree=${secretFree} bind=${bindings})`);
}
// 4. compose: pg16 digest, internal, no host port, file-only secrets, reuses 2D bootstrap
{
  const ok = /image:\s*postgres@sha256:[0-9a-f]{64}/.test(compose) && /internal:\s*true/.test(compose)
    && !/(^|\n)\s*ports:/.test(compose) && /POSTGRES_PASSWORD_FILE:\s*\/run\/secrets\//.test(compose) && !/POSTGRES_PASSWORD:\s*\S/.test(compose)
    && /migration-identity\/scripts\/bootstrap-migration-login\.sh/.test(compose);
  ok ? pass(4, 'compose: pg16 digest-pinned, internal, no host port, file-only secrets, reuses 2D short-lived-login bootstrap') : fail(4, 'compose incomplete');
}
// 5. orchestrator proofs: issue/consume, reject matrix, real concurrency, failure path, fail-closed
{
  const issue = /authz_issue "\$STATEROOT"/.test(orch) && /receipt_issue "\$STATEROOT"/.test(orch);
  const consume = /authz_consume "\$A"/.test(orch) && /receipt_consume "\$R"/.test(orch) && /reconsume_rejected/.test(orch);
  const reject = /authz_reject_matrix/.test(orch) && /wrong_revision/.test(orch) && /wrong_executor_digest/.test(orch) && /wrong_service_set/.test(orch) && /expired_record/.test(orch) && /future_issued/.test(orch) && /REJECT symlink/.test(orch);
  const concurrency = /concurrency_proof/.test(orch) && /pg_advisory_lock/.test(orch) && /second_attempt_refused/.test(orch) && /MIGRATION_LOCK_HELD/.test(orch);
  const failure = /failure_path_proof/.test(orch) && /receipt_stays_consumed/.test(orch) && /fail-after-lock/.test(orch);
  const failClosed = !/system prune|image prune|builder prune|volume prune|network prune/.test(orch) && /safe_rm_root/.test(orch) && /^unset COMPOSE_PROJECT_NAME DATABASE_URL/m.test(orch) && /worktree not clean/.test(orch);
  (issue && consume && reject && concurrency && failure && failClosed) ? pass(5, 'orchestrator: issue/consume + single-use, reject matrix, REAL advisory-lock concurrency, failure-keeps-receipt-consumed, fail-closed') : fail(5, `orch (issue=${issue} consume=${consume} reject=${reject} conc=${concurrency} fail=${failure} closed=${failClosed})`);
}
// 6. no credential literal
{
  const CRED = /(postgres(ql)?|mysql):\/\/[^/\s"']+:[A-Za-z0-9]{6,}@|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
  [df, compose, entry, authz, orch].some(f => CRED.test(f)) ? fail(6, 'credential literal present') : pass(6, 'no credential literal in migration-control source');
}

console.log('');
if (failed) { console.error(`check-blueprint-migration-control: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-blueprint-migration-control: all checks passed');
