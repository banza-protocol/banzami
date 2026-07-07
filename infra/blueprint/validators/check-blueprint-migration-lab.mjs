#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for the Increment 2C migration lab.
//
// Reproducible, no-Docker static gate: asserts the disposable canonical-migration
// lab's isolation, immutable-build handoff, owner-session role model, file-only
// secret delivery, forbidden-target rejection, ownership verification coverage,
// and fail-closed cleanup — WITHOUT starting anything. Runtime proof is the
// migration-lab.sh execution.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ML = resolve(ROOT, 'migration-lab');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const read = p => readFileSync(p, 'utf8');

const compose = read(resolve(ML, 'docker-compose.migration-lab.yml'));
const derived = read(resolve(ML, 'Dockerfile.migrate'));
const entry = read(resolve(ML, 'scripts', 'lab-entrypoint.sh'));
const orch = read(resolve(ML, 'scripts', 'migration-lab.sh'));
const boot = read(resolve(ML, 'scripts', 'bootstrap-roles.sh'));
const vdb = read(resolve(ML, 'scripts', 'verify-db.sh'));

// 1. PostgreSQL 16 digest-pinned, no host port, internal labelled network, disposable db id
{
  const dig = /image:\s*postgres@sha256:[0-9a-f]{64}/.test(compose) && !/postgres:16-alpine\b(?!@)/.test(compose);
  const noPort = !/(^|\n)\s*ports:/.test(compose);
  const internal = /internal:\s*true/.test(compose);
  const dbid = /POSTGRES_DB:\s*blueprint_migration_lab/.test(compose)
    && !/POSTGRES_DB:\s*(banzami_staging|banzami_live|live|prod|production)\b/.test(compose);
  (dig && noPort && internal && dbid) ? pass(1, 'pg16 digest-pinned, no host port, internal labelled net, disposable db id') : fail(1, `compose props (dig=${dig} noPort=${noPort} internal=${internal} dbid=${dbid})`);
}

// 2. file-only secret interface in compose (no value env)
{
  const fileSecrets = /secrets:\s*[\s\S]*ml_superuser:\s*[\s\S]*file:/.test(compose);
  const fileEnv = /POSTGRES_PASSWORD_FILE:\s*\/run\/secrets\//.test(compose);
  const noValueEnv = !/POSTGRES_PASSWORD:\s*\S/.test(compose) && !/(^|\n)\s*(DATABASE_URL|PGPASSWORD):/.test(compose);
  (fileSecrets && fileEnv && noValueEnv) ? pass(2, 'file-only secret interface; no credential value env') : fail(2, 'secret interface not file-only');
}

// 3. derived image: FROM the 2B base runner, embeds migrations, non-root, labelled with revision + digest
{
  const fromBase = /FROM \$\{BASE_RUNNER\}/.test(derived);
  const embeds = /COPY migrations \/work\/db\/migrations/.test(derived);
  const nonRoot = /USER runner/.test(derived) && /ENTRYPOINT \["\/usr\/local\/bin\/bz-migration-lab-entrypoint"\]/.test(derived);
  const labels = /com\.banzami\.blueprint\.migration-lab/.test(derived) && /org\.opencontainers\.image\.revision/.test(derived) && /migrations-digest/.test(derived);
  (fromBase && embeds && nonRoot && labels) ? pass(3, 'derived image extends attested runner, embeds migrations, non-root, revision+digest labelled') : fail(3, `derived props (from=${fromBase} embed=${embeds} nonRoot=${nonRoot} labels=${labels})`);
}

// 4. lab entrypoint: file-only secret, rejects env, targets disposable db, rejects forbidden markers, embedded source
{
  const fileOnly = /SECRET_FILE="\/run\/secrets\/rt04e_migration_url"/.test(entry) && /DATABASE_URL must NOT be provided via environment/.test(entry);
  const target = /\[ "\$_db" = blueprint_migration_lab \]/.test(entry);
  const rejects = /banzami_staging\*\|\*banzami_live\*\|\*prod\*\|\*production\*\|\*live\*/.test(entry);
  const embedded = /EMBEDDED="\/work\/db\/migrations"/.test(entry) && /sqlx migrate run --source "\$EMBEDDED"/.test(entry);
  const drift = /run-drift/.test(entry) && /DRIFT NOT DETECTED/.test(entry);
  (fileOnly && target && rejects && embedded && drift) ? pass(4, 'lab entrypoint: file-only secret, disposable target, forbidden-marker rejection, embedded source, drift mode') : fail(4, `entrypoint props (file=${fileOnly} target=${target} reject=${rejects} embed=${embedded} drift=${drift})`);
}

