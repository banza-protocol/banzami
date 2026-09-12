#!/usr/bin/env node
/**
 * check-schema-reality.mjs — asserts that the schema a service DEPENDS ON is
 * actually usable by the role that service connects as.
 *
 * This exists because "the migration ledger is current" turned out not to imply
 * "the application can use the schema", and the gap was invisible for seven
 * weeks. Migration 0088 created account_identity correctly, the ledger recorded
 * it accurately, every object was present — and the Developer Console was
 * entirely non-functional, because the runtime role was never granted USAGE on
 * that schema. Every write failed with permission denied, surfacing as a
 * fail-closed 503.
 *
 * So this deliberately does NOT check "does the table exist". An existence check
 * would have passed throughout the outage. It checks what the service needs:
 * can THIS role read and write THIS table. `has_table_privilege` answers that
 * without touching a row.
 *
 * A second trap this avoids: `information_schema` is privilege-filtered. Querying
 * it as the runtime role showed account_identity as empty, which reads exactly
 * like missing tables and sent one investigation down that path. The catalog
 * (`pg_class`) is not filtered, so object existence and access are reported
 * separately here — they are different failures with different repairs.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node tools/check-schema-reality.mjs
 *
 * The connection string must be the RUNTIME role's, not a superuser's: checking
 * with a superuser would pass while the application still cannot connect.
 */
import { execFileSync } from 'node:child_process';

const DSN = process.env.DATABASE_URL || process.env.SCHEMA_REALITY_DSN;
if (!DSN) {
  console.error('✗ DATABASE_URL not set — refusing to guess a target database');
  process.exit(2);
}

/**
 * Critical objects, per schema, that a service cannot function without. Kept
 * deliberately small and explicit: this is a canary for whole-schema access
 * failures, not a duplicate of the schema definition. Reproducing every column
 * here would rot immediately and would still not have caught the failure it
 * exists for.
 */
const REQUIRED = [
  { schema: 'account_identity', table: 'identity_users',     needs: ['SELECT', 'INSERT'] },
  { schema: 'account_identity', table: 'identity_otp_codes', needs: ['SELECT', 'INSERT', 'UPDATE'] },
  { schema: 'account_identity', table: 'identity_sessions',  needs: ['SELECT', 'INSERT', 'DELETE'] },
  { schema: 'account_identity', table: 'audit_events',       needs: ['SELECT', 'INSERT'] },
  { schema: 'developer',        table: 'dev_workspaces',     needs: ['SELECT', 'INSERT'] },
  { schema: 'developer',        table: 'dev_projects',       needs: ['SELECT', 'INSERT'] },
  { schema: 'developer',        table: 'dev_api_keys',       needs: ['SELECT', 'INSERT'] },
];

function psql(sql) {
  return execFileSync('psql', [DSN, '-Atc', sql], { encoding: 'utf8', timeout: 15000 }).trim();
}

const GREEN = '\x1b[32m', RED = '\x1b[31m', OFF = '\x1b[0m';
let failures = 0;
const pass = (m) => console.log(`  ${GREEN}✓${OFF} ${m}`);
const fail = (m) => { console.log(`  ${RED}✗ ${m}${OFF}`); failures++; };

let role;
try {
  role = psql('select current_user');
} catch (e) {
  console.error(`✗ cannot connect: ${String(e.message).split('\n')[0]}`);
  process.exit(1);
}
console.log(`Schema reality check — connected as ${role}\n`);

for (const { schema, table, needs } of REQUIRED) {
  const qualified = `${schema}.${table}`;

  // Existence from the CATALOG, which privileges do not hide.
  const exists = psql(
    `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace ` +
    `where n.nspname='${schema}' and c.relname='${table}' and c.relkind='r'`,
  );
  if (exists !== '1') {
    fail(`${qualified}: table does not exist`);
    continue;
  }

  // Schema-level access first: without USAGE the table privileges are moot, and
  // this is the exact failure that was mistaken for missing tables.
  const usage = psql(`select has_schema_privilege('${role}', '${schema}', 'USAGE')`);
  if (usage !== 't') {
    fail(`${qualified}: exists, but ${role} has no USAGE on schema ${schema} — every access denied`);
    continue;
  }

  const missing = needs.filter(
    (p) => psql(`select has_table_privilege('${role}', '${qualified}', '${p}')`) !== 't',
  );
  if (missing.length) {
    fail(`${qualified}: exists and schema is usable, but ${role} lacks ${missing.join(', ')}`);
  } else {
    pass(`${qualified}: exists and ${role} holds ${needs.join(', ')}`);
  }
}

console.log('');
if (failures) {
  console.log(`${RED}✗ Schema reality check FAILED (${failures})${OFF} — the migration ledger can be current while the application cannot use the schema`);
  process.exit(1);
}
console.log(`${GREEN}✓ Schema reality check passed${OFF} — required objects exist AND are usable by the runtime role`);
