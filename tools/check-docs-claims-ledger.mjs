#!/usr/bin/env node
/**
 * Every claim the developer documentation makes has been audited, and the audit
 * still describes the text on the page.
 *
 *   UNCLASSIFIED_CLAIMS   a claim on the page the ledger has no entry for —
 *                         new or rewritten, and nobody has checked it
 *   STALE_LEDGER_ENTRIES  a ledger entry whose claim no longer exists
 *   LEDGER_PT_EN_DRIFT    a page whose Portuguese and English claim counts differ
 *
 *   node tools/check-docs-claims-ledger.mjs
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractClaims } from './docs/claims.mjs';

const ROOT = process.env.BZ_DOCS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const ledger = JSON.parse(readFileSync(join(ROOT, 'docs/quality/developer-documentation-claims.json'), 'utf8')).claims;
const claims = extractClaims(ROOT);

const ids = new Set(claims.map((c) => c.id));
const unclassified = claims.filter((c) => !ledger[c.id]);
const stale = Object.keys(ledger).filter((id) => !ids.has(id));
const byPage = {};
for (const c of claims) { byPage[c.page] ??= { pt: 0, en: 0 }; byPage[c.page][c.lang] += 1; }
const drift = Object.entries(byPage).filter(([, v]) => v.pt !== v.en).map(([p, v]) => `${p}: PT ${v.pt} ≠ EN ${v.en}`);

const counts = {};
for (const c of claims) if (ledger[c.id]) counts[ledger[c.id].class] = (counts[ledger[c.id].class] ?? 0) + 1;

console.log(`developer documentation — claim ledger\n\n  ${claims.length} claim(s) on the pages · ${JSON.stringify(counts)}`);
for (const c of unclassified.slice(0, 20)) console.error(`  ✗ UNCLASSIFIED ${c.id} — ${c.text.slice(0, 110)}`);
for (const s of stale.slice(0, 10)) console.error(`  ✗ STALE ${s} — ${ledger[s].text.slice(0, 90)}`);
for (const d of drift) console.error(`  ✗ DRIFT ${d}`);

console.log(`\nDOCS_CLAIMS_TOTAL=${claims.length}`);
console.log(`UNCLASSIFIED_CLAIMS=${unclassified.length}`);
console.log(`STALE_LEDGER_ENTRIES=${stale.length}`);
console.log(`LEDGER_PT_EN_DRIFT=${drift.length}`);
const ok = unclassified.length === 0 && stale.length === 0 && drift.length === 0;
console.log(`DEVELOPER_DOCUMENTATION_AUDIT_COMPLETE=${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
