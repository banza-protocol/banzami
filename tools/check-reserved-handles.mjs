#!/usr/bin/env node
// Guard: the protected @banza namespace cannot drift from its canonical source,
// and there is exactly ONE namespace authority (the registry — no hand-kept Rust
// list).
//
// Fails CI when:
//   1. migration 0171's seeded handles != tools/gen-reserved-handles.mjs output.
//   2. the committed inventory doc != `--inventory` output.
//   3. a hand-maintained RESERVED_HANDLES list reappears in the Rust core (the
//      single-authority regression — namespace decisions belong to the registry).
//   4. a name migration 0133 reserves is NOT covered by the canonical generator
//      (so the registry's earlier seed stays a subset of the one source).
//   5. any BNA-authorized bank's canonical handle or alias is missing from the seed.
//   6. any emitted handle is not creatable under the canonical grammar / not normalized.
//
// Read-only. No DB, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const MIGRATION = join(repo, 'db/migrations/0171_handle_namespace_protection.sql');
const SEED_0133 = join(repo, 'db/migrations/0133_one_reserved_handle_list.sql');
const INVENTORY = join(repo, 'docs/security/angola-bank-namespace-inventory.md');
const RUST = join(repo, 'core/identity/src/identity.rs');

const fail = (msg) => {
  console.error(`check-reserved-handles: ${msg}`);
  process.exit(1);
};
const read = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    fail(`cannot read ${p}`);
    return '';
  }
};

const gen = await import('./gen-reserved-handles.mjs');
const generated = gen.build();
const generatedSet = new Set(generated.map((r) => r.handle));

// --- helper: pull seeded handles from a migration's VALUES rows -------------
const seededHandles = (sql) => {
  const s = new Set();
  for (const m of sql.matchAll(/^\s*\('([a-z0-9_]+)'/gm)) s.add(m[1]);
  return s;
};

// --- 1. migration 0171 seed matches the generator exactly -------------------
const seeded = seededHandles(read(MIGRATION));
if (seeded.size === 0) fail('found no seeded handles in migration 0171 — parser or file broken');
{
  const missing = [...generatedSet].filter((h) => !seeded.has(h));
  const extra = [...seeded].filter((h) => !generatedSet.has(h));
  if (missing.length || extra.length) {
    if (missing.length) console.error(`  generated but NOT in migration (${missing.length}): ${missing.slice(0, 20).join(', ')}`);
    if (extra.length) console.error(`  in migration but NOT generated (${extra.length}): ${extra.slice(0, 20).join(', ')}`);
    fail('migration 0171 drifted from the generator — regenerate it');
  }
}

// --- 2. inventory doc matches `--inventory` ---------------------------------
if (read(INVENTORY).trim() !== gen.toInventory().trim()) {
  fail('docs/security/angola-bank-namespace-inventory.md is stale — regenerate with `node tools/gen-reserved-handles.mjs --inventory`');
}

// --- 3. single authority: no hand-kept reserved list declaration in Rust -----
// Match an actual const/static declaration, not mentions in comments.
if (/\b(?:const|static)\s+RESERVED_HANDLES\b/.test(read(RUST))) {
  fail('a RESERVED_HANDLES list is back in core/identity/src/identity.rs — namespace authority must be the registry alone, not a second hand-kept list');
}

// --- 4. 0133's reserved names are a subset of the canonical generator --------
{
  const legacy = seededHandles(read(SEED_0133));
  const uncovered = [...legacy].filter((h) => !generatedSet.has(h));
  if (uncovered.length) {
    console.error(`  reserved by 0133 but absent from the canonical source (${uncovered.length}): ${uncovered.join(', ')}`);
    fail('migration 0133 reserves a name the generator does not — add it so the generator stays the single source');
  }
}

// --- 5. every BNA bank (and ecosystem/regulator/payment) handle is seeded ----
{
  const { REGULATOR, ECOSYSTEM, BANKS, PAYMENT } = gen.institutions();
  const all = [...REGULATOR, ...ECOSYSTEM, ...BANKS, ...PAYMENT];
  const missing = [];
  for (const e of all) {
    for (const h of [e.canonical, ...e.aliases]) {
      if (!generatedSet.has(h)) missing.push(`${e.acronym}:${h}`);
    }
  }
  if (missing.length) {
    console.error(`  institution handles missing from the seed: ${missing.join(', ')}`);
    fail('a BNA/ecosystem/payment institution handle is not protected');
  }
}

// --- 6. every emitted handle is creatable + normalized ----------------------
{
  const bad = generated.filter((r) => !gen.creatable(r.handle));
  if (bad.length) fail(`not creatable under the canonical grammar: ${bad.map((r) => r.handle).join(', ')}`);
  const notNorm = generated.filter((r) => r.handle !== r.handle.trim().replace(/^@/, '').toLowerCase());
  if (notNorm.length) fail(`seeded handle not in normalized form: ${notNorm.map((r) => r.handle).join(', ')}`);
}

const { BANKS } = gen.institutions();
console.log(
  `check-reserved-handles: OK — ${generatedSet.size} protected handles, migration + inventory in sync, ` +
    `single authority (no Rust list), ${BANKS.length} BNA banks covered.`,
);
