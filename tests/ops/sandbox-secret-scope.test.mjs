// A service gets the credentials its own code reads, and nothing else (A6-09).
//
// Every Sandbox service used to receive every secret on the stack and export
// all of them, so a file read in public-api — consumer-facing, open
// registration — yielded the Console session secret, the API-key pepper, the
// proof signing key and core's internal authority.
//
// The deploy's mapping (secret_exports_for) is compared with what each
// service's source actually reads, in both directions: a credential a service
// never names is over-provisioning, and one it reads but is not given is a
// capability that would fail silently at runtime.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const DEPLOY = join(ROOT, 'infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh');

/** Source trees, per deployed service name. */
const SOURCE = {
  'core-api-staging': ['core'],
  'api-gateway-staging': ['services/api-gateway'],
  'public-api-staging': ['services/public-api'],
  'developer-api': ['services/developer-api'],
  'admin-api': ['services/admin-api'],
};

/** The deploy's own mapping: service → [{ file, env }]. */
function mapping() {
  const sh = readFileSync(DEPLOY, 'utf8');
  const body = sh.slice(sh.indexOf('secret_exports_for() {'), sh.indexOf('secret_files_for()'));
  const out = {};
  const re = /^\s{4}([a-z0-9-]+)\)\n([\s\S]*?)\n\s{6};;/gm;
  for (const m of body.matchAll(re)) {
    out[m[1]] = [...m[2].matchAll(/([a-z0-9_]+):([A-Z][A-Z0-9_]*)/g)]
      .map(([, file, env]) => ({ file, env }));
  }
  return out;
}

/** Every ENV name read by the source under `dirs` (Go os.Getenv, Rust env::var). */
function envNamesRead(dirs) {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (['node_modules', 'target', '.git', 'testdata'].includes(entry)) continue;
      const path = join(dir, entry);
      const st = statSync(path);
      if (st.isDirectory()) { walk(path); continue; }
      if (!/\.(go|rs)$/.test(entry) || /_test\.(go|rs)$/.test(entry)) continue;
      const src = readFileSync(path, 'utf8');
      for (const m of src.matchAll(/(?:Getenv|LookupEnv|env::var|var)\("([A-Z][A-Z0-9_]*)"\)/g)) {
        names.add(m[1]);
      }
    }
  };
  for (const d of dirs) walk(join(ROOT, d));
  return names;
}

const MAP = mapping();

test('the deploy names a secret mapping for every service that holds credentials', () => {
  assert.deepEqual(Object.keys(MAP).sort(), Object.keys(SOURCE).sort());
  for (const [service, pairs] of Object.entries(MAP)) {
    assert.ok(pairs.length > 0, `${service} is given no credentials at all`);
  }
});

test('no service is given a credential its code never reads', () => {
  for (const [service, pairs] of Object.entries(MAP)) {
    const read = envNamesRead(SOURCE[service]);
    const unread = pairs.filter((p) => !read.has(p.env)).map((p) => `${p.file}:${p.env}`);
    assert.deepEqual(unread, [], `${service} is given credentials it never reads: ${unread.join(', ')}`);
  }
});

test('no service reads a credential the deploy does not give it', () => {
  // The universe is what the deploy provisions anywhere: a name no service is
  // given (an external provider key, a second database URL) is out of scope
  // here and is not a secret this script owns.
  const universe = new Set(Object.values(MAP).flat().map((p) => p.env));
  for (const [service, dirs] of Object.entries(SOURCE)) {
    const given = new Set(MAP[service].map((p) => p.env));
    const missing = [...envNamesRead(dirs)].filter((e) => universe.has(e) && !given.has(e));
    assert.deepEqual(missing, [], `${service} reads credentials it is not given: ${missing.join(', ')}`);
  }
});

test('the consumer surface holds no Console, pepper or proof credential', () => {
  // The A6-09 finding, stated as the property it broke.
  const publicApi = new Set(MAP['public-api-staging'].map((p) => p.env));
  for (const forbidden of ['SESSION_SECRET', 'API_KEY_PEPPER', 'BZM_PROOF_SIGNING_KEY', 'ADMIN_JWT_SECRET', 'OTP_PEPPER']) {
    assert.ok(!publicApi.has(forbidden), `public-api is given ${forbidden}`);
  }
  const core = new Set(MAP['core-api-staging'].map((p) => p.env));
  for (const forbidden of ['JWT_SECRET', 'SESSION_SECRET', 'RESEND_API_KEY', 'BZM_PROOF_SIGNING_KEY']) {
    assert.ok(!core.has(forbidden), `core-api is given ${forbidden}`);
  }
});

test('both the first create and a redeploy build the exports from the one mapping', () => {
  const sh = readFileSync(DEPLOY, 'utf8');
  const builders = sh.match(/secret_entrypoint "\$name" "\$bin"/g) || [];
  assert.equal(builders.length, 2, 'the two container paths must build the entrypoint the same way');
  assert.ok(
    /allowed="\$\(secret_files_for "\$name"\)"/.test(sh),
    'a redeploy must filter cloned secret mounts against this service’s list',
  );
});
