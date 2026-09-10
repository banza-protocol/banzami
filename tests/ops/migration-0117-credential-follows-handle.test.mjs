/**
 * Migration 0117 moves a Business App credential to the owner of its handle —
 * only when that cannot hijack anything.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0117-credential-follows-handle.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const MIG = join(REPO, 'db/migrations');
const FILE = join(MIG, '0117_business_credential_follows_its_handle.sql');

let tmplName; let url; const created = [];
const psql = (target, sql) => execFileSync('psql', [target, '-v', 'ON_ERROR_STOP=1', '-Atc', sql],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function run() {
  try { execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', FILE], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { ok: true, message: '' }; }
  catch (e) { return { ok: false, message: `${e.stderr ?? ''}${e.stdout ?? ''}` }; }
}
function freshCase(name) {
  url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${name}$1`);
  psql(ADMIN, `DROP DATABASE IF EXISTS ${name}`);
  psql(ADMIN, `CREATE DATABASE ${name} TEMPLATE ${tmplName}`);
  created.push(name);
}
const OLD = '11111111-1111-4111-8111-111111111111';
const NEW = '22222222-2222-4222-8222-222222222222';
// The shape 0112 left behind: the handle moved to NEW, its login stayed on OLD.
function seedDrift() {
  psql(url, `INSERT INTO merchants (id, name, email, status) VALUES
               ('${OLD}','Old','old@example.test','ACTIVE'), ('${NEW}','New','new@example.test','ACTIVE');
             INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('shop','MERCHANT','${NEW}');
             INSERT INTO merchant_app_credentials (merchant_id, environment, handle, pin_hash, activated_at, failed_attempts)
               VALUES ('${OLD}','SANDBOX','shop','$2a$04$x',now(),3);`);
}
const credOwner = () => psql(url, `SELECT merchant_id FROM merchant_app_credentials WHERE handle='shop'`).trim();

describe('migration 0117 — a Business credential follows its handle', () => {
  before(() => {
    tmplName = `bz_0117_tmpl_${process.pid}`;
    const t = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${tmplName}$1`);
    psql(ADMIN, `DROP DATABASE IF EXISTS ${tmplName}`);
    psql(ADMIN, `CREATE DATABASE ${tmplName}`);
    execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', '116', '-D', t],
      { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
  });
  after(() => {
    for (const d of created) { try { psql(ADMIN, `DROP DATABASE IF EXISTS ${d}`); } catch { /* best effort */ } }
    try { psql(ADMIN, `DROP DATABASE IF EXISTS ${tmplName}`); } catch { /* best effort */ }
  });

  it('moves the credential to the handle owner, audited, and keeps the PIN', () => {
    freshCase('bz_0117_move'); seedDrift();
    const r = run(); assert.ok(r.ok, r.message);
    assert.equal(credOwner(), NEW);
    assert.equal(psql(url, `SELECT pin_hash||'/'||failed_attempts FROM merchant_app_credentials WHERE handle='shop'`).trim(), '$2a$04$x/0');
    assert.equal(psql(url, `SELECT count(*) FROM audit_log WHERE action='BUSINESS_CREDENTIAL_REASSIGNED' AND subject='merchant:${NEW}'`).trim(), '1');
    assert.ok(run().ok, 'idempotent'); assert.equal(psql(url, `SELECT count(*) FROM audit_log WHERE action='BUSINESS_CREDENTIAL_REASSIGNED'`).trim(), '1');
  });

  it('refuses when the handle owner already has a credential', () => {
    freshCase('bz_0117_owner_has_cred'); seedDrift();
    psql(url, `INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('shop2','MERCHANT','${NEW}');
               INSERT INTO merchant_app_credentials (merchant_id, environment, handle) VALUES ('${NEW}','SANDBOX','shop2')`);
    const r = run(); assert.ok(!r.ok); assert.match(r.message, /already has a SANDBOX Business credential/);
    assert.equal(credOwner(), OLD);
  });

  it('refuses when the old merchant still owns another handle', () => {
    freshCase('bz_0117_old_has_handle'); seedDrift();
    psql(url, `INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('other','MERCHANT','${OLD}')`);
    const r = run(); assert.ok(!r.ok); assert.match(r.message, /still owns 1 handle/);
    assert.equal(credOwner(), OLD);
  });

  it('refuses when the handle owner is not ACTIVE', () => {
    freshCase('bz_0117_inactive'); seedDrift();
    psql(url, `UPDATE merchants SET status='SUSPENDED' WHERE id='${NEW}'`);
    const r = run(); assert.ok(!r.ok); assert.match(r.message, /is SUSPENDED, not ACTIVE/);
    assert.equal(credOwner(), OLD);
  });
});
