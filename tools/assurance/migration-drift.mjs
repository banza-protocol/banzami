#!/usr/bin/env node
/**
 * Are the migrations a database says it applied the migrations in git?
 *
 *   # on the Sandbox VM (read-only):
 *   printf "SELECT version||'|'||encode(checksum,'hex')||'|'||success FROM _sqlx_migrations ORDER BY version;\n" > /tmp/q.sql
 *   SQL=/tmp/q.sql /tmp/sbq.sh -At > applied.txt
 *   # here:
 *   node tools/assurance/migration-drift.mjs applied.txt
 *
 * sqlx records each migration's SHA-384. An applied migration whose file has
 * since changed is drift (applied migrations are immutable); a file with no
 * record is pending; a record with no file is a migration git no longer has.
 * Exit 1 on any of them, or on a migration recorded as failed.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [appliedPath] = process.argv.slice(2);
if (!appliedPath) { console.error('usage: migration-drift.mjs <applied.txt>'); process.exit(2); }
const dir = join(import.meta.dirname, '../../db/migrations');

const files = new Map();
for (const f of readdirSync(dir).filter((n) => /^\d+_.*\.sql$/.test(n))) {
  files.set(Number(f.split('_')[0]), createHash('sha384').update(readFileSync(join(dir, f))).digest('hex'));
}
const applied = new Map();
for (const line of readFileSync(appliedPath, 'utf8').split('\n').filter(Boolean)) {
  const [v, checksum, success] = line.trim().split('|');
  applied.set(Number(v), { checksum, ok: success === 't' || success === 'true' });
}

const drift = [...applied].filter(([v, a]) => files.has(v) && files.get(v) !== a.checksum).map(([v]) => v);
const pending = [...files.keys()].filter((v) => !applied.has(v));
const orphan = [...applied.keys()].filter((v) => !files.has(v));
const failed = [...applied].filter(([, a]) => !a.ok).map(([v]) => v);

console.log(`applied ${applied.size} · files ${files.size} · latest applied ${Math.max(...applied.keys())} · latest file ${Math.max(...files.keys())}`);
console.log(`MIGRATION_CHECKSUM_DRIFT=${drift.length}${drift.length ? ' ' + drift.join(',') : ''}`);
console.log(`MIGRATIONS_PENDING=${pending.length}${pending.length ? ' ' + pending.join(',') : ''}`);
console.log(`MIGRATIONS_APPLIED_WITHOUT_FILE=${orphan.length}${orphan.length ? ' ' + orphan.join(',') : ''}`);
console.log(`MIGRATIONS_FAILED=${failed.length}${failed.length ? ' ' + failed.join(',') : ''}`);
process.exit(drift.length || pending.length || orphan.length || failed.length ? 1 : 0);
