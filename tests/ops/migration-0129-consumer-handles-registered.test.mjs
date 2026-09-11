/**
 * Migration 0129: a consumer missing from the @banza namespace is registered;
 * a name a Business already holds is left to it.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0129-consumer-handles-registered.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const MIG = join(REPO, 'db/migrations');
let db; let url;
const psql = (sql) => execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const migrate = (v) => execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', String(v), '-D', url],
  { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe('migration 0129', () => {
  const missing = randomUUID(); const clash = randomUUID(); const biz = randomUUID();
  before(() => {
    db = `bz_0129_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]);
    execFileSync('psql', [ADMIN, '-Atc', `CREATE DATABASE ${db}`]);
    migrate(128);
    psql(`INSERT INTO consumers (id, handle, status, created_at, updated_at) VALUES ('${missing}','sem_registo','ACTIVE',now(),now())`);
    psql(`INSERT INTO merchants (id, name, email, status) VALUES ('${biz}','B','${biz}@example.test','ACTIVE')`);
    psql(`INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('nome_da_loja','MERCHANT','${biz}')`);
    psql(`INSERT INTO consumers (id, handle, status, created_at, updated_at) VALUES ('${clash}','nome_da_loja','ACTIVE',now(),now())`);
    migrate(129);
  });
  after(() => execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]));

  it('registers the consumer that was missing', () => {
    assert.equal(psql(`SELECT owner_type || '|' || owner_id FROM handle_registry WHERE handle = 'sem_registo'`), `CONSUMER|${missing}`);
  });
  it('leaves a name a Business holds to the Business', () => {
    assert.equal(psql(`SELECT owner_type || '|' || owner_id FROM handle_registry WHERE handle = 'nome_da_loja'`), `MERCHANT|${biz}`);
  });
});
