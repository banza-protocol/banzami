// The Sandbox container-log retention job deletes rotated copies older than 14
// days and nothing else — never a live <id>-json.log, never a recent rotation.
// And no host config may truncate a live Docker log from outside: json-file
// counts its own position, so `docker logs --tail` then hangs until restart
// (happened 2026-09-11, docs/operations/LOG_RETENTION.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO = join(import.meta.dirname, '../..');
const SCRIPT = join(REPO, 'infra/sandbox/log-retention/banzami-container-log-retention');

test('only rotated copies older than 14 days are deleted', () => {
  const root = mkdtempSync(join(tmpdir(), 'bz-logret-'));
  const id = 'a'.repeat(64);
  mkdirSync(join(root, id));
  const old = (Date.now() - 20 * 86400e3) / 1000;
  const files = {
    live: `${id}-json.log`, oldRotated: `${id}-json.log-20260911-1789122105`,
    newRotated: `${id}-json.log-20260920-1789900000`, config: 'config.v2.json',
  };
  for (const f of Object.values(files)) writeFileSync(join(root, id, f), 'x');
  for (const k of ['live', 'oldRotated', 'config']) utimesSync(join(root, id, files[k]), old, old);
  const script = readFileSync(SCRIPT, 'utf8').replaceAll('/var/lib/docker/containers', root);
  execFileSync('sh', ['-c', script]);
  const left = new Set(readdirSync(join(root, id)));
  assert.ok(!left.has(files.oldRotated), 'an old rotated copy must be deleted');
  for (const k of ['live', 'newRotated', 'config']) assert.ok(left.has(files[k]), `${k} must survive`);
});

test('no Sandbox host config truncates a live Docker log', () => {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  for (const f of walk(join(REPO, 'infra/sandbox'))) {
    const s = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    assert.ok(!(/copytruncate/.test(s) && /docker\/containers/.test(s)), `${f}: truncates live Docker logs`);
  }
  assert.ok(existsSync(SCRIPT));
});
