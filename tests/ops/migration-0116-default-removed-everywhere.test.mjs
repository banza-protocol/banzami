/**
 * Migration 0116 removes the fail-open environment default 0114 could not see.
 *
 * 0114 and its test looked only at `table_schema='public'`, so
 * developer.dev_project_business_link kept DEFAULT 'LIVE'. The assertion here
 * is schema-blind on purpose: after 0116, NO environment column anywhere may
 * default to a universe, except the two whose default cannot choose one —
 * platform_settings (a scope, 'GLOBAL') and dev_project_sandbox_binding (pinned
 * by CHECK environment = 'SANDBOX').
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0116-default-removed-everywhere.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const MIG = join(REPO, 'db/migrations');
const FILE = join(MIG, '0116_environment_default_removed_everywhere.sql');

let tmplName;
let url;
const created = [];

const psql = (target, sql) =>
  execFileSync('psql', [target, '-v', 'ON_ERROR_STOP=1', '-Atc', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function run0116() {
  try {
    execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', FILE],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, message: '' };
  } catch (e) {
    return { ok: false, message: `${e.stderr ?? ''}${e.stdout ?? ''}` };
  }
}

/** Every environment column, in any schema, whose default could pick a universe. */
const universeDefaults = () => psql(url,
  `SELECT c.table_schema || '.' || c.table_name
     FROM information_schema.columns c
    WHERE c.column_name = 'environment' AND c.column_default IS NOT NULL
      AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND (c.table_schema, c.table_name) NOT IN (('public', 'platform_settings'),
                                                 ('developer', 'dev_project_sandbox_binding'))
    ORDER BY 1`).trim().split('\n').filter(Boolean);

function freshCase(name) {
  url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${name}$1`);
  psql(ADMIN, `DROP DATABASE IF EXISTS ${name}`);
  psql(ADMIN, `CREATE DATABASE ${name} TEMPLATE ${tmplName}`);
  created.push(name);
}

describe('migration 0116 — no environment column anywhere defaults a universe', () => {
  before(() => {
    tmplName = `bz_0116_tmpl_${process.pid}`;
    const tmplUrl = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${tmplName}$1`);
    psql(ADMIN, `DROP DATABASE IF EXISTS ${tmplName}`);
    psql(ADMIN, `CREATE DATABASE ${tmplName}`);
    execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', '115', '-D', tmplUrl],
      { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
  });

  after(() => {
    for (const d of created) { try { psql(ADMIN, `DROP DATABASE IF EXISTS ${d}`); } catch { /* best effort */ } }
    try { psql(ADMIN, `DROP DATABASE IF EXISTS ${tmplName}`); } catch { /* best effort */ }
  });

  it('0114 left one behind, in a schema its test never looked at', () => {
    freshCase('bz_0116_before');
    assert.deepEqual(universeDefaults(), ['developer.dev_project_business_link']);
  });

  it('after 0116 there is none, in any schema', () => {
    freshCase('bz_0116_removed');
    const r = run0116();
    assert.ok(r.ok, `0116 failed: ${r.message}`);
    assert.deepEqual(universeDefaults(), []);
  });

  it('a link written without an environment now fails instead of claiming LIVE', () => {
    freshCase('bz_0116_omission');
    psql(url, `INSERT INTO developer.dev_workspaces (id, name, slug, created_by)
                 VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','W','w-0116','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')`);
    psql(url, `INSERT INTO developer.dev_projects (id, workspace_id, name, slug)
                 VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','P','p-0116')`);
    const omit = () => psql(url,
      `INSERT INTO developer.dev_project_business_link (project_id, merchant_id, requested_by_user_id)
       VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', gen_random_uuid(), gen_random_uuid())`);
    omit();
    assert.equal(psql(url, 'SELECT environment FROM developer.dev_project_business_link').trim(), 'LIVE',
      'precondition: an omitted column used to mean LIVE');
    psql(url, 'DELETE FROM developer.dev_project_business_link');
    assert.ok(run0116().ok);
    assert.throws(omit, /null value in column "environment"/);
  });

  it('the constraints stay: NOT NULL and the allowed values', () => {
    freshCase('bz_0116_constraints');
    assert.ok(run0116().ok);
    assert.equal(psql(url, `SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='developer' AND table_name='dev_project_business_link' AND column_name='environment'`).trim(), 'NO');
    assert.match(psql(url, `SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid='developer.dev_project_business_link'::regclass AND contype='c'
        AND pg_get_constraintdef(oid) LIKE '%environment%'`), /SANDBOX.*LIVE/);
  });

  it('refuses on a platform not declared SANDBOX, changing nothing', () => {
    freshCase('bz_0116_live_mode');
    psql(url, `UPDATE platform_settings SET value='LIVE' WHERE key='platform_mode' AND environment='GLOBAL'`);
    const r = run0116();
    assert.ok(!r.ok);
    assert.match(r.message, /platform_mode is LIVE, not SANDBOX/);
    assert.deepEqual(universeDefaults(), ['developer.dev_project_business_link']);
  });
});
