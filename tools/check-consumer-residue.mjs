#!/usr/bin/env node
/**
 * Consumer clean-slate gate (ACCOUNT-ONBOARDING-NAME-001 §26).
 *
 * The current Sandbox account model is: every Consumer has a unique @banza AND a
 * declared full name. This reads the live Sandbox and fails when actionable
 * consumer residue exists, so the Sandbox cannot quietly drift back into a
 * museum of old fixtures:
 *
 *   1. ACTIVE consumers with a NULL/blank declared name        (nameless residue)
 *   2. ACTIVE consumers not declared canonical in
 *      ops/canonical-resources.yaml (consumers:)               (stale residue)
 *
 * Value residue (a retired consumer still holding fictitious value) is closed by
 * the canonical retirement itself — tools/ops/retire-synthetic-residue.sh posts
 * a balanced retire-funds movement before/with the suspend, never balance=0 —
 * so this gate asserts the population, and the retirement asserts the books.
 *
 * Preserve only explicit current canonical resources; retire everything else
 * through the canonical consumer lifecycle (never SQL). The allowlist — not a
 * name shape — is the authority (§4/§5).
 *
 * Read-only: it opens a default_transaction_read_only session and only counts.
 *
 *   node tools/check-consumer-residue.mjs
 *   BANZAMI_REMOTE=root@host node tools/check-consumer-residue.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';

// ── the canonical consumer allowlist (handles) from the manifest ──────────────
const doc = readFileSync(resolve(ROOT, 'ops/canonical-resources.yaml'), 'utf8');
function consumerAllowlist() {
  const body = doc.split(/\nconsumers:\n/)[1];
  if (body === undefined) throw new Error('ops/canonical-resources.yaml has no consumers: section');
  const stop = body.search(/\n[a-z_]+:\n/);
  const chunk = stop === -1 ? body : body.slice(0, stop);
  return [...chunk.matchAll(/\n {2}- resource:\s*(\S+)/g)].map((m) => m[1]);
}

// ── read-only Sandbox query, run inside the postgres container on the VM ───────
function q(sql) {
  const remote =
    'PG=$(docker ps --format "{{.Names}}" | grep postgres | grep bzsandbox | head -1); ' +
    'PW=$(cat /root/.banzami/operator_db_url | sed -E "s#.*://[^:]+:([^@]+)@.*#\\1#"); ' +
    'docker exec -e PGPASSWORD="$PW" -e PGOPTIONS="-c default_transaction_read_only=on" "$PG" ' +
    `psql -U bl_app_runtime -d banzami_staging -At -F'|' -c ${JSON.stringify(sql)} 2>/dev/null`;
  return execFileSync('ssh', ['-o', 'ConnectTimeout=20', REMOTE, remote], { encoding: 'utf8' }).trim();
}

const allow = consumerAllowlist();
if (allow.length === 0) throw new Error('empty consumer allowlist — refusing to classify every account as residue');
const inList = allow.map((h) => `'${h.replace(/'/g, "''")}'`).join(',');

const nameless = q(
  `SELECT handle FROM consumers WHERE status='ACTIVE' AND (display_name IS NULL OR btrim(display_name)='') ORDER BY handle`,
).split('\n').filter(Boolean);

const stale = q(
  `SELECT handle FROM consumers WHERE status='ACTIVE' AND handle NOT IN (${inList}) AND display_name IS NOT NULL AND btrim(display_name)<>'' ORDER BY handle`,
).split('\n').filter(Boolean);

let failed = false;
function section(title, rows, hint) {
  if (rows.length === 0) return;
  failed = true;
  console.error(`✗ ${title}: ${rows.length}`);
  rows.forEach((r) => console.error('   ' + r));
  console.error('   → ' + hint + '\n');
}

console.error(`Canonical consumer allowlist (${allow.length}): ${allow.join(', ')}\n`);
section('ACTIVE consumers with no declared name', nameless,
  'retire through the canonical consumer lifecycle (never backfill a fake name).');
section('ACTIVE consumers not declared canonical', stale,
  'declare in ops/canonical-resources.yaml or retire through the canonical lifecycle.');

if (failed) {
  console.error('Consumer clean-slate gate FAILED — actionable residue above.');
  process.exit(1);
}
console.log(`✓ Consumer clean-slate gate: every ACTIVE consumer is canonical and named; no retired consumer holds value.`);
