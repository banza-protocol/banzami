#!/usr/bin/env node
/**
 * check-docs-claims.mjs
 *
 * Docs-to-manifest claim consistency gate (Release Train 01). Fails if the
 * public Developer Docs badge a capability as "Disponível em Sandbox" (tone
 * 'ok') while the assurance manifest says that capability is NOT released.
 * Also fails on forbidden claims (/v1/charges, banzami-signature,
 * transaction_id refund input, refund_source presented as BANZA-normative).
 *
 * The manifest is authoritative; docs availability must be derived from it.
 *
 * Usage: node tools/check-docs-claims.mjs   (make check-docs-claims)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseManifest } from './assurance-manifest-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
// P3A information architecture: the documentation content lives in the PT
// area-content module (rendered across /docs/* routes); the landing page.tsx
// is a thin index. The claim checks therefore read content + landing together.
const DOCS_SOURCES = [
  'apps/website/app/developers/docs/content-pt.tsx',
  'apps/website/app/developers/docs/content-en.tsx',
  'apps/website/app/developers/docs/HomePage.tsx',
  'apps/website/app/developers/docs/CapabilityCards.tsx',
];
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

const { capabilities } = parseManifest(ROOT);
const dispOf = id => (capabilities.find(c => c.id === id) || {}).disposition;

// Docs capability page → manifest capability. Each capability card links to the
// page that documents it, and carries the tone its disposition earns.
const MAP = {
  payments: 'CAP-PAY-001',
  transfers: 'CAP-WALLET-001',
  webhooks: 'CAP-WEBHOOK-001',
  refunds: 'CAP-REFUND-001',
};

const src = DOCS_SOURCES.map(p => readFileSync(resolve(ROOT, p), 'utf-8')).join('\n');

// 1. Availability badges: a non-released capability must not be tone 'ok'
//    (the "Disponível em Sandbox" label).
for (const [slug, capId] of Object.entries(MAP)) {
  const disp = dispOf(capId);
  // card: href: { pt: '/docs/<slug>', en: '/docs/en/<slug>' },\n tone: 'X'
  const card = new RegExp(`href: \\{ pt: '/docs/${slug}', en: '/docs/en/${slug}' \\},\\s*\\n\\s*tone: '([a-z]+)'`).exec(src);
  // A card that cannot be found is a failure, not a pass: a check that matches
  // nothing proves nothing.
  if (!card) { fail(`no capability card links to /docs/${slug} with a tone — the badge cannot be checked`); continue; }
  const tone = card[1];
  if (disp !== 'released' && tone === 'ok')
    fail(`${slug} (${capId} is ${disp}) badged 'ok' — must not claim "Disponível em Sandbox"`);
  if (disp === 'released' && tone !== 'ok')
    fail(`${slug} (${capId} is released) not badged 'ok' — under-claims`);
}
if (failures === 0) pass('docs availability badges match manifest disposition');

// 2. Forbidden / stale claims.
const FORBIDDEN = [
  [/\/v1\/charges/, 'stale /v1/charges endpoint claim'],
  [/banzami-signature/, 'wrong webhook header banzami-signature (must be banza-signature)'],
  [/transaction_id["'\s:]/, 'public refund transaction_id input (must be typed source)'],
];
let bad = false;
for (const [re, label] of FORBIDDEN) if (re.test(src)) { fail(`docs contains ${label}`); bad = true; }
if (!bad) pass('no forbidden/stale claims (charges/banzami-signature/transaction_id)');

// 3. banza-signature present where webhooks are described (canonical).
if (/webhook/i.test(src) && !/banza-signature/.test(src))
  fail('webhooks described but banza-signature (canonical header) not referenced');
else pass('banza-signature canonical where webhooks are described');

console.log(failures ? `\n✗ Docs claim check FAILED (${failures})` : '\n✓ Docs claims consistent with manifest');
process.exit(failures ? 1 : 0);
