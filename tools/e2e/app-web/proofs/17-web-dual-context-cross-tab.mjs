#!/usr/bin/env node
/**
 * APP-BANZAMI-WEB-BUSINESS-001 — Proof 17: dual-context CROSS-TAB browser E2E
 * (FINAL EVIDENCE DEBT CLOSURE §1 — WEB_DUAL_CONTEXT_CROSS_TAB).
 *
 * The rendered, two-tab complement to proof 12 (which proves the session/authority
 * semantics over HTTP). ONE real browser context (one opaque cookie) holds BOTH
 * authorities and drives TWO live tabs at once, each signed in through the real UI:
 *
 *   Tab A → app.banzami.com/          (Pessoal / Consumer shell)  — UI registration
 *   Tab B → app.banzami.com/business  (Business shell)            — @handle+PIN
 *
 * and we assert, on the actual rendered Flutter surfaces:
 *   - Tab A shows only Consumer identity/state; Tab B shows only Business;
 *   - no Business data appears in the Consumer tab and vice-versa;
 *   - both authorities coexist in the one opaque cookie;
 *   - changing the shared active_context does NOT change what a tab renders nor
 *     revoke its authority (context is a preference, authority is by route);
 *   - Business logout propagates: the Business route → 401 and Tab B falls back to
 *     the Business login on reload;
 *   - the Consumer tab REMAINS valid when only the Business authority is removed
 *     (its Home stays rendered and /consumer/v1/me still authorises).
 *
 * The two tabs live in ONE browser context so they share the single opaque
 * cookie — that sharing is the whole point. One consumer registration through the
 * real UI (per-IP limit aware); the Business is provisioned via the public edge.
 *
 *   BANZAMI_E2E=RUN node proofs/17-web-dual-context-cross-tab.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { FlutterSemanticsDriver } from '../lib/semantics-driver.mjs';
import { WelcomePage } from '../pages/welcome.mjs';
import { CreateAccountPage } from '../pages/create-account.mjs';
import { PinPage } from '../pages/pin.mjs';
import { HomePage } from '../pages/home.mjs';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';
import { retireConsumer } from '../lib/consumer-retire.mjs';

const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';
const R = new GateReport('17-web-dual-context-cross-tab');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (process.env.BANZAMI_E2E !== 'RUN') { console.error('set BANZAMI_E2E=RUN'); process.exit(2); }

const BUSINESS_MARKER = 'Carteira Banzami Business'; // appears ONLY in the Business shell
const RATE_RE = /Demasiadas tentativas|Too many attempts/i;

// A same-origin fetch INSIDE a page, so it uses that page's (shared) cookie jar.
async function apiFetch(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const csrf = (document.cookie.match(/(?:^|;\s*)bz_app_csrf=([^;]+)/) || [])[1] || '';
    const headers = {};
    if (body !== undefined) { headers['content-type'] = 'application/json'; headers['x-csrf-token'] = decodeURIComponent(csrf); }
    const res = await fetch(path, { method, headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  }, { method, path, body });
}

// Register a consumer through the REAL UI on a page in the SHARED context, so the
// consumer authority lands in the one cookie both tabs use. Respects the per-IP
// registration limit with a short backoff.
async function registerConsumerUI(page, d, handle) {
  const welcome = new WelcomePage(d), create = new CreateAccountPage(d), pinp = new PinPage(d), home = new HomePage(d);
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      await welcome.reach(); await welcome.tapCreateAccount();
      await create.reach(); await create.fill({ handle, name: 'E2E Pessoal' }); await create.submit();
      if (RATE_RE.test(await d.visibleText())) throw Object.assign(new Error('rate'), { rate: true });
      await pinp.createDuringOnboarding('481516');
      await home.reach();
      return true;
    } catch (e) {
      const rate = e.rate || RATE_RE.test(await d.visibleText().catch(() => ''));
      if (rate && attempt < 3) { const w = 45000 * (attempt + 1); console.log(`[reg] rate-limited; waiting ${w / 1000}s`); await sleep(w); await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' }); await d.enableSemantics(); continue; }
      throw e;
    }
  }
  return false;
}

(async () => {
  let biz; const consumerHandle = `e2ecta${Date.now().toString(36)}`.toLowerCase();
  const { browser } = await launchChromium();
  try {
    biz = await provisionBusiness({ handlePrefix: 'e2ectbiz' });
    const bizName = `E2E ${biz.handle}`;
    R.mark('GENERIC_SYNTHETIC_BUSINESS_PROVISIONED', !!biz.handle, `@${biz.handle}`);

    // ── One browser context = one opaque cookie, shared by both tabs. ──
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

    // Tab A: Consumer, signed in through the real UI (lands on Home in-session).
    const pageA = await ctx.newPage();
    await pageA.goto(`${APP}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const dA = new FlutterSemanticsDriver(pageA, { label: 'tabA' });
    await dA.enableSemantics();
    const aHome = await registerConsumerUI(pageA, dA, consumerHandle).catch((e) => { console.log('regUI failed:', e.message); return false; });
    R.mark('CONSUMER_TAB_RENDERS_HOME', aHome, 'Tab A signed in and rendered the Consumer Home');

    // Tab B: Business, @handle+PIN through the real UI — SAME context → SAME cookie.
    const pageB = await ctx.newPage();
    await pageB.goto(`${APP}/business`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const dB = new FlutterSemanticsDriver(pageB, { label: 'tabB' });
    await dB.enableSemantics();
    await dB.waitForText('Business', { timeout: 20000 });
    await dB.fillFieldBySemantics('O seu @banza', biz.handle, { verify: false });
    await dB.fillFieldBySemantics('PIN', biz.pin, { secret: true, verify: false });
    await dB.tapButton('Entrar');
    const bHome = await dB.waitForText('Saldo disponível', { timeout: 30000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_TAB_RENDERS_HOME', bHome, 'Tab B reached the Business Home in the same browser context');

    // ── Both authorities coexist in one cookie (rendered dual context). ──
    const stateBoth = (await apiFetch(pageB, 'GET', '/session/state')).json || {};
    R.mark('WEB_DUAL_CONTEXT_ONE_COOKIE', stateBoth.personal === true && stateBoth.business === true,
      `one cookie carries personal=${stateBoth.personal} + business=${stateBoth.business}`);

    // ── Identity isolation on the RENDERED (live, un-reloaded) surfaces. ──
    const aText = await dA.visibleText();
    const bText = await dB.visibleText();
    const aClean = aText.includes('Saldo disponível') && !aText.includes(BUSINESS_MARKER) && !aText.includes(bizName) && !aText.includes(`@${biz.handle}`);
    R.mark('CONSUMER_TAB_SHOWS_ONLY_CONSUMER', aClean, aClean ? 'Consumer Home only — no Business identity/wallet' : `LEAK: ${aText.slice(0, 90)}`);
    const bClean = bText.includes(BUSINESS_MARKER) && bText.includes(`@${biz.handle}`) && !bText.includes(consumerHandle);
    R.mark('BUSINESS_TAB_SHOWS_ONLY_BUSINESS', bClean, bClean ? 'Business Home only — no Consumer identity' : `LEAK: ${bText.slice(0, 90)}`);
    R.mark('NO_BUSINESS_DATA_IN_CONSUMER_TAB', !aText.includes(BUSINESS_MARKER) && !aText.includes(bizName), 'Business wallet/name absent from the Consumer tab');
    R.mark('NO_CONSUMER_DATA_IN_BUSINESS_TAB', !bText.includes(consumerHandle), `consumer @${consumerHandle} absent from the Business tab`);

    // ── active_context is a shared PREFERENCE, not per-tab authority. Flipping it
    //    from the Consumer tab neither revokes the Consumer authority nor changes
    //    what the Consumer tab renders (no reload; route wins). ──
    const flip = await apiFetch(pageA, 'POST', '/session/context', { context: 'business' });
    const aMeAfterFlip = await apiFetch(pageA, 'GET', '/consumer/v1/me');
    const aStillText = await dA.visibleText();
    R.mark('ACTIVE_CONTEXT_DOES_NOT_TRANSFER_TAB_AUTHORITY',
      flip.status === 200 && aMeAfterFlip.status === 200 && aStillText.includes('Saldo disponível') && !aStillText.includes(BUSINESS_MARKER),
      `active_context=business, yet the Consumer tab still authorises (/me ${aMeAfterFlip.status}) and renders the Consumer shell`);

    // ── Business logout propagates; Consumer survives (only Business removed). ──
    const loRes = await apiFetch(pageB, 'POST', '/business/api/v1/merchant/auth/logout', {});
    const bAfter = await apiFetch(pageB, 'GET', '/business/api/v1/business/receive-point');
    const cAfter = await apiFetch(pageA, 'GET', '/consumer/v1/me');
    R.mark('BUSINESS_LOGOUT_REVOKES_BUSINESS_ROUTE', bAfter.status === 401, `business receive-point after logout → ${bAfter.status} (logout HTTP ${loRes.status})`);
    R.mark('CONSUMER_SURVIVES_BUSINESS_LOGOUT', cAfter.status === 200, `consumer /me after Business logout → ${cAfter.status}`);

    // Tab B, reloaded, falls back to the Business login (business restores from the
    // cookie on load; with the authority gone it shows the login).
    await pageB.reload({ waitUntil: 'domcontentloaded' }); await dB.enableSemantics();
    const bLoggedOut = await dB.waitForText('Business', { timeout: 20000 }).then(async () => {
      const t = await dB.visibleText();
      return t.includes('Entrar') && !t.includes(BUSINESS_MARKER);
    }).catch(() => false);
    R.mark('BUSINESS_TAB_PROPAGATES_LOGOUT', bLoggedOut, 'Tab B fell back to the Business login after logout');

    // The Consumer tab is untouched: its Home is still rendered and it still authorises.
    const aSurvivesText = await dA.visibleText();
    const aMeSurvives = await apiFetch(pageA, 'GET', '/consumer/v1/me');
    R.mark('CONSUMER_TAB_STILL_VALID', aSurvivesText.includes('Saldo disponível') && aMeSurvives.status === 200,
      `Consumer tab still on Home; /me → ${aMeSurvives.status} after Business-only logout`);

    // Verdict.
    const core = R.gates.filter((g) => [
      'CONSUMER_TAB_RENDERS_HOME', 'BUSINESS_TAB_RENDERS_HOME', 'WEB_DUAL_CONTEXT_ONE_COOKIE',
      'CONSUMER_TAB_SHOWS_ONLY_CONSUMER', 'BUSINESS_TAB_SHOWS_ONLY_BUSINESS',
      'NO_BUSINESS_DATA_IN_CONSUMER_TAB', 'NO_CONSUMER_DATA_IN_BUSINESS_TAB',
      'ACTIVE_CONTEXT_DOES_NOT_TRANSFER_TAB_AUTHORITY',
      'BUSINESS_LOGOUT_REVOKES_BUSINESS_ROUTE', 'CONSUMER_SURVIVES_BUSINESS_LOGOUT',
      'BUSINESS_TAB_PROPAGATES_LOGOUT', 'CONSUMER_TAB_STILL_VALID',
    ].includes(g.gate));
    R.mark('WEB_DUAL_CONTEXT_CROSS_TAB', core.every((g) => g.verdict === 'PASS'), `${core.filter((g) => g.verdict === 'PASS').length}/${core.length} cross-tab checks`);
    await ctx.close();
  } catch (e) {
    R.mark('PROOF_17', false, e.message);
  } finally {
    await browser.close().catch(() => {});
    if (biz) await retireBusiness(biz.merchantId);
    try { retireConsumer(consumerHandle, { runId: 'proof17' }); } catch { /* best effort */ }
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_17_WEB_DUAL_CONTEXT_CROSS_TAB=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
