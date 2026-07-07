#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for the Increment 2A runtime lab.
//
// Reproducible, no-Docker static gate over the lab source: it asserts the
// disposable-lab contract properties (digest-pinned Postgres 16, no host port,
// isolated labelled network/volume, read-only file secret interface, no
// credential literal, disposable non-Sandbox db identity, fail-closed lifecycle)
// WITHOUT starting any container. Runtime proof is the lab.sh execution itself.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LAB = resolve(ROOT, 'lab');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const read = p => readFileSync(p, 'utf8');

const compose = read(resolve(LAB, 'docker-compose.lab.yml'));
const lock = read(resolve(LAB, 'image.lock'));
const contract = JSON.parse(read(resolve(ROOT, 'contracts', 'lab-runtime.contract.json')));
const boot = read(resolve(LAB, 'scripts', 'bootstrap-roles.sh'));
const verify = read(resolve(LAB, 'scripts', 'verify-roles.sh'));
const gen = read(resolve(LAB, 'scripts', 'gen-lab-secrets.sh'));
const lab = read(resolve(LAB, 'scripts', 'lab.sh'));

const DIGEST_RE = /postgres@sha256:[0-9a-f]{64}/g;

// 1. Postgres image is digest-pinned in both the lock and the compose file
{
  const cd = compose.match(DIGEST_RE) || [];
  const ld = lock.match(DIGEST_RE) || [];
  if (cd.length && ld.length && new Set([...cd, ...ld]).size === 1) pass(1, 'postgres image digest-pinned and consistent (lock == compose)');
  else fail(1, 'postgres image digest missing or inconsistent between image.lock and compose');
}

// 2. No mutable tag reference for the database image
{
  const bad = /image:\s*postgres:(?!.*@sha256)/m.test(compose) || /image:\s*postgres:latest/m.test(compose);
  bad ? fail(2, 'mutable postgres tag referenced as an image') : pass(2, 'no mutable postgres image tag');
}

// 3. No host-published port for postgres (no ports: mapping anywhere in compose)
{
  /(^|\n)\s*ports:/.test(compose) ? fail(3, 'compose publishes a host port (forbidden)') : pass(3, 'no host-published port in lab compose');
}

// 4. Isolated, labelled, non-external network + labelled volume
{
  const okNet = /networks:\s*[\s\S]*labnet:/.test(compose) && /driver:\s*bridge/.test(compose)
    && !/external:\s*true/.test(compose) && /com\.banzami\.blueprint\.lab/.test(compose);
  okNet ? pass(4, 'isolated bridge network, labelled, not external') : fail(4, 'network not isolated/labelled/internal');
  const okVol = /volumes:\s*[\s\S]*pgdata:/.test(compose) && /com\.banzami\.blueprint\.lab.*[\s\S]*kind:\s*"?volume/.test(compose);
  okVol ? pass('4b', 'named volume present and labelled') : fail('4b', 'volume missing or unlabelled');
}

// 5. Read-only file secret interface; only *_FILE path env permitted; no value env
{
  const hasFileSecrets = /secrets:\s*[\s\S]*lab_pg_superuser:\s*[\s\S]*file:/.test(compose);
  const usesFileEnv = /POSTGRES_PASSWORD_FILE:\s*\/run\/secrets\//.test(compose);
  const hasValueEnv = /POSTGRES_PASSWORD:\s*\S/.test(compose) || /(^|\n)\s*(DATABASE_URL|PGPASSWORD):/.test(compose);
  (hasFileSecrets && usesFileEnv && !hasValueEnv)
    ? pass(5, 'read-only file secret interface; only *_FILE path env; no credential value env')
    : fail(5, 'secret interface not file-only (missing file secrets / value env present)');
}

