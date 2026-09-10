/**
 * Migration 0124: the last two environment defaults go, and a writer that
 * omits the environment fails at the write.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0124-environment-defaults.test.mjs
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
const migrate = (v) => execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', String(v), '-D', url],
  { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const defaultOf = (schema, table) => psql(`SELECT coalesce(column_default, 'NONE') FROM information_schema.columns
  WHERE table_schema='${schema}' AND table_name='${table}' AND column_name='environment'`);

describe('migration 0124', () => {
  before(() => {
    db = `bz_0124_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]);
    execFileSync('psql', [ADMIN, '-Atc', `CREATE DATABASE ${db}`]);
    migrate(123);
  });
  after(() => { try { execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]); } catch { /* best effort */ } });

  it('before it, both columns carry a default', () => {
    assert.match(defaultOf('developer', 'dev_project_sandbox_binding'), /SANDBOX/);
    assert.match(defaultOf('public', 'platform_settings'), /GLOBAL/);
  });

  it('refuses while a platform setting is scoped to something other than GLOBAL', () => {
    psql(`INSERT INTO platform_settings (key, value, environment) VALUES ('probe', 'x', 'SANDBOX')`);
    try {
      // sqlx reports a failed migration on stdout.
      assert.throws(() => migrate(124), (e) => /non-GLOBAL row/.test(`${e.stdout}${e.stderr}`));
      assert.match(defaultOf('public', 'platform_settings'), /GLOBAL/, 'nothing changed');
    } finally {
      psql(`DELETE FROM platform_settings WHERE key = 'probe'`);
    }
  });

  it('then drops both defaults', () => {
    migrate(124);
    assert.equal(defaultOf('developer', 'dev_project_sandbox_binding'), 'NONE');
    assert.equal(defaultOf('public', 'platform_settings'), 'NONE');
  });

  it('a writer that omits the environment now fails; one that names it does not', () => {
    assert.throws(() => psql(`INSERT INTO platform_settings (key, value) VALUES ('silent', 'x')`), /null value in column "environment"/);
    psql(`INSERT INTO platform_settings (key, value, environment) VALUES ('named', 'x', 'GLOBAL')`);
  });

  it('leaves no environment column in the service schemas with a default', () => {
    assert.equal(psql(`SELECT count(*) FROM information_schema.columns
      WHERE column_name='environment' AND column_default IS NOT NULL
        AND table_schema IN ('public','developer','account_identity')`), '0');
  });
});
