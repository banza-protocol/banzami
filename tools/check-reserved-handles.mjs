#!/usr/bin/env node
// Guard: the protected @banza namespace cannot drift from its canonical source.
//
// Fails CI when:
//   1. migration 0171's seeded handles != tools/gen-reserved-handles.mjs output
//      (someone hand-edited the migration, or changed the generator without
//      regenerating). Fresh-DB reproducibility depends on these being identical.
//   2. the Rust core RESERVED_HANDLES array (core/identity/src/identity.rs) is
//      NOT a subset of the seeded namespace — i.e. Core would refuse a name the
//      DB does not also block, or block one the DB never seeds (the A3-07
//      split-brain). Core's fast-path list must be covered by the DB authority.
//   3. any emitted handle is not creatable under the Business grammar (a dead
//      row no signup could ever hit) or is not already normalized.
//
// Read-only. No DB, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const MIGRATION = join(repo, 'db/migrations/0171_handle_namespace_protection.sql');
const RUST = join(repo, 'core/identity/src/identity.rs');

const fail = (msg) => {
  console.error(`check-reserved-handles: ${msg}`);
  process.exit(1);
};

const { build, creatable } = await import('./gen-reserved-handles.mjs');
const generated = build();
const generatedSet = new Set(generated.map((r) => r.handle));

// --- 1. migration seed matches the generator exactly ------------------------
let sql;
try {
  sql = readFileSync(MIGRATION, 'utf8');
} catch {
  fail(`cannot read ${MIGRATION}`);
}
// Pull handles from the VALUES rows: lines like  ('name', 'SYSTEM'|'PROTECTED', ...
const seeded = new Set();
for (const m of sql.matchAll(/^\s*\('([a-z0-9_]+)',\s*'(SYSTEM|PROTECTED)'/gm)) {
  seeded.add(m[1]);
}
if (seeded.size === 0) fail('found no seeded handles in the migration — parser or file broken');

const missingInMigration = [...generatedSet].filter((h) => !seeded.has(h));
const extraInMigration = [...seeded].filter((h) => !generatedSet.has(h));
if (missingInMigration.length || extraInMigration.length) {
  if (missingInMigration.length) {
    console.error(`  generated but NOT in migration (${missingInMigration.length}): ${missingInMigration.slice(0, 20).join(', ')}${missingInMigration.length > 20 ? ' …' : ''}`);
  }
  if (extraInMigration.length) {
    console.error(`  in migration but NOT generated (${extraInMigration.length}): ${extraInMigration.slice(0, 20).join(', ')}${extraInMigration.length > 20 ? ' …' : ''}`);
  }
  fail('migration 0171 drifted from tools/gen-reserved-handles.mjs — regenerate it');
}

// --- 2. Rust RESERVED_HANDLES is a subset of the seeded namespace -----------
let rust;
try {
  rust = readFileSync(RUST, 'utf8');
} catch {
  fail(`cannot read ${RUST}`);
}
const arrMatch = rust.match(/RESERVED_HANDLES[^=]*=\s*&\[([\s\S]*?)\];/);
if (!arrMatch) fail('could not locate RESERVED_HANDLES array in core/identity/src/identity.rs');
const rustHandles = [...arrMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (rustHandles.length === 0) fail('RESERVED_HANDLES parsed as empty');

const rustNotSeeded = rustHandles.filter((h) => !generatedSet.has(h));
if (rustNotSeeded.length) {
  console.error(`  Rust RESERVED_HANDLES names not in the DB seed (${rustNotSeeded.length}): ${rustNotSeeded.join(', ')}`);
  fail('Core would refuse a handle the DB authority does not seed — add them to tools/gen-reserved-handles.mjs');
}

// --- 3. every emitted handle is creatable + normalized ----------------------
const badGrammar = generated.filter((r) => !creatable(r.handle));
if (badGrammar.length) {
  console.error(`  not creatable under the Business grammar: ${badGrammar.map((r) => r.handle).join(', ')}`);
  fail('a seeded handle no signup could ever produce is dead weight');
}
const notNormalized = generated.filter((r) => r.handle !== r.handle.trim().replace(/^@/, '').toLowerCase());
if (notNormalized.length) {
  fail(`seeded handle not in normalized form: ${notNormalized.map((r) => r.handle).join(', ')}`);
}

console.log(
  `check-reserved-handles: OK — ${generatedSet.size} protected handles, migration in sync, ` +
    `Rust RESERVED_HANDLES (${rustHandles.length}) ⊆ seed.`,
);
