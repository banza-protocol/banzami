#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for the concrete Sandbox bootstrap adapter.
// Asserts the isolated-topology, no-host-port, no-host-namespace, file-only-secret, role-model
// and fail-closed properties WITHOUT provisioning anything.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SB = resolve(ROOT, 'sandbox-ops');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const read = p => readFileSync(p, 'utf8');
const compose = read(resolve(SB, 'docker-compose.sandbox.yml'));
const orch = read(resolve(SB, 'scripts', 'sandbox-bootstrap.sh'));
const boot = read(resolve(SB, 'scripts', 'bootstrap-sandbox-roles.sh'));

// 1. digest-pinned pg16 + redis, banzami_staging target, NO host ports
{
  const pg = /image:\s*postgres@sha256:[0-9a-f]{64}/.test(compose) && /POSTGRES_DB:\s*banzami_staging/.test(compose);
  const redis = /image:\s*redis@sha256:[0-9a-f]{64}/.test(compose);
  const noPort = !/(^|\n)\s*ports:/.test(compose);
  (pg && redis && noPort) ? pass(1, 'digest-pinned pg16 + redis, banzami_staging target, no host-published ports') : fail(1, `topology (pg=${pg} redis=${redis} noPort=${noPort})`);
}
// 2. two internal isolated networks (data + app), labelled
{
  const nets = /sb_data:[\s\S]*internal:\s*true/.test(compose) && /sb_app:[\s\S]*internal:\s*true/.test(compose) && /com\.banzami\.blueprint\.sandbox/.test(compose);
  nets ? pass(2, 'separate internal data + app networks, labelled') : fail(2, 'internal networks incomplete');
}
// 3. no privileged / host namespaces / socket / host mounts; no-new-privileges
{
  const hardened = /no-new-privileges:true/.test(compose)
    && !/privileged:\s*true/.test(compose) && !/network_mode:\s*host/.test(compose) && !/pid:\s*host/.test(compose) && !/ipc:\s*host/.test(compose)
    && !/\/var\/run\/docker\.sock/.test(compose) && !/^\s*-\s*\/[^:]*:\/[^:]*$/m.test(compose.replace(/sb_pg:|sb_redis:/g, ''));
  hardened ? pass(3, 'no privileged/host-namespace/docker-socket/host-mount; no-new-privileges set') : fail(3, 'hardening incomplete');
}
// 4. file-only secrets (0700/0600, hard-link 1, no value env)
{
  const fileSec = /secrets:\s*[\s\S]*mi_superuser:\s*[\s\S]*file:/.test(compose) && /POSTGRES_PASSWORD_FILE:\s*\/run\/secrets\//.test(compose) && !/POSTGRES_PASSWORD:\s*\S/.test(compose);
  const genGuards = /chmod 0700/.test(orch) && /chmod 0600/.test(orch) && /hardlink!=1/.test(orch);
  (fileSec && genGuards) ? pass(4, 'file-only secrets; generator enforces 0700/0600 + single hard-link') : fail(4, `secrets (fileSec=${fileSec} guards=${genGuards})`);
}
// 5. role model: NOLOGIN owner + restricted runtime/control + short-lived migration login; no blanket grant; parameterised db
{
  const model = /CREATE ROLE bl_schema_owner NOLOGIN/.test(boot) && /CREATE ROLE bl_migration LOGIN[\s\S]*?NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/.test(boot)
    && /CONNECTION LIMIT :conn_limit/.test(boot) && /VALID UNTIL :'valid_until'/.test(boot) && /GRANT bl_schema_owner TO bl_migration/.test(boot);
  const paramDb = /:"db_name"/.test(boot) && !/blueprint_migration_lab/.test(boot);
  const noAll = !/GRANT\s+ALL/i.test(boot);
  (model && paramDb && noAll) ? pass(5, 'role model: NOLOGIN owner + restricted roles + short-lived migration login, banzami_staging-parameterised, no blanket grant') : fail(5, `role model (model=${model} paramDb=${paramDb} noAll=${noAll})`);
}
// 6. fail-closed orchestrator: profile check, generated identity, no global prune, guarded root removal, env cleared, override rejection
{
  const prof = /profile\.environment!=sandbox/.test(orch) && /profile db!=banzami_staging/.test(orch) && /profile publishes a host port/.test(orch);
  const gen = /new_identity\(\)/.test(orch) && /^unset COMPOSE_PROJECT_NAME DATABASE_URL/m.test(orch);
  const noPrune = !/system prune|image prune|builder prune|volume prune|network prune/.test(orch);
  const guarded = /safe_rm_root/.test(orch) && /refusing removal/.test(orch);
  const rejects = /rejects uncontrolled overrides/.test(orch);
  (prof && gen && noPrune && guarded && rejects) ? pass(6, 'fail-closed: profile-gated, generated identity, no global prune, guarded root removal, override rejection') : fail(6, `fail-closed (prof=${prof} gen=${gen} noPrune=${noPrune} guarded=${guarded} rejects=${rejects})`);
}
// 7. apply is not wired to the VM (rehearsal only) + no credential literal
{
  const noVm = !/217\.160\.9\.248|ssh /.test(orch);
  const CRED = /(postgres(ql)?|mysql):\/\/[^/\s"']+:[A-Za-z0-9]{6,}@|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
  (noVm && !CRED.test(orch) && !CRED.test(boot) && !CRED.test(compose)) ? pass(7, 'no VM contact in adapter; no credential literal') : fail(7, 'VM contact or credential literal present');
}

console.log('');
if (failed) { console.error(`check-sandbox-bootstrap: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-sandbox-bootstrap: all checks passed');
