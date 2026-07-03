#!/usr/bin/env node
// PROTOTYPE — authoritative schema-manifest drift detector.
//
// Compares a reviewable expected-schema MANIFEST against the live physical
// schema (introspect.sql output). Fails (exit 1) on any recorded-but-absent
// object and prints a readable diff. This is the AUTHORITATIVE source of truth
// for CI/deploy gating; the SQL-parser reconciliation is supplementary only.
//
// Usage:
//   psql -tAc "$(cat introspect.sql)" "$DATABASE_URL" > inventory.json
//   node check-schema-manifest.mjs schema-manifest.example.json inventory.json
//
// Exit 0 = schema satisfies the manifest; exit 1 = drift found.

import { readFileSync } from 'node:fs';

const [manifestPath, inventoryPath] = process.argv.slice(2);
if (!manifestPath || !inventoryPath) {
  console.error('usage: check-schema-manifest.mjs <manifest.json> <inventory.json>');
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const inv = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const tables = new Set(inv.tables || []);
const indexes = new Set(inv.indexes || []);
const columns = inv.columns || {}; // { "table.column": isNullable }

const problems = [];
for (const f of manifest.features || []) {
  for (const t of f.tables || []) {
    if (!tables.has(t.name)) {
      problems.push({ feature: f.feature, kind: 'MISSING TABLE', object: t.name });
      continue; // columns/indexes moot if the table is absent
    }
    for (const c of t.columns || []) {
      const key = `${t.name}.${c.name}`;
      if (!(key in columns)) {
        problems.push({ feature: f.feature, kind: 'MISSING COLUMN', object: key });
      } else if (typeof c.nullable === 'boolean' && columns[key] !== c.nullable) {
        problems.push({
          feature: f.feature, kind: 'NULLABILITY MISMATCH',
          object: `${key} (manifest nullable=${c.nullable}, live nullable=${columns[key]})`,
        });
      }
    }
    for (const idx of t.indexes || []) {
      if (!indexes.has(idx)) problems.push({ feature: f.feature, kind: 'MISSING INDEX', object: idx });
    }
  }
}

if (problems.length === 0) {
  console.log('✓ schema manifest satisfied — no drift.');
  process.exit(0);
}
console.error(`✗ schema drift: ${problems.length} object(s) recorded/expected but absent:\n`);
for (const p of problems) console.error(`  [${p.feature}] ${p.kind}: ${p.object}`);
console.error('\nDeploy/CI gate: FAIL. Prepare a forward-only repair migration; do not backfill migration history.');
process.exit(1);
