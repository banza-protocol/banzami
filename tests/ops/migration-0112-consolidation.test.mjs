/**
 * Migration 0112 moves a handle between merchants. Nothing proved it ever ran.
 *
 * `tools/ci/fresh-migration-check.sh` applies the whole chain to an empty
 * database, which is why it passed while 0112 was broken: with no sealed
 * Doa-Sandbox binding present the migration short-circuits at its first NOTICE
 * and returns before reaching a single write. Every data-dependent branch —
 * the preconditions, the move, the retirement, the profile cleanup — was
 * unreachable in CI and first executed against the live Sandbox, where it
 * failed on a not-null constraint.
 *
 * So this seeds the state the migration is actually written for and runs it
 * there. The mutation cases matter as much as the happy path: a fail-closed
 * precondition that has never been observed refusing is not known to refuse.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0112-consolidation.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const MIG = join(REPO, 'db/migrations');
const SQL_0112 = readFileSync(join(MIG, '0112_consolidate_doa_handle.sql'), 'utf8');

const OLD = 'a0000000-0000-4000-8000-000000000001'; // historical owner, holds the name
const NEW = 'b0000000-0000-4000-8000-000000000002'; // canonical owner, sealed binding
const PROJ = 'c0000000-0000-4000-8000-000000000003';
const WS = 'd0000000-0000-4000-8000-000000000004';
const PROJ2 = 'c0000000-0000-4000-8000-00000000000f';
const USER_ID = 'e0000000-0000-4000-8000-000000000005';
const HANDLE = 'doa';
const GENERATED = 'p0000000000ab';

let tmplName;
let url;
const created = [];

const psql = (target, sql, opts = {}) =>
  execFileSync('psql', [target, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** Run 0112 and return {ok, message} rather than throwing, so refusals are assertable. */
function run0112() {
  try {
    execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', join(MIG, '0112_consolidate_doa_handle.sql')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, message: '' };
  } catch (e) {
    return { ok: false, message: `${e.stderr ?? ''}${e.stdout ?? ''}` };
  }
}

/**
 * Seed the pre-move world: the old merchant owns the name and a public profile,
 * the new one owns the sealed binding and a generated handle. Written fresh for
 * each case so a mutation cannot leak into the next test.
 */
function seed() {
  psql(url, `
    INSERT INTO merchants (id, name, email)
    VALUES ('${OLD}', 'Historical DOA', 'old@example.test'),
           ('${NEW}', 'Doa Sandbox',    'new@example.test');

    INSERT INTO handle_registry (handle, owner_type, owner_id, created_at)
    VALUES ('${HANDLE}', 'MERCHANT', '${OLD}', now()),
           ('${GENERATED}', 'MERCHANT', '${NEW}', now());

    INSERT INTO merchant_profiles (merchant_id, handle, display_name)
    VALUES ('${OLD}', '${HANDLE}', 'Historical DOA');

    INSERT INTO developer.dev_workspaces (id, name, slug, created_by)
    VALUES ('${WS}', 'Test WS', 'test-ws-0112', '${USER_ID}');

    INSERT INTO developer.dev_projects (id, workspace_id, name, slug)
    VALUES ('${PROJ}', '${WS}', 'Doa-Sandbox', 'doa-sandbox');

    INSERT INTO developer.dev_project_sandbox_binding
      (project_id, merchant_id, state, artifact_created, wallet_id, wallet_account_id, created_by_user_id)
    VALUES ('${PROJ}', '${NEW}', 'ACTIVE', true, gen_random_uuid(), gen_random_uuid(), '${USER_ID}');
  `);
}

/**
 * Each case gets its own database cloned from the migrated template.
 *
 * Re-seeding by DELETE is not available here and should not be: the sealed
 * binding this migration depends on refuses deletion (ADR-055), which is the
 * guard working. Cloning sidesteps it without weakening it, and gives each
 * mutation total isolation from the last.
 */
