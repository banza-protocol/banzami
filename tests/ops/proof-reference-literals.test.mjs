// PROOF_REFERENCE_SOURCE_LEAK_GUARD.
//
// No real proof reference may be committed. Every concrete SECURE_V1- or
// LEGACY_V0-shaped token in a tracked file — in any letter case, since a
// lower-cased real reference still discloses it — must be listed in
// tools/assurance/synthetic-proof-references.txt, the explicit register of
// synthetic fixtures. The Sandbox side (proof-lookup-assurance.sh) proves those
// are absent from the real proofs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const ALPHABET = '0-9A-HJKMNP-TV-Z';
const SECURE = new RegExp(`(?<![0-9A-Za-z])BZM(?:-[${ALPHABET}]{4}){6}(?![0-9A-Za-z])`, 'gi');
const LEGACY = /(?<![0-9A-Za-z])BZM-[0-9A-F]{4}-[0-9A-F]{4}(?![-0-9A-Za-z])/gi;

const registry = new Set(
  readFileSync(new URL('tools/assurance/synthetic-proof-references.txt', root), 'utf8')
    .split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean),
);

function trackedTextFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 << 20 }).toString();
  return out.split('\0').filter((f) => f && !/\.(png|jpe?g|gif|webp|ico|pdf|ttf|otf|woff2?|zip|gz|jar|keystore|mp4|lock)$/i.test(f));
}

test('every registered reference is well-formed', () => {
  for (const r of registry) {
    assert.ok(SECURE.test(r) || LEGACY.test(r), `not a proof reference shape: ${r}`);
    SECURE.lastIndex = 0; LEGACY.lastIndex = 0;
  }
});

test('no unregistered concrete proof reference in any tracked file', () => {
  const leaks = [];
  for (const f of trackedTextFiles()) {
    let text;
    try { text = readFileSync(new URL(f, root), 'utf8'); } catch { continue; }
    if (!/bzm/i.test(text)) continue;
    for (const re of [SECURE, LEGACY]) {
      for (const m of text.matchAll(re)) {
        const token = m[0].toUpperCase();
        if (!registry.has(token)) leaks.push(`${f}: ${token.slice(0, 8)}…`);
      }
    }
  }
  assert.deepEqual(leaks, [], 'concrete proof references not in the synthetic register (a real one must be removed; a synthetic one registered)');
});
