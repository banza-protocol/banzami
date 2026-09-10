/**
 * Migration 0122 makes merchants.verified a projection of the one KYB
 * authority, merchant_compliance.kyb_status.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0122-kyb-single-authority.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const MIG = join(REPO, 'db/migrations');
const FILE = join(MIG, '0122_kyb_single_authority.sql');
let db; let url;
const psql = (sql) => execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const A = 'a1000000-0000-4000-8000-000000000001'; // KYB approved, badge off (the @doa case)
const B = 'b1000000-0000-4000-8000-000000000001'; // badge on, no KYB decision
const C = 'c1000000-0000-4000-8000-000000000001'; // KYB rejected, badge on
const verified = (id) => psql(`SELECT verified FROM merchants WHERE id='${id}'`);

describe('migration 0122', () => {
  before(() => {
    db = `bz_0122_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]);
    execFileSync('psql', [ADMIN, '-Atc', `CREATE DATABASE ${db}`]);
    execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', '121', '-D', url], { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
    for (const [id, v] of [[A, false], [B, true], [C, true]]) {
      psql(`INSERT INTO merchants (id,name,email,status,business_account_type,created_at,updated_at,verified)
            VALUES ('${id}','M','${id}@x.test','ACTIVE','MERCHANT',now(),now(),${v})`);
    }
    psql(`INSERT INTO merchant_compliance (merchant_id,kyb_status,aml_status) VALUES ('${A}','APPROVED','APPROVED'),('${C}','REJECTED','PENDING')`);
    execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', FILE], { stdio: ['ignore', 'pipe', 'pipe'] });
  });
  after(() => { try { execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]); } catch { /* best effort */ } });

  it('backfills the badge from the KYB decision, in both directions', () => {
    assert.equal(verified(A), 't');
    assert.equal(verified(B), 'f');
    assert.equal(verified(C), 'f');
  });
  it('a KYB decision rewrites the badge', () => {
    psql(`UPDATE merchant_compliance SET kyb_status='SUSPENDED' WHERE merchant_id='${A}'`);
    assert.equal(verified(A), 'f');
    psql(`INSERT INTO merchant_compliance (merchant_id,kyb_status,aml_status) VALUES ('${B}','APPROVED','PENDING')`);
    assert.equal(verified(B), 't');
  });
  it('no writer can set the badge against the decision', () => {
    psql(`UPDATE merchants SET verified=true WHERE id='${C}'`);
    assert.equal(verified(C), 'f');
    psql(`UPDATE merchants SET verified=false WHERE id='${B}'`);
    assert.equal(verified(B), 't');
  });
  it('a new Business starts unverified whatever the insert says', () => {
    const D = 'd1000000-0000-4000-8000-000000000001';
    psql(`INSERT INTO merchants (id,name,email,status,business_account_type,created_at,updated_at,verified)
          VALUES ('${D}','M','${D}@x.test','ACTIVE','MERCHANT',now(),now(),true)`);
    assert.equal(verified(D), 'f');
  });
});
