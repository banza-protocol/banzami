#!/usr/bin/env node
/**
 * rt04e-receipt.mjs — constrained RT04E migration-receipt validator (freshness-aware).
 *
 * Reads a JSON receipt from STDIN and validates it as a genuine, release-bound,
 * FRESH, single-use-eligible `migration-only` Sandbox migration receipt. Emits ONLY
 * a sanitised category line — never a field value, never raw receipt content, and
 * never writes anything. Current time is obtained INTERNALLY (Date.now); there is no
 * caller-supplied clock and no caller-configurable maximum age.
 *
 * Exit codes (sanitised categories — invalid structure is distinct from expiry):
 *   0 = VALID  (fresh, within the fixed maximum age)
 *   1 = INVALID (structure / unknown or duplicate field / status / format / secret-like)
 *   2 = UNREADABLE (no stdin / not JSON / not an object / bad RT04E_RELEASE_REV)
 *   3 = EXPIRED (well-formed + content-valid, but age >= MAX_AGE_SECONDS, not future)
 *   4 = FUTURE  (well-formed but created_utc is in the future — fails closed)
 *
 * The maximum receipt age is a fixed canonical constant (30 minutes). It cannot be
 * overridden by argument, environment, file or shell expansion. No cryptographic
 * signature or integrity claim is made — this is a local, permission-bound, process
 * receipt only.
 *
 * Env: RT04E_RELEASE_REV (the current canonical full 40-hex SHA).
 */
import { readFileSync } from 'node:fs';

const MAX_AGE_SECONDS = 1800; // FIXED canonical constant — 30 minutes. Never caller-configurable.

const rev = process.env.RT04E_RELEASE_REV || '';
const fail = m => { console.error(`  ✗ receipt: ${m}`); };

if (!/^[0-9a-f]{40}$/.test(rev)) { fail('RT04E_RELEASE_REV is not a full 40-hex canonical SHA'); process.exit(2); }

let raw;
try { raw = readFileSync(0, 'utf8'); } catch { fail('cannot read stdin'); process.exit(2); }

// Exactly these fields are permitted — no more, no fewer.
const ALLOWED = [
  'receipt_version', 'release_revision', 'target_category', 'execution_mode', 'receipt_state',
  'checkpoint_status', 'backup_status', 'migration_access_status', 'migration_status',
  'migration_level_before', 'migration_level_after', 'checksum_status', 'drift_status',
  'created_utc',
];
const ALLOWED_SET = new Set(ALLOWED);

// Reject duplicate top-level keys before JSON.parse collapses them (last-wins tamper).
for (const k of ALLOWED) {
  const n = raw.split(`"${k}"`).length - 1;
  if (n > 1) { fail(`duplicate field: ${k}`); process.exit(1); }
}

let doc;
try { doc = JSON.parse(raw); } catch { fail('receipt is not valid JSON (unexpected shape)'); process.exit(2); }
raw = null; // do not retain the raw receipt
if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { fail('unexpected shape (not a JSON object)'); process.exit(2); }

const keys = Object.keys(doc);
for (const k of keys) if (!ALLOWED_SET.has(k)) { fail(`unknown field present: ${k}`); process.exit(1); }
for (const k of ALLOWED) if (!Object.prototype.hasOwnProperty.call(doc, k)) { fail(`missing required field: ${k}`); process.exit(1); }

// No string value may carry secret-like / connection-like / SQL-like content.
const SECRETISH = /:\/\/|@|password|postgres|postgresql|mysql|host=|user=|sslmode|jdbc|BEGIN |PRIVATE KEY|;|--\s|\/\*|\s{2,}/i;
for (const k of keys) {
  const v = doc[k];
  if (typeof v === 'string' && SECRETISH.test(v)) { fail(`field ${k} contains forbidden/secret-like content`); process.exit(1); }
}

let bad = 0;
if (doc.receipt_version !== 1) { fail('receipt_version must be 1'); bad++; }
if (typeof doc.release_revision !== 'string' || !/^[0-9a-f]{40}$/.test(doc.release_revision)) { fail('release_revision is not a full 40-hex SHA'); bad++; }
else if (doc.release_revision !== rev) { fail('release_revision does not match the current canonical release (stale/mismatched)'); bad++; }
if (doc.target_category !== 'Sandbox') { fail('target_category must be exactly "Sandbox"'); bad++; }
if (doc.execution_mode !== 'migration-only') { fail('execution_mode must be exactly "migration-only"'); bad++; }
if (doc.receipt_state !== 'pending') { fail('receipt_state must be exactly "pending" (creation invariant; live state is filesystem-authoritative)'); bad++; }
for (const s of ['checkpoint_status', 'backup_status', 'migration_access_status', 'migration_status', 'checksum_status', 'drift_status']) {
  if (doc[s] !== 'PASS') { fail(`${s} must be PASS`); bad++; }
}
for (const lvl of ['migration_level_before', 'migration_level_after']) {
  if (typeof doc[lvl] !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(doc[lvl])) { fail(`${lvl} is malformed`); bad++; }
}
// strict UTC RFC3339 ending in Z
const ts = doc.created_utc;
const tsOk = typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(ts);
if (!tsOk) { fail('created_utc is malformed (must be strict UTC RFC3339 ending in Z)'); bad++; }

if (bad) { doc = null; console.error(`✗ receipt validation: ${bad} problem(s)`); process.exit(1); }

// Structure is valid — now assess freshness with an INTERNAL clock (not caller-supplied).
const createdMs = Date.parse(ts);
if (Number.isNaN(createdMs)) { fail('created_utc is not a parseable instant'); process.exit(1); }
const nowMs = Date.now();
doc = null;
if (createdMs > nowMs) { fail('created_utc is in the future — refusing (fail closed)'); process.exit(4); }
const ageSeconds = Math.floor((nowMs - createdMs) / 1000);
if (ageSeconds >= MAX_AGE_SECONDS) { console.error(`  ✗ receipt: expired (age at or beyond the ${MAX_AGE_SECONDS}s maximum)`); process.exit(3); }

console.log('✓ receipt: valid (Sandbox · migration-only · release-bound · fresh · all statuses PASS)');
