/**
 * The one @banza reserved namespace (migrations 0133 + 0171): the handle_registry
 * is the SOLE authority for reserved names — there is no second hand-kept list in
 * the Rust core any more (that list was removed; tools/check-reserved-handles.mjs
 * fails CI if it ever reappears). The single source of the reserved set is
 * tools/gen-reserved-handles.mjs, and migration 0171 is seeded from it.
 *
 * This is the DB-level proof: on a FRESHLY migrated database the registry's SYSTEM
 * rows must equal EXACTLY the canonical generator's set — both directions — so the
 * namespace is reproducible on a clean DB and can never silently diverge from its
 * one source. (check-reserved-handles.mjs proves the same against the migration SQL
 * text statically; this proves the realised effect on a real migrated DB.)
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0133-one-reserved-list.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
let db; let url;
const psql = (sql) => execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { encoding: 'utf8' }).trim();
// The ONE source of the reserved set (registry authority, single generator). Each
// row carries its ownerType (SYSTEM for @banza's own names, PROTECTED for the
// institution inventory) — the registry must reproduce both the handle AND its
// classification exactly.
const canonical = JSON.parse(
  execFileSync('node', [join(REPO, 'tools/gen-reserved-handles.mjs'), '--json'], { encoding: 'utf8' }),
).map((r) => `${r.handle}\t${r.ownerType}`).sort();

describe('the one @banza reserved namespace', () => {
  before(() => {
    db = `bz_0133_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]);
    execFileSync('psql', [ADMIN, '-Atc', `CREATE DATABASE ${db}`]);
    execFileSync('sqlx', ['migrate', 'run', '--source', join(REPO, 'db/migrations'), '-D', url], { cwd: REPO, stdio: 'pipe' });
  });
  after(() => execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]));

  // The registry's reserved rows (SYSTEM + PROTECTED) are seeded only from the
  // generator, so the freshly-migrated set must match it exactly — same handles,
  // same classification, in both directions. The comparison is of the full
  // (handle, owner_type) mapping to catch a drift in either the set OR the kind.
  const registryReserved = () =>
    psql(`SELECT handle || E'\\t' || owner_type FROM handle_registry
          WHERE owner_type IN ('SYSTEM','PROTECTED') ORDER BY handle, owner_type`)
      .split('\n').filter(Boolean).sort();

  it('every canonical reserved handle is seeded in the registry with the same classification', () => {
    const have = new Set(registryReserved());
    const missing = canonical.filter((n) => !have.has(n));
    assert.deepEqual(missing, [], `emitted by the generator but missing/misclassified in the registry: ${missing}`);
  });

  it('every reserved registry row comes from the canonical generator (no stray reservations)', () => {
    const canon = new Set(canonical);
    const extra = registryReserved().filter((n) => !canon.has(n));
    assert.deepEqual(extra, [], `reserved in the registry but not emitted by the generator: ${extra}`);
  });
});
