#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for Increment 2D (migration identity).
// Reproducible, no-Docker gate: asserts derived-executor attestation/linkage, the
// short-lived least-privilege migration-login lifecycle, owner-session separation,
// file-only secret delivery and fail-closed cleanup — without running anything.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MI = resolve(ROOT, 'migration-identity');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const read = p => readFileSync(p, 'utf8');

const df = read(resolve(MI, 'Dockerfile.migrate-attested'));
const compose = read(resolve(MI, 'docker-compose.migration-identity.yml'));
const boot = read(resolve(MI, 'scripts', 'bootstrap-migration-login.sh'));
const orch = read(resolve(MI, 'scripts', 'migration-identity.sh'));
const vid = read(resolve(MI, 'scripts', 'verify-identity.sh'));
const eviv = read(resolve(MI, 'scripts', 'validate-derived-evidence.mjs'));

// 1. attested derived Dockerfile: FROM base-runner, records own identity labels, non-root
{
  const fromBase = /FROM base-runner/.test(df);
  const labels = /org\.opencontainers\.image\.revision/.test(df) && /parent-digest/.test(df) && /migrations-digest/.test(df) && /dockerfile-digest/.test(df);
  const nonRoot = /USER runner/.test(df) && /ENTRYPOINT \["\/usr\/local\/bin\/bz-migration-lab-entrypoint"\]/.test(df);
  (fromBase && labels && nonRoot) ? pass(1, 'attested derived Dockerfile: FROM base-runner, records revision/parent/migration/dockerfile identity, non-root') : fail(1, `derived df (from=${fromBase} labels=${labels} nonRoot=${nonRoot})`);
}
// 2. orchestrator: oci-layout parent context + captured parent content digest + SBOM + provenance
{
  const ociCtx = /--build-context "base-runner=oci-layout:\/\/\$RUNNER_OCI@\$PARENT_DIGEST"/.test(orch);
  const capture = /capture_parent_digest/.test(orch) && /could not capture immutable parent content digest/.test(orch);
  const attest = /--sbom=true/.test(orch) && /--provenance=mode=max/.test(orch);
  (ociCtx && capture && attest) ? pass(2, 'derived built from oci-layout parent (content-digest pinned) with own SBOM + provenance') : fail(2, `orch attest (oci=${ociCtx} capture=${capture} attest=${attest})`);
}
// 3. parent digest is an immutable content digest, not a tag-only reference
{
  const immutable = /case "\$PARENT_DIGEST" in sha256:\*\)/.test(orch);
  const noTagOnly = !/oci-layout:\/\/\$RUNNER_OCI"/.test(orch); // must include @digest
  (immutable && noTagOnly) ? pass(3, 'parent reference is an immutable content digest (no tag-only parent identity)') : fail(3, 'parent digest not enforced immutable');
}
// 4. compose pg16 digest-pinned, internal, no host port, disposable db, file-only secrets
{
  const dig = /image:\s*postgres@sha256:[0-9a-f]{64}/.test(compose);
  const internal = /internal:\s*true/.test(compose);
  const noPort = !/(^|\n)\s*ports:/.test(compose);
  const db = /POSTGRES_DB:\s*blueprint_migration_lab/.test(compose) && !/POSTGRES_DB:\s*(banzami_staging|banzami_live|live|prod|production)\b/.test(compose);
  const fileSec = /file:\s*\$\{BZMI_SECRET_DIR/.test(compose) && /POSTGRES_PASSWORD_FILE:\s*\/run\/secrets\//.test(compose) && !/POSTGRES_PASSWORD:\s*\S/.test(compose);
  (dig && internal && noPort && db && fileSec) ? pass(4, 'pg16 digest-pinned, internal, no host port, disposable db, file-only secrets') : fail(4, `compose (dig=${dig} internal=${internal} noPort=${noPort} db=${db} fileSec=${fileSec})`);
}
// 5. short-lived login: LOGIN, CONNECTION LIMIT 1, VALID UNTIL, restricted, owner-member; runtime/control NOT owner members; no superuser apply; no blanket grant
{
  const login = /CREATE ROLE bl_migration LOGIN[\s\S]*?NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/.test(boot);
  const limits = /CONNECTION LIMIT 1/.test(boot) && /VALID UNTIL :'valid_until'/.test(boot);
  const ownerMember = /GRANT bl_schema_owner TO bl_migration/.test(boot) && /SET role = 'bl_schema_owner'/.test(boot);
  const notMembers = !/GRANT bl_schema_owner TO bl_app_runtime/.test(boot) && !/GRANT bl_schema_owner TO bl_control_plane/.test(boot);
  const noGrantAll = !/GRANT\s+ALL/i.test(boot);
  const nologinOwner = /CREATE ROLE bl_schema_owner NOLOGIN/.test(boot);
  (login && limits && ownerMember && notMembers && noGrantAll && nologinOwner) ? pass(5, 'short-lived login: LOGIN/CONN LIMIT 1/VALID UNTIL/restricted, sole owner-member; runtime+control not owner members; no blanket grant') : fail(5, `bootstrap (login=${login} limits=${limits} member=${ownerMember} notMembers=${notMembers} noAll=${noGrantAll} nologin=${nologinOwner})`);
}
// 6. lifecycle proofs: authenticate, remove, membership-gone, credential-unusable
{
  const ok = /migration_login_authenticates/.test(orch) && /DROP ROLE IF EXISTS bl_migration/.test(orch)
    && /migration_login_removed/.test(orch) && /no_membership_remains/.test(orch) && /credential_unusable_after_cleanup/.test(orch);
  ok ? pass(6, 'lifecycle proofs: authenticate → remove → membership-gone → credential-unusable') : fail(6, 'lifecycle proofs incomplete');
}
// 7. verifier separation: runtime/control not owner members; only migration is; least-privilege attrs
{
  const ok = /runtime_control_not_owner_members/.test(vid) && /migration_login_is_owner_member/.test(vid)
    && /migration_login_least_privilege/.test(vid) && /migration_login_conn_limit_1/.test(vid) && /migration_login_valid_until_set/.test(vid)
    && /no_foreign_role_owns_objects/.test(vid);
  const derived = /EXPECT_COUNT/.test(vid) && !/\b97\b/.test(vid) && !/\b97\b/.test(orch);
  (ok && derived) ? pass(7, 'verifier proves privilege separation + least-privilege + no hardcoded count') : fail(7, `verifier (ok=${ok} derived=${derived})`);
}
// 8. evidence validator asserts derived SBOM+provenance + parent/revision/migration linkage + no secret
{
  const ok = /derived_sbom_present/.test(eviv) && /derived_provenance_present/.test(eviv)
    && /label_parent_digest_matches/.test(eviv) && /label_source_revision_matches/.test(eviv)
    && /label_embedded_migration_digest_matches/.test(eviv) && /derived_provenance_links_parent_digest/.test(eviv)
    && /derived_sbom_no_secret/.test(eviv) && /derived_provenance_no_secret/.test(eviv);
  ok ? pass(8, 'evidence validator: derived SBOM+provenance + parent/revision/migration linkage + secret-free') : fail(8, 'evidence validator incomplete');
}
// 9. fail-closed: no global prune, guarded removals, env cleared, clean worktree, full SHA
{
  const noPrune = !/system prune|image prune|builder prune|volume prune|network prune/.test(orch);
  const guarded = /safe_rm_root/.test(orch) && /refusing removal/.test(orch);
  const env = /^unset COMPOSE_PROJECT_NAME DATABASE_URL/m.test(orch);
  const clean = /worktree not clean/.test(orch); const sha = /revision not full SHA/.test(orch);
  const scoped = /buildx rm "\$RUNID"/.test(orch) && /image rm -f "\$DERIVED_TAG"/.test(orch);
  (noPrune && guarded && env && clean && sha && scoped) ? pass(9, 'fail-closed: no global prune, guarded removals, env cleared, clean tree, full SHA, scoped teardown') : fail(9, `fail-closed (prune=${noPrune} guard=${guarded} env=${env} clean=${clean} sha=${sha} scoped=${scoped})`);
}
// 10. no credential literal in source
{
  const CRED = /(postgres(ql)?|mysql):\/\/[^/\s"']+:[A-Za-z0-9]{6,}@|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(password|secret|token)\b[^\n:=]{0,12}[:=]\s*['"][A-Za-z0-9+/=]{10,}/i;
  [df, compose, boot, orch, vid, eviv, read(resolve(MI, 'scripts', 'lab-entrypoint.sh'))].some(f => CRED.test(f)) ? fail(10, 'credential literal present') : pass(10, 'no credential literal in migration-identity source');
}

console.log('');
if (failed) { console.error(`check-blueprint-migration-identity: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-blueprint-migration-identity: all checks passed');
