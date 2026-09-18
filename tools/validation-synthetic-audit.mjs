#!/usr/bin/env node
/**
 * validation-synthetic-audit — classify synthetic Sandbox residue. READ ONLY.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * The aggregate-funds cap is 50 000 000 minor and SHARED, so unretired
 * synthetic consumers are not untidiness — they are a resource other runs need.
 * But "looks synthetic" is not "is disposable": the provisioned Validation
 * Actors match every naming pattern a leaked fixture does, and retiring one
 * would destroy a Phase B ceremony that cannot be repeated without the owner.
 *
 * So this classifies and reports. It never mutates, and it never guesses: an
 * identity it cannot place is UNKNOWN, which is a thing to investigate rather
 * than a thing to clean up.
 *
 *   node tools/validation-synthetic-audit.mjs
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.BANZAMI_SANDBOX_HOST || 'root@217.160.9.248';
const PG = process.env.BANZAMI_SANDBOX_PG || 'bzsandbox-20260708184104-1708617-23807-postgres-1';

function sql(statement) {
  const b64 = Buffer.from(statement, 'utf8').toString('base64');
  const remote =
    `echo ${b64} | base64 -d | docker exec -i ${PG} sh -lc ` +
    `'PGPASSWORD=$(cat "$POSTGRES_PASSWORD_FILE") psql -U "$POSTGRES_USER" -d banzami_staging -Atq -F"\t" ` +
    `-v ON_ERROR_STOP=1 -c "SET default_transaction_read_only = on" -f -'`;
  return execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, remote], { encoding: 'utf8', maxBuffer: 1 << 24 })
    .split('\n').filter(Boolean).map((l) => l.split('\t'));
}

/** The provisioned Validation Actors. Named, never inferred. */
const PERMANENT = (() => {
  const doc = JSON.parse(execFileSync('python3', [
    '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
    join(repo, 'quality/validation/actors.yaml'),
  ], { encoding: 'utf8', maxBuffer: 1 << 24 }));
  const out = new Set();
  for (const a of doc.actors ?? []) {
    for (const v of Object.values(a)) {
      if (typeof v === 'string') {
        const m = v.match(/@?([a-z0-9_]{3,})@?/);
        if (/^e2e/.test(v)) out.add(v.replace(/^@/, '').split('@')[0].toLowerCase());
        void m;
      }
    }
  }
  return out;
})();

/** Handles a run creates and is expected to retire, by the prefix it mints. */
const RUN_OWNED = [
  /^e2ecombuyer/, /^rtbuyer/, /^e2ertpayer/, /^e2eseca/, /^e2esecc/, /^e2esecd/,
  /^e2elifec/, /^e2efc/, /^e2ep/, /^e2ecta/, /^e2ecb/,
];

const rows = sql(`
  SELECT c.handle, c.status, c.created_at::date::text,
         COALESCE((SELECT SUM(CASE WHEN le.entry_type='CREDIT' THEN le.amount_minor ELSE -le.amount_minor END)
                   FROM ledger_entries le WHERE le.account_id = cw.available_account_id), 0)::text
    FROM consumers c JOIN consumer_wallets cw ON cw.consumer_id = c.id
   WHERE c.status = 'ACTIVE'
   ORDER BY 4 DESC;`);

const classify = (handle) => {
  if (PERMANENT.has(handle)) return 'PERMANENT_VALIDATION_ACTOR';
  if (/^e2elogoutprobe/.test(handle)) return 'ACTIVE_REUSABLE_FIXTURE';
  if (RUN_OWNED.some((re) => re.test(handle))) return 'RUN_OWNED_DISPOSABLE';
  if (/^e2e/.test(handle)) return 'ORPHANED_VALIDATION_RESOURCE';
  return 'UNKNOWN';
};

const buckets = {};
for (const [handle, status, day, bal] of rows) {
  const k = classify(handle);
  (buckets[k] ??= []).push({ handle, status, day, bal: Number(bal) });
}

console.log('\nsynthetic residue — READ ONLY, nothing mutated\n');
let capHeld = 0;
for (const k of ['PERMANENT_VALIDATION_ACTOR', 'ACTIVE_REUSABLE_FIXTURE', 'RUN_OWNED_DISPOSABLE',
                 'ORPHANED_VALIDATION_RESOURCE', 'UNKNOWN']) {
  const list = buckets[k] ?? [];
  const held = list.reduce((n, r) => n + r.bal, 0);
  capHeld += k === 'RUN_OWNED_DISPOSABLE' || k === 'ORPHANED_VALIDATION_RESOURCE' ? held : 0;
  console.log(`  ${k.padEnd(30)} ${String(list.length).padStart(3)} active · ${held.toLocaleString('pt-PT').padStart(12)} minor held`);
  for (const r of list.filter((x) => x.bal > 0).slice(0, 6)) {
    console.log(`      ${r.handle.padEnd(26)} ${String(r.bal).padStart(9)}  ${r.day}`);
  }
}
console.log(`\n  recoverable without owner judgement: ${capHeld.toLocaleString('pt-PT')} minor`);
if ((buckets.UNKNOWN ?? []).length) {
  console.log(`  ⚠ ${buckets.UNKNOWN.length} UNKNOWN — establish ownership before touching any of them`);
}
console.log('');