function freshCase(name) {
  url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${name}$1`);
  psql(ADMIN, `DROP DATABASE IF EXISTS ${name}`);
  psql(ADMIN, `CREATE DATABASE ${name} TEMPLATE ${tmplName}`);
  created.push(name);
  seed();
}

const registryOwner = (h) =>
  psql(url, `SELECT coalesce(owner_id::text,'<null>')||'|'||owner_type FROM handle_registry WHERE handle='${h}'`, { capture: true }).trim();

describe('migration 0112 — @handle consolidation between merchants', () => {
  before(() => {
    tmplName = `bz_0112_tmpl_${process.pid}`;
    const tmplUrl = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${tmplName}$1`);
    psql(ADMIN, `DROP DATABASE IF EXISTS ${tmplName}`);
    psql(ADMIN, `CREATE DATABASE ${tmplName}`);
    // Chain up to 0111 only: 0112 is the subject under test, run explicitly per case.
    execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', '111', '-D', tmplUrl], {
      cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'],
    });
  });

  after(() => {
    for (const d of created) { try { psql(ADMIN, `DROP DATABASE IF EXISTS ${d}`); } catch { /* best effort */ } }
    try { psql(ADMIN, `DROP DATABASE IF EXISTS ${tmplName}`); } catch { /* best effort */ }
  });

  it('moves the handle to the sealed binding owner', () => {
    freshCase('bz_0112_move');
    const r = run0112();
    assert.ok(r.ok, `0112 failed: ${r.message}`);
    assert.equal(registryOwner(HANDLE), `${NEW}|MERCHANT`);
  });

  it('retires the generated handle instead of leaving an alias', () => {
    freshCase('bz_0112_retire');
    assert.ok(run0112().ok);
    // Reserved to SYSTEM with no owner: it can never be re-issued and inherit
    // this merchant's history, and the identity has exactly one live name.
    assert.equal(registryOwner(GENERATED), '<null>|SYSTEM');
  });

  it('leaves no public profile claiming a name the resolver points elsewhere', () => {
    freshCase('bz_0112_profile');
    assert.ok(run0112().ok);
    const stale = psql(url,
      `SELECT count(*) FROM merchant_profiles WHERE merchant_id='${OLD}' AND handle='${HANDLE}'`,
      { capture: true }).trim();
    assert.equal(stale, '0', 'the retired owner still publishes the moved handle');
  });

  it('is idempotent — a second run is a no-op, not a second move', () => {
    freshCase('bz_0112_idem');
    assert.ok(run0112().ok);
    const again = run0112();
    assert.ok(again.ok, `re-run failed: ${again.message}`);
    assert.equal(registryOwner(HANDLE), `${NEW}|MERCHANT`);
  });

  // ── mutation proofs: each precondition must refuse, and for its own reason ──

  it('refuses when the current owner still holds an unrevoked credential', () => {
    freshCase('bz_0112_key');
    psql(url, `INSERT INTO api_keys (id, merchant_id, name, key_hash, key_prefix)
               VALUES (gen_random_uuid(), '${OLD}', 'test key', 'x', 'bz_test_')`);
    const r = run0112();
    assert.ok(!r.ok, 'moved a handle away from an owner that can still authenticate');
    assert.match(r.message, /unrevoked API credential/i);
    assert.equal(registryOwner(HANDLE), `${OLD}|MERCHANT`, 'refusal must not leave a partial move');
  });

  it('refuses when the current owner still holds an ACTIVE project binding', () => {
    freshCase('bz_0112_bind');
    psql(url, `
      INSERT INTO developer.dev_projects (id, workspace_id, name, slug)
      VALUES ('${PROJ2}', '${WS}', 'Legacy Doa', 'legacy-doa');
      INSERT INTO developer.dev_project_sandbox_binding
        (project_id, merchant_id, state, artifact_created, wallet_id, wallet_account_id, created_by_user_id)
      VALUES ('${PROJ2}', '${OLD}', 'ACTIVE', false, gen_random_uuid(), gen_random_uuid(), '${USER_ID}');`);
    const r = run0112();
    assert.ok(!r.ok, 'moved a handle away from an owner with live authority');
    assert.match(r.message, /ACTIVE Project binding/i);
    assert.equal(registryOwner(HANDLE), `${OLD}|MERCHANT`);
  });

  it('refuses when there is no sealed Doa-Sandbox binding to move the name to', () => {
    freshCase('bz_0112_notarget');
    psql(url, `UPDATE developer.dev_projects SET name='Something Else', slug='something-else' WHERE id='${PROJ}'`);
    const r = run0112();
    // No target resolves, so the migration returns without moving anything. The
    // handle staying put IS the assertion: it must never fall back to a guess.
    assert.ok(r.ok);
    assert.equal(registryOwner(HANDLE), `${OLD}|MERCHANT`);
  });
});