// 5. owner-session bootstrap: NOLOGIN owner, restricted roles, membership + SET ROLE, no GRANT ALL, no superuser-apply
{
  const owner = /CREATE ROLE bl_schema_owner NOLOGIN/.test(boot);
  const restricted = /CREATE ROLE bl_app_runtime LOGIN[\s\S]*?NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/.test(boot)
    && /CREATE ROLE bl_control_plane LOGIN[\s\S]*?NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/.test(boot);
  const ownerSession = /GRANT bl_schema_owner TO bl_control_plane/.test(boot) && /SET role = 'bl_schema_owner'/.test(boot);
  const noGrantAll = !/GRANT\s+ALL/i.test(boot);
  (owner && restricted && ownerSession && noGrantAll) ? pass(5, 'owner-session bootstrap: NOLOGIN owner, restricted roles, membership+SET ROLE, no GRANT ALL') : fail(5, `bootstrap props (owner=${owner} restricted=${restricted} session=${ownerSession} noAll=${noGrantAll})`);
}

// 6. orchestrator fail-closed: clean tree, full SHA, no global prune, guarded removals, 2B handoff, env cleared, forbidden target
{
  const cleanTree = /git status --porcelain.*refusing|worktree not clean/.test(orch);
  const fullSha = /full 40-char SHA/.test(orch);
  const noPrune = !/system prune|image prune|builder prune|volume prune|network prune/.test(orch);
  const guarded = /safe_rm_root/.test(orch) && /refusing removal/.test(orch);
  const handoff = /\$RUNNER_LAB" build/.test(orch) && /\$RUNNER_LAB" verify/.test(orch);
  const envCleared = /^unset COMPOSE_PROJECT_NAME DATABASE_URL/m.test(orch);
  (cleanTree && fullSha && noPrune && guarded && handoff && envCleared) ? pass(6, 'orchestrator fail-closed: clean tree, full SHA, no prune, guarded removals, 2B build+verify handoff, env cleared') : fail(6, `orch props (clean=${cleanTree} sha=${fullSha} noPrune=${noPrune} guarded=${guarded} handoff=${handoff} env=${envCleared})`);
}

// 7. no superuser used to APPLY migrations (migration URL uses control-plane, not superuser)
{
  const controlUrl = /bl_control_plane:%s@/.test(orch);
  const applyDerived = /"\$DERIVED_TAG" run >/.test(orch);
  (controlUrl && applyDerived) ? pass(7, 'migrations applied via control-plane owner-session (no superuser apply)') : fail(7, 'migration apply path not owner-session');
}

// 8. ownership verifier covers relations/schemas/routines/types + foreign-role exclusion, narrow system exclusions
{
  const covers = /relations_owned_by_stable_owner/.test(vdb) && /schemas_owned_by_stable_owner/.test(vdb)
    && /routines_owned_by_stable_owner/.test(vdb) && /no_foreign_role_owns_objects/.test(vdb)
    && /metadata_owned_by_stable_owner/.test(vdb);
  const narrow = /pg_catalog','information_schema','pg_toast/.test(vdb) && /deptype='e'/.test(vdb) && !/DROP|TRUNCATE/.test(vdb);
  (covers && narrow) ? pass(8, 'ownership verifier covers relations/schemas/routines/types + foreign-role exclusion with narrow system/extension exclusions') : fail(8, `ownership coverage (covers=${covers} narrow=${narrow})`);
}

// 9. migration integrity verifier: count/level/pending/checksum from canonical-derived expectations
{
  const integ = /applied_count_matches/.test(vdb) && /latest_level_matches/.test(vdb)
    && /no_unsuccessful_migration/.test(vdb) && /all_checksums_present/.test(vdb) && /each_version_once/.test(vdb);
  const derivedExpect = /EXPECT_COUNT/.test(vdb) && /EXPECT_MAXVER/.test(vdb) && !/\b97\b/.test(vdb) && !/\b97\b/.test(orch);
  (integ && derivedExpect) ? pass(9, 'integrity verifier checks count/level/success/checksums/dupes from canonical-derived expectations (no hardcoded 97)') : fail(9, `integrity (checks=${integ} derived=${derivedExpect})`);
}

// 10. no credential literal in migration-lab source
{
  const CRED = /(postgres(ql)?|mysql):\/\/[^/\s"']+:[A-Za-z0-9]{6,}@|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(password|secret|token)\b[^\n:=]{0,12}[:=]\s*['"][A-Za-z0-9+/=]{10,}/i;
  const files = [compose, derived, entry, orch, boot, vdb];
  files.some(f => CRED.test(f)) ? fail(10, 'credential-like literal in migration-lab source') : pass(10, 'no credential literal in migration-lab source');
}

console.log('');
if (failed) { console.error(`check-blueprint-migration-lab: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-blueprint-migration-lab: all checks passed');