// 6. No credential literal in any lab source file (paths/placeholders allowed)
{
  // a real credential-in-assignment: KEY=VALUE / KEY: VALUE where value begins alnum and is long
  const CRED = /\b(password|passwd|secret|token|apikey|api_key)\b[^\n:=]{0,20}[:=]\s*['"]?[A-Za-z0-9][A-Za-z0-9+/=]{11,}/i;
  const CREDURL = /(postgres(ql)?|mysql|redis|mongodb):\/\/[^/\s"']+:[^@\s"']+@/i;
  const offenders = [];
  for (const [name, txt] of [['compose', compose], ['bootstrap', boot], ['verify', verify], ['gen', gen], ['lab.sh', lab], ['image.lock', lock]]) {
    if (CRED.test(txt) || CREDURL.test(txt)) offenders.push(name);
  }
  offenders.length ? fail(6, `credential-like literal in: ${offenders.join(', ')}`) : pass(6, 'no credential literal in lab source');
}

// 7. Disposable, non-Sandbox/non-Live database identity
{
  const dbn = contract.database.local_disposable_db_name;
  const okName = dbn === 'blueprint_lab_local' && new RegExp(`POSTGRES_DB:\\s*${dbn}`).test(compose);
  const forbidden = ['banzami_staging', 'banzami_live', 'prod', 'production', 'live'];
  const leak = forbidden.some(f => new RegExp(`POSTGRES_DB:\\s*${f}\\b`).test(compose));
  (okName && !leak) ? pass(7, 'disposable non-Sandbox/non-Live db identity (blueprint_lab_local)') : fail(7, 'lab db identity invalid or collides with Sandbox/Live/prod');
}

// 8. Role bootstrap enforces the contract (NOLOGIN owner, restricted runtime, no GRANT ALL, no migration role)
{
  const okOwner = /CREATE ROLE bl_schema_owner NOLOGIN/.test(boot);
  const okRuntime = /CREATE ROLE bl_app_runtime LOGIN[\s\S]*NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/.test(boot);
  const owned = /CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION bl_schema_owner/.test(boot);
  const noGrantAll = !/GRANT\s+ALL/i.test(boot);
  const noMigrationRole = !/migration[_-]?role/i.test(boot) && !/bl_migration/.test(boot);
  const noCanonical = !/sqlx|migrate run|db\/migrations/i.test(boot);
  (okOwner && okRuntime && owned && noGrantAll && noMigrationRole && noCanonical)
    ? pass(8, 'bootstrap enforces role contract (NOLOGIN owner, restricted runtime, no GRANT ALL, no migration role, no canonical migrations)')
    : fail(8, 'bootstrap role contract violated');
}

// 9. Fail-closed lifecycle: identities generated internally; no global prune; no unscoped down -v
{
  const gen = /new_run_identity\(\)/.test(lab) && /unset COMPOSE_PROJECT_NAME/.test(lab);
  const noPrune = !/system\s+prune/.test(lab) && !/volume\s+prune/.test(lab) && !/network\s+prune/.test(lab);
  const scopedDown = /docker compose -f "\$COMPOSE_FILE" -p "\$BZLAB_PROJECT"/.test(lab);
  (gen && noPrune && scopedDown) ? pass(9, 'fail-closed lifecycle: generated identities, no global prune, project-scoped teardown') : fail(9, 'lifecycle not fail-closed');
}

// 10. Contract self-consistency: classification + not_proven list present
{
  const cls = contract.classification || [];
  const ok = ['local', 'disposable', 'synthetic', 'non-sandbox', 'non-live', 'non-production'].every(c => cls.includes(c))
    && Array.isArray(contract.not_proven_here) && contract.not_proven_here.length >= 5
    && contract.database.postgres_major_version === 16
    && contract.database.host_published_port === null;
  ok ? pass(10, 'lab contract self-consistent (classification, pg16, no host port, not-proven list)') : fail(10, 'lab contract inconsistent');
}

console.log('');
if (failed) { console.error(`check-blueprint-lab: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-blueprint-lab: all checks passed');
