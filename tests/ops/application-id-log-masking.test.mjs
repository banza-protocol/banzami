// A Business application id is the applicant's capability on the public
// onboarding routes (its status, its KYB documents, resubmission). A Go log
// field carrying one goes through obs.MaskID — never written whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../services');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.name === 'vendor' || e.name.startsWith('.') ? [] : e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.go') && !e.name.endsWith('_test.go') ? [join(d, e.name)] : []);

test('every "application_id" log field is masked', () => {
  const offenders = [];
  let seen = 0;
  for (const f of walk(ROOT)) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (!/slog\.|\.(Info|Warn|Error|Debug)(Context)?\(/.test(line) && !/^\s*"application_id",/.test(line)) return;
      for (const m of line.matchAll(/"application_id",\s*([^,)\s]+)/g)) {
        seen++;
        if (!m[1].startsWith('obs.MaskID(')) offenders.push(`${f.slice(ROOT.length + 1)}:${i + 1} ${m[0]}`);
      }
    });
  }
  assert.ok(seen >= 9, `found only ${seen} application_id log fields — the scan is not seeing the code`);
  assert.deepEqual(offenders, []);
});
