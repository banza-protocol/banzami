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

// Words that are English AND Portuguese. "Remove o projeto definitivamente" is
// the imperative of *remover*, and reading it as the English verb reported a
// correct Portuguese sentence as untranslated. Dropping the word would give up
// on catching a real English button, so it is checked where the ambiguity does
// not exist: as the exact name of a control. Prose says "Remove o projeto"; a
// button says "Remove".
const AMBIGUOUS = ['Remove'];

const hasEnglish = (text) => ENGLISH.filter((w) => {
  if (PRODUCT_NOUNS.includes(w) || AMBIGUOUS.includes(w)) return false;
  return new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'u').test(text);
});

/** Ambiguous words are English when they are the WHOLE name of a control. */
const englishControlNames = (names) =>
  [...new Set(names.map((n) => n.trim()).filter((n) => AMBIGUOUS.includes(n)))];
const hasEnums = (text) => [...new Set(text.match(ENUM_RE) ?? [])]
  .filter((e) => !PRODUCT_NOUNS.includes(e));

// The session is checked before anything prints. The detector selftest below is
// about this file and not about the product, but a reader counting ticks cannot
// see that, and a sweep whose first output is a tick is how the false-green runs
// read. Nothing is printed until there is a live session to print about.
import { requireLiveSession, assertAuthenticatedShell } from './lib/require-session.mjs';

const session = process.env.BZ_SESSION;
if (!process.argv.includes('--selftest')) {
  if (!session) { console.error('BZ_SESSION is required'); process.exit(2); }
  await requireLiveSession(session);
}

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

  // The literal rule, proven both ways. Relaxing a detector is how a sweep goes
  // quietly blind, so the relaxation is held by its own cases: a wire value the
  // page translates is documentation; the same value alone is residue.
  const literalCases = [
    ['Configuração financeira — Não configurado', 'NOT_CONFIGURED', []],
    ['Estado da candidatura: Aprovada', 'APPROVED', []],
    ['Estado da candidatura', 'NOT_CONFIGURED', ['NOT_CONFIGURED']],
    ['Resultado', 'PAYMENT_LINK', ['PAYMENT_LINK']],
  ];
  let blind = 0;
  for (const [prose, literal, want] of literalCases) {
    const got = hasEnums(literal).filter((e) =>
      !new RegExp(`(^|[^\\p{L}])(configurad|aprovad|pendente|rejeitad|ativ|revogad|arquivad|expirad|conclu|falh)`, 'iu').test(prose));
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      console.error(`  ✗ selftest: <code>${literal}</code> beside ${JSON.stringify(prose)} → ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
      blind += 1;
    }
  }
  if (blind) { console.error('the literal rule no longer distinguishes a translated value from a leaked one'); process.exit(2); }
  ok('a wire value the page translates is documentation; the same value alone is residue');

  // And the English check, now that it reads prose only.
  if (hasEnglish('Remove o projeto definitivamente').length !== 0) {
    console.error('  ✗ selftest: "Remove o projeto" is Portuguese and was counted as English');
    process.exit(2);
  }
  if (hasEnglish('Delete this project permanently').length === 0) {
    console.error('  ✗ selftest: English prose is no longer detected');
    process.exit(2);
  }
  if (englishControlNames(['Remover projeto', 'Guardar']).length !== 0
    || JSON.stringify(englishControlNames(['Remove', 'Guardar'])) !== JSON.stringify(['Remove'])) {
    console.error('  ✗ selftest: an ambiguous word is not being judged by whether it names a control');
    process.exit(2);
  }
  ok('"Remove o projeto" is Portuguese prose; a button named exactly "Remove" is not');
}

if (process.argv.includes('--selftest')) {
  console.log('\nCONSOLE_LOCALE_SWEEP: selftest only');
  process.exit(0);
}

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

/**
 * The prose, and the literals, read separately.
 *
 * Two false reports came out of reading the page as one string. "Remove o
 * projeto definitivamente" is Portuguese — the imperative of *remover* — and was
 * counted as the English word. And `NOT_CONFIGURED` appears on /financeiro
 * inside a <code>, immediately after "Não configurado": that is the API's own
 * value shown beside its translation, which is the point of a developer console,
 * not a wire value that escaped.
 *
 * So a literal marked up as a literal — <code>, <pre>, <kbd>, <samp> — is read
 * out of the prose and checked only for being labelled, and the English check
 * runs on the prose that remains.
 */
const readPage = () => page.evaluate(() => {
  const clone = document.body.cloneNode(true);
  const literals = [];
  for (const el of clone.querySelectorAll('code, pre, kbd, samp')) {
    literals.push((el.textContent ?? '').trim());
    el.remove();
  }
  return { prose: (clone.innerText ?? clone.textContent ?? '').replace(/\s+/g, ' '), literals };
});

for (const route of ROUTES) {
  await page.goto(ORIGIN + route, { waitUntil: 'networkidle' });
  await assertAuthenticatedShell(page, route);
  const { prose, literals } = await readPage();
  const text = prose;

  const controlNames = await page.evaluate(() => [...document.querySelectorAll('a[href], button, [role="button"]')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((el) => el.getAttribute('aria-label') || (el.textContent ?? '').trim()));
  const english = [...hasEnglish(text), ...englishControlNames(controlNames)];
  // A literal is fine where it is announced as one; it is residue where it is
  // the only thing the reader is given.
  const enums = [...hasEnums(text), ...literals.flatMap((l) => hasEnums(l))
    .filter((e) => !new RegExp(`(^|[^\\p{L}])(configurad|aprovad|pendente|rejeitad|ativ|revogad|arquivad|expirad|conclu|falh)`, 'iu').test(text))];

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
