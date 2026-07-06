#!/usr/bin/env node
/**
 * rt04e-receipt.mjs — constrained RT04E migration-receipt validator.
 *
 * Reads a JSON receipt from STDIN and validates it as a genuine, release-bound
 * `migration-only` Sandbox migration receipt. Emits ONLY a sanitised PASS/FAIL
 * line — never a field value. Does NOT write anything. Rejects unexpected shapes,
 * unknown fields, secret-like content, a wrong/short release SHA, a non-Sandbox
 * target, a non-`migration-only` mode, or any non-PASS status.
 *
 *   exit 0 = valid receipt
 *   exit 1 = well-formed JSON but invalid (mismatch / bad status / unknown field / malformed)
 *   exit 2 = unreadable / not JSON / not an object / bad RT04E_RELEASE_REV
 *
 * Env: RT04E_RELEASE_REV (the current canonical full 40-hex SHA).
 */
import { readFileSync } from 'node:fs';

const rev = process.env.RT04E_RELEASE_REV || '';
const fail = m => { console.error(`  ✗ receipt: ${m}`); };

if (!/^[0-9a-f]{40}$/.test(rev)) { fail('RT04E_RELEASE_REV is not a full 40-hex canonical SHA'); process.exit(2); }

let raw;
try { raw = readFileSync(0, 'utf8'); } catch { fail('cannot read stdin'); process.exit(2); }
let doc;
try { doc = JSON.parse(raw); } catch { fail('receipt is not valid JSON (unexpected shape)'); process.exit(2); }
raw = null; // do not retain the raw receipt
if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { fail('unexpected shape (not a JSON object)'); process.exit(2); }

// Exactly these fields are permitted — no more, no fewer.
const ALLOWED = [
  'receipt_version', 'release_revision', 'target_category', 'execution_mode',
  'checkpoint_status', 'backup_status', 'migration_access_status', 'migration_status',
  'migration_level_before', 'migration_level_after', 'checksum_status', 'drift_status',
  'created_utc',
];
const ALLOWED_SET = new Set(ALLOWED);
const keys = Object.keys(doc);

// Reject unknown fields (tamper / injection surface).
for (const k of keys) {
  if (!ALLOWED_SET.has(k)) { fail(`unknown field present: ${k}`); process.exit(1); }
}
// Require every approved field to be present.
for (const k of ALLOWED) {
  if (!Object.prototype.hasOwnProperty.call(doc, k)) { fail(`missing required field: ${k}`); process.exit(1); }
}

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
for (const s of ['checkpoint_status', 'backup_status', 'migration_access_status', 'migration_status', 'checksum_status', 'drift_status']) {
  if (doc[s] !== 'PASS') { fail(`${s} must be PASS`); bad++; }
}
for (const lvl of ['migration_level_before', 'migration_level_after']) {
  if (typeof doc[lvl] !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(doc[lvl])) { fail(`${lvl} is malformed`); bad++; }
}
if (typeof doc.created_utc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(doc.created_utc)) { fail('created_utc is malformed'); bad++; }
doc = null;

if (bad) { console.error(`✗ receipt validation: ${bad} problem(s)`); process.exit(1); }
console.log('✓ receipt: valid (Sandbox · migration-only · release-bound · all statuses PASS)');
