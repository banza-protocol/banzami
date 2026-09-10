/**
 * Migration 0115 hands business-account classification back to the operator.
 *
 * A workaround had every developer-project Business promoted to APPLICATION —
 * the ADR-028 type that may take an application fee — by the provisioning path,
 * without any operator deciding it. This undoes exactly those rows and nothing
 * an operator chose. The cases prove the "exactly": an operator-classified
 * account survives, an account with no project binding survives, and a refusal
 * changes nothing.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0115-classification-revert.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const MIG = join(REPO, 'db/migrations');
const FILE = join(MIG, '0115_business_account_type_reverted_to_operator_decision.sql');

const AUTO = 'a1111111-1111-4111-8111-111111111111';     // bound, auto-promoted
const CHOSEN = 'b2222222-2222-4222-8222-222222222222';   // bound, operator-classified
const UNBOUND = 'c3333333-3333-4333-8333-333333333333';  // APPLICATION, no project
const PLAIN = 'd4444444-4444-4444-8444-444444444444';    // bound, already MERCHANT
const USER = 'e5555555-5555-4555-8555-555555555555';

let tmpl; let url; const created = [];
const psql = (t, sql) => execFileSync('psql', [t, '-v', 'ON_ERROR_STOP=1', '-Atc', sql],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function run() {
  try {
    execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', FILE], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, message: '' };
  } catch (e) { return { ok: false, message: `${e.stderr ?? ''}${e.stdout ?? ''}` }; }
}
const typeOf = (id) => psql(url, `SELECT business_account_type FROM merchants WHERE id='${id}'`).trim();

function seed() {
  const bind = (proj, m, n) => `
    INSERT INTO developer.dev_projects (id, workspace_id, name, slug)
      VALUES ('${proj}', 'f6666666-6666-4666-8666-666666666666', 'P${n}', 'p${n}-0115');
    INSERT INTO developer.dev_project_sandbox_binding
      (project_id, merchant_id, state, artifact_created, wallet_id, wallet_account_id, created_by_user_id)
      VALUES ('${proj}', '${m}', 'ACTIVE', false, gen_random_uuid(), gen_random_uuid(), '${USER}');`;
  psql(url, `
    INSERT INTO merchants (id, name, email, business_account_type) VALUES
      ('${AUTO}',    'Auto',    'auto@x.test',    'APPLICATION'),
      ('${CHOSEN}',  'Chosen',  'chosen@x.test',  'APPLICATION'),
      ('${UNBOUND}', 'Unbound', 'unbound@x.test', 'APPLICATION'),
      ('${PLAIN}',   'Plain',   'plain@x.test',   'MERCHANT');
    INSERT INTO developer.dev_workspaces (id, name, slug, created_by)
      VALUES ('f6666666-6666-4666-8666-666666666666', 'WS', 'ws-0115', '${USER}');
    ${bind('01111111-1111-4111-8111-111111111111', AUTO, 1)}
    ${bind('02222222-2222-4222-8222-222222222222', CHOSEN, 2)}
    ${bind('04444444-4444-4444-8444-444444444444', PLAIN, 4)}
    INSERT INTO admin_users (id, email, full_name, role)
      VALUES ('a7777777-7777-4777-8777-777777777777', 'op@x.test', 'Operator', 'SUPER_ADMIN');
    INSERT INTO admin_audit_log (id, admin_user_id, admin_email, role, action, entity_type, entity_id, status_code)
      VALUES (gen_random_uuid(), 'a7777777-7777-4777-8777-777777777777', 'op@x.test', 'SUPER_ADMIN', 'MERCHANT_BUSINESS_ACCOUNT_TYPE_CHANGED',
              'merchant', '${CHOSEN}', 200);`);
}
function freshCase(name) {
  url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${name}$1`);
  psql(ADMIN, `DROP DATABASE IF EXISTS ${name}`);
  psql(ADMIN, `CREATE DATABASE ${name} TEMPLATE ${tmpl}`);
  created.push(name); seed();
}

describe('migration 0115 — classification is an operator decision again', () => {
  before(() => {
    tmpl = `bz_0115_tmpl_${process.pid}`;
    const t = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${tmpl}$1`);
    psql(ADMIN, `DROP DATABASE IF EXISTS ${tmpl}`); psql(ADMIN, `CREATE DATABASE ${tmpl}`);
    execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', '114', '-D', t],
      { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
  });
  after(() => {
    for (const d of created) { try { psql(ADMIN, `DROP DATABASE IF EXISTS ${d}`); } catch { /* */ } }
    try { psql(ADMIN, `DROP DATABASE IF EXISTS ${tmpl}`); } catch { /* */ }
  });

  it('reverts an automated promotion and nothing an operator chose', () => {
    freshCase('bz_0115_revert');
    const r = run(); assert.ok(r.ok, r.message);
    assert.equal(typeOf(AUTO), 'MERCHANT', 'the automated promotion is withdrawn');
    assert.equal(typeOf(CHOSEN), 'APPLICATION', 'an operator decision survives');
    assert.equal(typeOf(UNBOUND), 'APPLICATION', 'an account with no Developer Project is out of scope');
    assert.equal(typeOf(PLAIN), 'MERCHANT');
  });

  it('writes what it reverted to the audit trail', () => {
    freshCase('bz_0115_audit');
    assert.ok(run().ok);
    const rows = psql(url, `SELECT subject || '|' || (metadata->>'from') FROM audit_log
                             WHERE action='BUSINESS_ACCOUNT_TYPE_CHANGED' AND actor='MIGRATION:0115' ORDER BY 1`).trim();
    assert.equal(rows, `merchant:${AUTO}|APPLICATION`);
  });

  it('is idempotent', () => {
    freshCase('bz_0115_idem');
    assert.ok(run().ok); const second = run();
    assert.ok(second.ok, second.message);
    assert.equal(Number(psql(url, `SELECT count(*) FROM audit_log WHERE action='BUSINESS_ACCOUNT_TYPE_CHANGED' AND actor='MIGRATION:0115'`)), 1);
  });

  it('refuses on a platform not declared SANDBOX, changing nothing', () => {
    freshCase('bz_0115_live');
    psql(url, `UPDATE platform_settings SET value='LIVE' WHERE key='platform_mode' AND environment='GLOBAL'`);
    const r = run();
    assert.ok(!r.ok); assert.match(r.message, /platform_mode is LIVE, not SANDBOX/);
    assert.equal(typeOf(AUTO), 'APPLICATION');
  });
});
