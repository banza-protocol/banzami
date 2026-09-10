/**
 * Migrations 0121 and 0123: an application names its origin, a Project
 * application names its Project, a Project has one application in progress,
 * and — once 0123 lands — no writer can leave the origin to a default.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0121-0123-application-origin.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const MIG = join(REPO, 'db/migrations');
let db; let url;
const psql = (sql) => execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const insert = (id, handle, extra = '', vals = '') =>
  psql(`INSERT INTO merchant_applications (id, status, environment, desired_handle, business_name, email${extra})
        VALUES ('${id}', 'SUBMITTED', 'SANDBOX', '${handle}', 'L', '${handle}@x.test'${vals})`);

describe('migrations 0121 + 0123', () => {
  before(() => {
    db = `bz_0123_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]);
    execFileSync('psql', [ADMIN, '-Atc', `CREATE DATABASE ${db}`]);
    execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', '120', '-D', url], { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
    insert('10000000-0000-4000-8000-000000000001', 'legacy');
    execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', '122', '-D', url], { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
  });
  after(() => { try { execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]); } catch { /* best effort */ } });

  it('files every existing application as the public form', () => {
    assert.equal(psql(`SELECT origin FROM merchant_applications WHERE desired_handle='legacy'`), 'STANDALONE_BUSINESS');
  });
  it('a Project application names its Project, and a public one never does', () => {
    assert.throws(() => insert('10000000-0000-4000-8000-000000000002', 'p1', ', origin', ", 'DEVELOPER_PROJECT'"), /project_origin_coherent/);
    assert.throws(() => insert('10000000-0000-4000-8000-000000000003', 'p2', ', origin, project_id', ", 'STANDALONE_BUSINESS', gen_random_uuid()"), /project_origin_coherent/);
  });
  it('a Project has one application in progress', () => {
    const p = '20000000-0000-4000-8000-000000000001';
    insert('10000000-0000-4000-8000-000000000004', 'p3', ', origin, project_id', `, 'DEVELOPER_PROJECT', '${p}'`);
    assert.throws(() => insert('10000000-0000-4000-8000-000000000005', 'p4', ', origin, project_id', `, 'DEVELOPER_PROJECT', '${p}'`), /uq_merchant_applications_open_per_project/);
    psql(`UPDATE merchant_applications SET status='REJECTED' WHERE id='10000000-0000-4000-8000-000000000004'`);
    insert('10000000-0000-4000-8000-000000000005', 'p4', ', origin, project_id', `, 'DEVELOPER_PROJECT', '${p}'`);
  });
  it('waiting for information needs the request', () => {
    assert.throws(() => psql(`UPDATE merchant_applications SET status='INFORMATION_REQUIRED' WHERE desired_handle='legacy'`), /information_request_coherent/);
  });
  it('before 0123 a writer may omit the origin; after it, it may not', () => {
    insert('10000000-0000-4000-8000-000000000006', 'noorigin');
    execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', '123', '-D', url], { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
    assert.throws(() => insert('10000000-0000-4000-8000-000000000007', 'noorigin2'), /null value in column "origin"/);
  });
});
