// The Sandbox native build reclaims disk only from its own regenerable products.
//
// On 2026-09-11 the Sandbox disk (the database's disk) filled to 32 MB during a
// deploy, and a hand-run cleanup then deleted bundle manifests the runbook says
// are never deleted (RA-083). The deploy now gates capacity before building and
// reclaims after deploying — through ONE function whose every deletion is
// checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../infra/blueprint/sandbox-ops/scripts/remote-native-build.sh', import.meta.url), 'utf8');
const start = src.indexOf('reclaim() {');
// code only: comments may name what reclaim protects
const body = src.slice(start, src.indexOf('\n}\n', start)).split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');

test('reclaim exists and the capacity gate runs before any build', () => {
  assert.ok(start > 0, 'reclaim() is missing');
  const gate = src.indexOf('capacity FAIL');
  const build = src.indexOf('docker build ');
  assert.ok(gate > 0 && gate < build, 'the capacity gate must precede the build loop');
  assert.ok(/if \[ "\$FREE" -lt "\$MIN_FREE_GIB" \]; then\s*\n\s*echo "  capacity FAIL[^\n]*exit 9/.test(src.slice(0, build)),
    'insufficient free space (FREE < MIN_FREE_GIB) must stop before building');
});

test('reclaim never touches provenance, data, volumes or running images', () => {
  for (const forbidden of [/manifest/i, /\.sha256/, /receipt/i, /volume/i, /system prune/, /postgres|pgdata|\/var\/lib\/postgresql/i, /\/run\/secrets/, /image prune|container prune|network prune/]) {
    assert.ok(!forbidden.test(body), `reclaim() must not reference ${forbidden}`);
  }
  // the only prune is BuildKit cache, and only by age
  for (const line of body.split('\n').filter((l) => /prune/.test(l))) {
    assert.ok(/docker builder prune (--all )?-f --filter "until=/.test(line), `a prune other than aged build cache: ${line.trim()}`);
  }
  // every find … -delete is restricted to bundle archives
  for (const line of body.split('\n').filter((l) => /-delete/.test(l))) {
    assert.ok(/-name '\*\.tar\.gz'/.test(line), `a deletion other than bundle archives: ${line.trim()}`);
  }
  // image removal skips what containers run, and keeps two tags per service
  assert.ok(/docker ps --format/.test(body) && /grep -qxF "\$img"/.test(body), 'running images must be skipped');
  assert.ok(/NR>2/.test(body), 'the two newest tags per service must stay');
  // releases: never the one being deployed, never current/previous
  assert.ok(/\[ "\$d" = "\$\{REL%\/\}" \] && continue/.test(body) && /current/.test(body) && /previous/.test(body),
    'release reclaim must skip this release and current/previous');
});
