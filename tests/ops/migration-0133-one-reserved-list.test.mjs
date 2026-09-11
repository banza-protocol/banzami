/**
 * Migration 0133: every name Core reserves is a SYSTEM row in the one @banza
 * registry — the list Business applications check — and the registry's own
 * seed is reserved by Core too. Two lists let a Business apply for @bna.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0133-one-reserved-list.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
let db; let url;
const psql = (sql) => execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { encoding: 'utf8' }).trim();
const core = [...readFileSync(join(REPO, 'core/identity/src/identity.rs'), 'utf8')
  .match(/const RESERVED_HANDLES[^;]+;/)[0].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);

describe('migration 0133', () => {
  before(() => {
    db = `bz_0133_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]);
    execFileSync('psql', [ADMIN, '-Atc', `CREATE DATABASE ${db}`]);
    execFileSync('sqlx', ['migrate', 'run', '--source', join(REPO, 'db/migrations'), '-D', url], { cwd: REPO, stdio: 'pipe' });
  });
  after(() => execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]));

  it('every name Core reserves is a SYSTEM row in the registry', () => {
    const system = new Set(psql(`SELECT handle FROM handle_registry WHERE owner_type = 'SYSTEM'`).split('\n'));
    const missing = core.filter((n) => !system.has(n));
    assert.deepEqual(missing, [], `reserved by Core but free in the registry: ${missing}`);
  });

  it('every SYSTEM row is reserved by Core too', () => {
    const system = psql(`SELECT handle FROM handle_registry WHERE owner_type = 'SYSTEM'`).split('\n');
    const missing = system.filter((n) => !core.includes(n));
    assert.deepEqual(missing, [], `reserved in the registry but not by Core: ${missing}`);
  });
});
