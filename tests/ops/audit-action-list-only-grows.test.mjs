// The audit log's action list only grows.
//
// Each migration that redefines audit_log_action_check restates the whole list.
// Copying an older definition silently drops the actions added since — every
// such audit write is then refused (0134 nearly dropped two of 0126's). Every
// definition must contain the one before it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '../../db/migrations');

test('every redefinition of audit_log_action_check keeps every earlier action', () => {
  const defs = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => [f, readFileSync(join(DIR, f), 'utf8')])
    .filter(([, s]) => /ADD CONSTRAINT audit_log_action_check/.test(s))
    .map(([f, s]) => {
      const seg = s.slice(s.indexOf('ADD CONSTRAINT audit_log_action_check'));
      return [f, new Set([...seg.slice(0, seg.indexOf(';')).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]))];
    });
  assert.ok(defs.length >= 2);
  for (let i = 1; i < defs.length; i++) {
    const [prevF, prev] = defs[i - 1];
    const [f, cur] = defs[i];
    const dropped = [...prev].filter((a) => !cur.has(a));
    assert.deepEqual(dropped, [], `${f} drops actions ${prevF} allowed: ${dropped}`);
  }
});
