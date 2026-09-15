import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

// Force the file backend (no Redis dependency in unit tests).
delete process.env.SESSION_REDIS_ADDR;
delete process.env.REDIS_ADDR;
const file = path.join(os.tmpdir(), `bzweb-sess-test-${process.pid}.json`);
process.env.SESSION_STORE_FILE = file;
const { createSessionStore, newSessionId } = await import('../lib/session_store.mjs');

test('the opaque id is high-entropy and structureless (§3)', () => {
  const a = newSessionId(), b = newSessionId();
  assert.equal(a.length, 43);          // 32 random bytes, base64url
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);  // no dots/JWT structure to decode
  assert.doesNotMatch(a, /eyJ/);        // not a JWT
});

test('a record set server-side is retrievable; the id carries none of it', async () => {
  const store = createSessionStore();
  const id = newSessionId();
  await store.set(id, { consumerId: 'c1', bearer: 'UPSTREAM_BEARER', csrf: 'n' }, 5000);
  const got = await store.get(id);
  assert.equal(got.bearer, 'UPSTREAM_BEARER');
  // The bearer is in the STORE, never in the id the browser holds.
  assert.equal(id.includes('UPSTREAM_BEARER'), false);
});

test('revocation makes the id unusable — no replay (§7/§74)', async () => {
  const store = createSessionStore();
  const id = newSessionId();
  await store.set(id, { consumerId: 'c1', bearer: 'B' }, 5000);
  assert.ok(await store.get(id));
  await store.del(id);
  assert.equal(await store.get(id), null); // revoked → gone
});

test('a record survives a fresh store instance — restart-durable (§4)', async () => {
  const s1 = createSessionStore();
  const id = newSessionId();
  await s1.set(id, { consumerId: 'c1', bearer: 'B', createdAt: Date.now() }, 60_000);
  const s2 = createSessionStore(); // simulates a host restart re-reading the file
  const got = await s2.get(id);
  assert.equal(got?.consumerId, 'c1');
});

test('an expired record is not returned (TTL floor is 1s)', async () => {
  const store = createSessionStore();
  const id = newSessionId();
  await store.set(id, { consumerId: 'c1' }, 1000);
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(await store.get(id), null);
});

test.after(async () => { await fs.rm(file, { force: true }); });
