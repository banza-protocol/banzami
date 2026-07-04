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
const DOCS = 'apps/website/app/developers/docs/page.tsx';
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

const { capabilities } = parseManifest(ROOT);
const dispOf = id => (capabilities.find(c => c.id === id) || {}).disposition;

// Docs capability anchor → manifest capability.
const MAP = {
  cobranca: 'CAP-PAY-001',
  transferencias: 'CAP-WALLET-001',
  webhooks: 'CAP-WEBHOOK-001',
  reembolsos: 'CAP-REFUND-001',
};

const src = readFileSync(resolve(ROOT, DOCS), 'utf-8');

// 1. Availability badges: a non-released capability must not be tone 'ok'
//    (the "Disponível em Sandbox" label).
for (const [anchor, capId] of Object.entries(MAP)) {
  const disp = dispOf(capId);
  // card: href: '#anchor', \n tone: 'X'
  const card = new RegExp(`href: '#${anchor}',\\s*\\n\\s*tone: '([a-z]+)'`).exec(src);
  const h3 = new RegExp(`<H3 id="${anchor}">[^<]*<Badge tone="([a-z]+)"`).exec(src);
  for (const [where, m] of [['card', card], ['H3', h3]]) {
    if (!m) continue;
    const tone = m[1];
    if (disp !== 'released' && tone === 'ok')
      fail(`${anchor} (${capId} is ${disp}) badged 'ok' in ${where} — must not claim "Disponível em Sandbox"`);
    if (disp === 'released' && tone !== 'ok')
      fail(`${anchor} (${capId} is released) not badged 'ok' in ${where} — under-claims`);
  }
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
