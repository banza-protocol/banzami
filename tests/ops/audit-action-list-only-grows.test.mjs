// The audit log's action list only grows.
//
// Each migration that redefines audit_log_action_check restates the whole list.
// Copying an older definition silently drops the actions added since — every such
// audit write is then refused (0134 nearly dropped two of 0126's; 0168 dropped
// eight of 0149's). audit_log is append-only, so once an action is valid it must
// stay valid: the LIVE (latest) definition must contain every action ever allowed.
//
// The invariant is on the effective list, not on each consecutive pair, because an
// already-applied migration is immutable (sqlx records its checksum; editing it
// breaks every database that ran it). The only safe correction for a migration
// that shipped a drop is a FORWARD repair migration that restores the full union —
// so the guard must accept that repair while still failing for any action that is
// still missing from the live list. A new dropping migration with no repair fails
// here exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '../../db/migrations');

function definitions() {
  return readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => [f, readFileSync(join(DIR, f), 'utf8')])
    .filter(([, s]) => /ADD CONSTRAINT audit_log_action_check/.test(s))
    .map(([f, s]) => {
      const seg = s.slice(s.indexOf('ADD CONSTRAINT audit_log_action_check'));
      return [f, new Set([...seg.slice(0, seg.indexOf(';')).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]))];
    });
}

test('the live audit_log_action_check contains every action ever allowed', () => {
  const defs = definitions();
  assert.ok(defs.length >= 2);

  // Every action any definition ever allowed.
  const union = new Set();
  for (const [, actions] of defs) for (const a of actions) union.add(a);

  // The latest definition is the live constraint on a freshly migrated database.
  const [latestFile, latest] = defs[defs.length - 1];
  const missing = [...union].filter((a) => !latest.has(a)).sort();

  // For a useful failure, name the last migration that still allowed each missing
  // action — that is where it was dropped and never restored.
  const lastSeen = (a) => {
    for (let i = defs.length - 1; i >= 0; i--) if (defs[i][1].has(a)) return defs[i][0];
    return '(never)';
  };
  const detail = missing.map((a) => `${a} (last allowed by ${lastSeen(a)})`);
  assert.deepEqual(
    missing, [],
    `${latestFile} is missing actions that earlier migrations allowed; add a forward repair migration restoring: ${detail.join(', ')}`,
  );
});
