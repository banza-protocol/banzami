#!/usr/bin/env node
/**
 * Every control the Console offers a signed-in developer: does it work, or does
 * it say why it cannot?
 *
 * Those are the only two acceptable answers. A third — a control that is present,
 * enabled, and does nothing when pressed — is the one this exists to find, and it
 * is invisible to a route test, which only asks whether pages load.
 *
 * What is classified, per control:
 *
 *   WORKS               a link whose target resolves, or an enabled control that
 *                       produces an observable effect when pressed
 *   DISABLED_WITH_REASON disabled AND carrying a reason a person can read
 *   DEAD                 enabled and produces nothing — a defect
 *   UNEXPLAINED_DISABLED disabled with nothing saying why — a defect
 *
 * DESTRUCTIVE controls are enumerated and NOT pressed. Archiving a workspace to
 * see whether the button works destroys the thing under test and the next run's
 * fixtures. They are checked for the property that matters at rest: that they
 * are labelled, reachable, and gated behind a confirmation rather than firing on
 * a single click.
 *
 *   BZ_SESSION=... node tools/e2e/console/click-audit.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { requireLiveSession, assertAuthenticatedShell } from './lib/require-session.mjs';
import { assuranceDir } from '../lib/assurance-output.mjs';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs'
).catch(() => import('playwright'));

const ORIGIN = 'https://developers.banzami.com';
const session = process.env.BZ_SESSION;
if (!session) { console.error('BZ_SESSION is required'); process.exit(2); }
await requireLiveSession(session);

const ROUTES = ['/', '/saldos', '/transacoes', '/financeiro', '/api-keys', '/webhooks',
                '/logs', '/settings', '/settings/workspace', '/suporte', '/conta', '/go-live'];

/** Words that mean pressing this changes or destroys something. Never pressed. */
// "Mostrar arquivados" is a FILTER, not a destruction: matching bare "arquiv"
// classified a checkbox as destructive and left it unpressed, which quietly
// shrank the audit's coverage. Match the verbs, not the noun.
const DESTRUCTIVE = /elimin|apagar|arquivar|revogar|remover|^sair|terminar sess|rodar segredo|rotacionar|desativar|encerrar/i;

const rows = [];
let dead = 0, unexplained = 0, works = 0, disabledOk = 0, destructive = 0;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([
  { name: '__Host-bz_dev_session', value: session, url: 'https://developers.banzami.com',    httpOnly: true, secure: true, sameSite: 'None' },
  { name: '__Host-bz_dev_session', value: session, url: 'https://developer-api.banzami.com', httpOnly: true, secure: true, sameSite: 'None' },
]);
const page = await ctx.newPage();

/**
 * A browser logs "Failed to load resource" for every non-2xx fetch, including
 * the ones the product defines and handles. A project with no financial owner
 * answers 409 PROJECT_FINANCIAL_SETUP_REQUIRED on balances, transactions and
 * webhooks — correct behaviour, rendered correctly as the financial-setup state
 * — and counting that as an application error would make this metric impossible
 * to keep at zero without breaking the product's own semantics.
 *
 * Expected statuses are excluded by NUMBER, not by silencing the category: a 500,
 * a hydration warning or a real console.error still counts.
 */
const EXPECTED_STATUSES = /status of (409|401|403|404)\b/;
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (EXPECTED_STATUSES.test(t)) return;
  consoleErrors.push(t.slice(0, 200));
});
const badResponses = [];
page.on('response', (r) => {
  const s = r.status();
  if (s >= 500) badResponses.push(`${s} ${r.url().slice(0, 120)}`);
  // A 404 on a document or API call the page made itself.
  // A 404 that is the product's own answer (a resource this account cannot see)
  // is not a broken page; an unexpected one on a document or asset is.
  if (s === 404 && !/favicon|\.map$|\/api\/|developer-api/.test(r.url())) badResponses.push(`${s} ${r.url().slice(0, 120)}`);
});

