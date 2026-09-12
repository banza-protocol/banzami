#!/usr/bin/env node
/**
 * Is the Console actually in Portuguese, on screen?
 *
 * A source grep answers a different question. It sees the strings a component
 * declares and misses the ones the product gets from elsewhere: a server error
 * message rendered verbatim, an enum echoed into a status pill, a label that
 * only appears once a dialog is open. Those are exactly the words that reach a
 * developer in the moment something has gone wrong, which is the worst moment to
 * meet a language they did not choose.
 *
 * So this reads the rendered DOM of the deployed Console and looks for two
 * things:
 *
 *   * English platform vocabulary — the words the product kept saying in English
 *     because they felt technical ("Owner", "Secret", "Revoked", "Switch to
 *     Live"). Portuguese has all of them.
 *   * a raw wire enum leaking into view — SCREAMING_SNAKE or bare uppercase
 *     codes like ACTIVE, INVITED, PAYMENT_LINK. A person should never be shown
 *     the value the API sends.
 *
 * Product nouns are allowed and listed explicitly: Sandbox, Live, Banzami, API,
 * SDK, webhook, and the key prefixes. A name is not a translation failure. The
 * list is short and enumerated so it cannot quietly absorb a real English word.
 *
 *   BZ_SESSION=... node tools/e2e/console/locale-sweep.mjs
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs');

const ORIGIN = 'https://developers.banzami.com';
const ROUTES = ['/dashboard', '/saldos', '/transacoes', '/api-keys', '/webhooks', '/logs', '/settings', '/settings/workspace', '/financeiro', '/go-live', '/suporte', '/conta'];

// English words that have a Portuguese equivalent the product should be using.
// Whole-word, case-sensitive where capitalisation is the tell.
const ENGLISH = [
  'Switch to Live', 'Owner', 'Admin', 'Developer', 'Finance', 'Viewer',
  'Secret', 'Publishable', 'Revoked', 'Active', 'Created', 'Last used',
  'Scopes', 'Endpoints', 'Delete', 'Remove', 'Settings', 'Members',
  'Loading', 'Save', 'Cancel', 'Copy', 'Search', 'Filter',
];

// Names, not translations. Enumerated so the allowance cannot grow by accident.
const PRODUCT_NOUNS = [
  'Sandbox', 'Live', 'Banzami', 'BANZA', 'API', 'API Keys', 'SDK', 'Webhooks',
  'Webhook', 'webhook', 'Logs', 'Developers', 'Node', 'JavaScript', 'TypeScript',
  'Python', 'PHP', 'Flutter', 'JSON', 'HTTP', 'HTTPS', 'URL', 'ID', 'PDF', 'QR',
  'Kz', 'AOA', 'KYB', 'KYC', 'Multicaixa', 'EMIS',
];

// A wire enum on screen: two or more uppercase letters, optionally joined by
// underscores, standing alone. Product nouns and currency codes are excluded by
// the allow-list above.
const ENUM_RE = /\b[A-Z][A-Z0-9]{1,}(?:_[A-Z0-9]+)+\b|\b(?:ACTIVE|REVOKED|PENDING|INVITED|SUSPENDED|ARCHIVED|COMPLETED|FAILED|SUCCESS|EXPIRED|USED)\b/g;

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };

const hasEnglish = (text) => ENGLISH.filter((w) => {
  if (PRODUCT_NOUNS.includes(w)) return false;
  return new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'u').test(text);
});
const hasEnums = (text) => [...new Set(text.match(ENUM_RE) ?? [])]
  .filter((e) => !PRODUCT_NOUNS.includes(e));

// A sweep run against an empty account passes because there is nothing on the
// page, not because the page is right — so the detectors prove themselves on
// fixed strings before the run, and the suite fails if they have gone blind.
// This is what stops a page full of ACTIVE pills from being reported as clean.
{
  const cases = [
    ['Estado ACTIVE', { enums: ['ACTIVE'], english: [] }],
    ['Operação PAYMENT_LINK', { enums: ['PAYMENT_LINK'], english: [] }],
    ['O seu papel: Owner', { enums: [], english: ['Owner'] }],
    ['Estado Ativa — tudo em português, no Sandbox, com Kz', { enums: [], english: [] }],
  ];
  let broken = 0;
  for (const [text, want] of cases) {
    const gotEnums = hasEnums(text), gotEnglish = hasEnglish(text);
    if (JSON.stringify(gotEnums) !== JSON.stringify(want.enums)
      || JSON.stringify(gotEnglish) !== JSON.stringify(want.english)) {
      console.error(`  ✗ selftest: ${JSON.stringify(text)} → enums ${JSON.stringify(gotEnums)} english ${JSON.stringify(gotEnglish)}`);
      broken += 1;
    }
  }
  if (broken) { console.error('the locale detectors no longer detect — refusing to report a clean sweep'); process.exit(2); }
  ok('the detectors catch a wire enum, an English role, and leave Portuguese alone');
}

if (process.argv.includes('--selftest')) {
  console.log('\nCONSOLE_LOCALE_SWEEP: selftest only');
  process.exit(0);
}

import { requireLiveSession, assertAuthenticatedShell } from './lib/require-session.mjs';

const session = process.env.BZ_SESSION;
if (!session) { console.error('BZ_SESSION is required'); process.exit(2); }
await requireLiveSession(session);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
// The cookie must reach BOTH hosts. It was set only for the API host while every
// page is served from the Console host, so the browser sent nothing with the
// document request and every route rendered the LOGIN page — this sweep reported
// "no English platform vocabulary" about a screen with no product on it.
await ctx.addCookies([{
  name: '__Host-bz_dev_session', value: session,
  url: 'https://developers.banzami.com', httpOnly: true, secure: true, sameSite: 'None',
}, {
  name: '__Host-bz_dev_session', value: session,
  url: 'https://developer-api.banzami.com', httpOnly: true, secure: true, sameSite: 'None',
}]);
const page = await ctx.newPage();

for (const route of ROUTES) {
  await page.goto(ORIGIN + route, { waitUntil: 'networkidle' });
  await assertAuthenticatedShell(page, route);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  const english = hasEnglish(text);
  const enums = hasEnums(text);

  if (english.length) bad(`${route}: English on screen — ${english.join(', ')}`);
  else ok(`${route}: no English platform vocabulary`);

  if (enums.length) bad(`${route}: a wire value reached the screen — ${enums.join(', ')}`);
  else ok(`${route}: no raw enum on screen`);
}

// The document must declare Portuguese, or a screen reader pronounces it as
// English and assistive translation offers to translate it into itself.
const lang = await page.getAttribute('html', 'lang');
lang === 'pt' ? ok('the document declares lang="pt"') : bad(`document lang is "${lang}"`);

await b.close();
console.log(`\nCONSOLE_LOCALE_SWEEP: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
