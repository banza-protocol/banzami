/**
 * Migration 0118 records how an approved application was resolved, and lets an
 * application claim an existing Business.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0118-application-resolution.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const MIG = join(REPO, 'db/migrations');
const FILE = join(MIG, '0118_business_application_resolution.sql');
let db; let url;
const psql = (target, sql) => execFileSync('psql', [target, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe('migration 0118', () => {
  before(() => {
    db = `bz_0118_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    psql(ADMIN, `DROP DATABASE IF EXISTS ${db}`);
    psql(ADMIN, `CREATE DATABASE ${db}`);
    execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', '117', '-D', url], { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
    psql(url, `INSERT INTO merchant_applications (id, status, environment, desired_handle, business_name, email, created_merchant_id)
               VALUES ('11111111-1111-4111-8111-111111111111','APPROVED','SANDBOX','shop','Shop','s@example.test','22222222-2222-4222-8222-222222222222'),
                      ('33333333-3333-4333-8333-333333333333','SUBMITTED','SANDBOX','other','Other','o@example.test',NULL)`);
    execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', FILE], { stdio: ['ignore', 'pipe', 'pipe'] });
  });
  after(() => { try { psql(ADMIN, `DROP DATABASE IF EXISTS ${db}`); } catch { /* best effort */ } });

  it('records every existing approval as provisioned new, and nothing else', () => {
    assert.equal(psql(url, `SELECT id||':'||COALESCE(resolution,'-') FROM merchant_applications ORDER BY id`).trim(),
      '11111111-1111-4111-8111-111111111111:PROVISIONED_NEW\n33333333-3333-4333-8333-333333333333:-');
  });
  it('an approval without a resolution is refused from now on', () => {
    assert.throws(() => psql(url, `UPDATE merchant_applications SET status='APPROVED' WHERE id='33333333-3333-4333-8333-333333333333'`),
      /merchant_applications_approved_has_resolution/);
  });
  it('a resolution outside the vocabulary is refused', () => {
    assert.throws(() => psql(url, `UPDATE merchant_applications SET resolution='MERGED' WHERE id='11111111-1111-4111-8111-111111111111'`), /check constraint/);
  });
  it('a submission key is unique', () => {
    psql(url, `UPDATE merchant_applications SET submit_idempotency_key='k' WHERE id='11111111-1111-4111-8111-111111111111'`);
    assert.throws(() => psql(url, `UPDATE merchant_applications SET submit_idempotency_key='k' WHERE id='33333333-3333-4333-8333-333333333333'`), /duplicate key/);
  });
});