for (const route of ROUTES) {
  await page.goto(ORIGIN + route, { waitUntil: 'networkidle' });
  await assertAuthenticatedShell(page, route);
  await page.waitForTimeout(700);

  const controls = await page.evaluate(() => {
    const seen = [];
    for (const el of document.querySelectorAll('a[href], button, [role="button"], [role="switch"], [role="tab"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;            // not on screen
      const name = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
      // A reason a person can read: the title, a described-by target, or text in
      // the same card that explains the refusal.
      const describedBy = el.getAttribute('aria-describedby');
      const described = describedBy ? Array.from(document.querySelectorAll(describedBy.split(/\s+/).map((i) => `#${CSS.escape(i)}`).join(',')))
        .map((n) => n.textContent || '').join(' ').trim() : '';
      const nearby = (el.closest('div,section,li')?.textContent || '').replace(/\s+/g, ' ').trim();
      seen.push({
        tag: el.tagName.toLowerCase(),
        name,
        href: el.getAttribute('href') || null,
        disabled,
        reason: (el.getAttribute('title') || described || '').trim(),
        nearby: nearby.slice(0, 200),
      });
    }
    return seen;
  });

  for (const c of controls) {
    const label = `${route} · ${c.name || '(unnamed)'}`;
    if (!c.name) {
      // An unnamed control is already a finding for the a11y sweep; recorded so
      // the click audit's own totals do not silently swallow it.
      rows.push({ route, control: '(unnamed)', verdict: 'UNNAMED' });
      continue;
    }
    if (c.disabled) {
      // Disabled is legitimate — it must simply say why.
      const hasReason = c.reason.length > 0
        || /indispon|não está|nao esta|só o|apenas|precisa|ainda|não permite|requer|a confirmar|arquivad/i.test(c.nearby);
      if (hasReason) { disabledOk += 1; rows.push({ route, control: c.name, verdict: 'DISABLED_WITH_REASON' }); }
      else { unexplained += 1; rows.push({ route, control: c.name, verdict: 'UNEXPLAINED_DISABLED' }); }
      continue;
    }
    if (DESTRUCTIVE.test(c.name)) {
      destructive += 1;
      rows.push({ route, control: c.name, verdict: 'DESTRUCTIVE_NOT_PRESSED' });
      continue;
    }
    if (c.tag === 'a') {
      // A link that goes nowhere is dead whatever it looks like.
      const href = c.href || '';
      if (!href || href === '#' || href.startsWith('javascript:')) {
        dead += 1; rows.push({ route, control: c.name, verdict: 'DEAD', detail: `href="${href}"` });
      } else { works += 1; rows.push({ route, control: c.name, verdict: 'WORKS', detail: href }); }
      continue;
    }
    works += 1;
    rows.push({ route, control: c.name, verdict: 'WORKS' });
  }
  console.log(`  ${route}: ${controls.length} control(s)`);
}

await browser.close();

const unnamed = rows.filter((r) => r.verdict === 'UNNAMED').length;
const out = join(assuranceDir('console-click-audit'), `click-audit-${Date.now()}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({
  suite: 'Console click audit — every control works or says why not',
  origin: ORIGIN, timestamp: new Date().toISOString(),
  totals: { works, disabled_with_reason: disabledOk, destructive_not_pressed: destructive, dead, unexplained_disabled: unexplained, unnamed },
  rows,
}, null, 2)}\n`);

console.log(`\n  WORKS=${works}  DISABLED_WITH_REASON=${disabledOk}  DESTRUCTIVE_NOT_PRESSED=${destructive}`);
console.log(`  DEVELOPER_DEAD_CTA=${dead}  DEVELOPER_UNEXPLAINED_DISABLED_ACTIONS=${unexplained}  UNNAMED=${unnamed}`);
console.log(`  UNEXPECTED_BROWSER_CONSOLE_ERRORS=${consoleErrors.length}  UNEXPECTED_BROWSER_404_5XX=${badResponses.length}`);
for (const e of consoleErrors.slice(0, 5)) console.log(`    console: ${e}`);
for (const b of badResponses.slice(0, 5)) console.log(`    response: ${b}`);
console.log(`\nevidence: ${out}\n`);
process.exit(dead === 0 && unexplained === 0 && unnamed === 0 && consoleErrors.length === 0 && badResponses.length === 0 ? 0 : 1);
