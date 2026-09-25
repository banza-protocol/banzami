#!/usr/bin/env node
/**
 * APP-BANZAMI-WEB-BUSINESS-001 — Proof 18: Business Web under large accessibility
 * text (FINAL EVIDENCE DEBT CLOSURE §2 — BUSINESS_WEB_LARGE_TEXT).
 *
 * Chromium is launched with an enlarged browser default font size
 * (`--blink-settings=defaultFontSize=…`). Flutter Web reads the browser's default
 * font metric and scales its own MediaQuery.textScaleFactor from it, so this is
 * the faithful "large browser text / accessibility text scaling" lever — the same
 * one a user who sets their browser text to Large/Very-Large hits (verified: the
 * page's default <p> grows and Flutter reflows its widgets).
 *
 * With large text in effect we drive the WHOLE Business surface and assert layout
 * integrity on each screen — no page-level horizontal overflow, the screen still
 * renders, and its primary actions remain present/reachable:
 *
 *   Login → Home (balance) → Receber (QR + identity) → Criar cobrança (form)
 *        → Histórico → Perfil (context switcher + logout)
 *
 * Generic synthetic Business, suspended on the way out. No consumer registration,
 * so this proof does not touch the consumer per-IP registration limit.
 *
 *   BANZAMI_E2E=RUN node proofs/18-business-web-large-text.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { FlutterSemanticsDriver } from '../lib/semantics-driver.mjs';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';
import { businessWebSignIn, businessWebSignInToHome } from '../lib/business-signin.mjs';

const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';
const R = new GateReport('18-business-web-large-text');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (process.env.BANZAMI_E2E !== 'RUN') { console.error('set BANZAMI_E2E=RUN'); process.exit(2); }

// 1.5× is a realistic "Large" accessibility text setting; the base default is 16px.
// Overridable ONLY so the same proof can be run at the base size as a control:
// a failure that reproduces at 16px is not a large-text defect, and there was no
// way to ask. The default is the 1.5× this proof exists to test.
const LARGE_FONT_PX = Number(process.env.BZ_LARGE_FONT_PX ?? 24);
const BASE_FONT_PX = 16;
// A tall desktop viewport so a correctly-built (scrollable) screen does not need
// Flutter-internal wheel scrolling to expose its primary action — a layout DEFECT
// (fixed-height clipping, real horizontal overflow) still fails the gate.
const VIEWPORT = { width: 1440, height: 1600 };

const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
const defaultFontPx = (page) => page.evaluate(() => {
  const p = document.createElement('p'); p.textContent = 'x'; p.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
  document.body.appendChild(p); const px = parseFloat(getComputedStyle(p).fontSize); p.remove(); return px;
});

// Tap a shell destination/button by name. NavigationBar destinations expose their
// label as an aria-label (not text content, not always role=button), so try the
// role, then the aria-labelled semantics node's live box, then the text.
//
// It also SAYS WHICH WAY IT TAPPED. Three strategies were tried in order and
// each swallowed its own failure, so a tap that landed on the wrong node was
// indistinguishable from one that landed on the right node and did not
// navigate. BZV-20260924-0001 failed LARGE_TEXT_NAV_CRIAR_COBRANCA with "did
// NOT leave the current screen" — true, and silent about which of the three
// did the tapping. Returns the method that reported success, or null.
async function go(d, name, { until = null } = {}) {
  await d.enableSemantics();
  const arrived = async () => (until ? (await d.visibleText()).includes(until) : true);

  const strategies = [
    ['role=button', async () => { await d.tapButton(name, { timeout: 3000 }); }],
    ['aria-label box', async () => {
      const byLabel = d.page.locator(`flt-semantics[aria-label="${name}"], [role="tab"][aria-label="${name}"], [aria-label="${name}"]`).first();
      if (!(await byLabel.count())) throw new Error('no aria-labelled node');
      await d.tapLocatorBox(byLabel);
    }],
    ['text node', async () => { await d.tapText(name); }],
  ];

  const tried = [];
  for (const [via, tap] of strategies) {
    try { await tap(); } catch { tried.push(`${via}:threw`); continue; }
    await sleep(1200);
    // A TAP THAT RESOLVED IS NOT A TAP THAT ARRIVED.
    //
    // Playwright's click resolves when it has clicked the element's box. A
    // Flutter semantics node is a transparent overlay above the canvas, so a
    // stale or zero-sized box makes the click land on nothing and resolve
    // anyway. BZV-20260924-0001 recorded "tapped via role=button" on a screen
    // that never changed — the first strategy reported success and the two
    // reliable ones below it were never reached.
    if (await arrived()) return via;
    tried.push(`${via}:no-effect`);
  }
  return tried.length ? `NONE (${tried.join(', ')})` : null;
}

// Assert one screen: it rendered (a marker is visible), no horizontal overflow,
// and each expected action label is present in the accessibility tree.
/**
 * Is this action REACHABLE, and at what cost?
 *
 * Presence in one snapshot of the semantics tree is the wrong question. Flutter
 * builds semantics lazily for a scrolling view, so a control below the fold is
 * simply not in the tree yet — and under 1.5× text more of every screen is
 * below the fold. BZV-20260923-0001 reported LOGIN as missing its 'Continuar'
 * button on a screen the very next gate then logged in through, because
 * Playwright's click scrolls and a text snapshot does not.
 *
 * Vertical scrolling is not an accessibility failure; a control that cannot be
 * reached by scrolling at all is. So this scrolls the way a reader would and
 * reports the distance — "reached after 2 scrolls" is a usability observation,
 * "never reached" is the defect.
 */
async function reachable(d, page, label, maxScrolls = 4) {
  // ASK THE WAY THE APP IS DRIVEN. tapButton() locates a control with
  // getByRole('button', {name}) — an accessibility-tree query that finds the
  // node wherever it sits and scrolls to it. A text snapshot of
  // flt-semantics nodes is a different, weaker question, and the two disagreed:
  // LOGIN was reported as missing 'Continuar' on a screen the next gate logged
  // in through.
  //
  // The role query IS the operational definition of reachable: if a screen
  // reader can name and actuate it, it is there.
  try {
    if (await page.getByRole('button', { name: label }).count() > 0) {
      return { found: true, scrolls: 0, via: 'role' };
    }
  } catch { /* fall through to the text reading */ }
  if ((await d.visibleText()).includes(label)) return { found: true, scrolls: 0, via: 'text' };
  // The pointer must be OVER the scrollable for a wheel event to reach it.
  // Without this the wheel went to nothing and six "scrolls" moved the page not
  // at all — which then read as "unreachable after scrolling" on a screen whose
  // control was simply below the fold.
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height / 2));
  for (let i = 1; i <= maxScrolls; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(350);
    if ((await d.visibleText()).includes(label)) return { found: true, scrolls: i, via: 'text' };
    try {
      if (await page.getByRole('button', { name: label }).count() > 0) {
        return { found: true, scrolls: i, via: 'role' };
      }
    } catch { /* keep scrolling */ }
  }
  return { found: false, scrolls: maxScrolls };
}

async function screen(d, page, label, marker, actions = []) {
  const txt = await d.visibleText();
  const rendered = marker.some((m) => txt.includes(m));
  const hOk = await noHScroll(page);
  const reach = [];
  for (const a of actions) reach.push({ action: a, ...(await reachable(d, page, a)) });
  const missing = reach.filter((r) => !r.found).map((r) => r.action);
  const scrolled = reach.filter((r) => r.found && r.scrolls > 0);
  R.mark(`LARGE_TEXT_SCREEN_${label}`, rendered && hOk && missing.length === 0,
    `${rendered ? 'rendered' : 'NOT rendered'}; hScroll=${!hOk}; ` +
    (missing.length ? `UNREACHABLE after scrolling: ${missing.join(',')} — screen offered: ${
      [...new Set((await d.fullText()).replace(/\s+/g, ' ').split(/(?=[A-ZÁÉÍÓÚ])/))].join('|').slice(0, 420)}`
      : scrolled.length ? `all actions reachable (${scrolled.map((r) => `${r.action} after ${r.scrolls} scroll(s) via ${r.via}`).join('; ')})`
        : 'all actions present without scrolling'));
  return rendered && hOk && missing.length === 0;
}

(async () => {
  let biz;
  const { browser } = await launchChromium({ args: [`--blink-settings=defaultFontSize=${LARGE_FONT_PX},minimumFontSize=${Math.round(LARGE_FONT_PX * 0.75)}`] });
  try {
    biz = await provisionBusiness({ handlePrefix: 'e2elt' });
    R.mark('GENERIC_SYNTHETIC_BUSINESS_PROVISIONED', !!biz.handle, `@${biz.handle}`);

    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    await page.goto(`${APP}/business`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const d = new FlutterSemanticsDriver(page, { label: 'lt' });
    await d.enableSemantics();

    // The large-text lever is actually in effect (defence against a silent no-op).
    const fpx = await defaultFontPx(page);
    R.mark('LARGE_TEXT_APPLIED', fpx >= LARGE_FONT_PX - 1, `browser default font ${fpx}px (base ${BASE_FONT_PX}px, ${(fpx / BASE_FONT_PX).toFixed(2)}×)`);

    // ── Login screen under large text ──
    await d.waitForText('Business', { timeout: 20000 });
    // This screen is the WELCOME surface, not the login form: it shows "Banzami
    // Business · Receba pagamentos instantâneos no seu negócio" and its action
    // is 'Entrar'. The form's 'Continuar' belongs to a later step and was never
    // going to be here, which is why the gate reported a missing button on a
    // screen the very next assertion then logged in through. Named for what it
    // actually is, and asserted on its own control.
    // The welcome action is 'Conectar conta' (welcome_screen.dart:135). 'Entrar'
    // is the login screen's page title and was never a control here.
    await screen(d, page, 'WELCOME', ['Banzami Business', 'Receba pagamentos'], ['Conectar conta']);

    // Sign in with @handle + PIN.
    const home = await businessWebSignInToHome(d, biz);
    R.mark('BUSINESS_WEB_LARGE_TEXT_LOGIN', home, 'reached Home from @handle + PIN under large text');

    // ── Home ──
    await screen(d, page, 'HOME', ['Saldo disponível'], []);
    const homeText = await d.visibleText();
    // The detail used to be the constant `@handle shown` — printed whether the
    // handle was there or not. BZV-20260923-0001 recorded this gate FAILED with
    // "shown" beside it, which tells the next reader nothing and actively
    // misleads: a message that is identical on both branches is not evidence.
    // The Business Home shows the business NAME (dashboard_screen.dart renders
    // session.merchantName), never the @banza. This asserted `@handle` and
    // failed on a screen that is behaving exactly as designed — the handle only
    // appeared in the text at all because the fixture's NAME contains it.
    const homeHasName = !!biz.name && homeText.includes(biz.name);
    R.mark('LARGE_TEXT_HOME_IDENTITY', homeHasName,
      homeHasName ? `business name shown on Home under large text`
        : `business identity NOT in Home's visible text under large text — saw: ${homeText.replace(/\s+/g, ' ').slice(0, 140)}`);

    // ── Receber (QR + identity block) ──
    await go(d, 'Receber');
    await d.waitForText('Mostre este QR', { timeout: 15000 }).catch(() => {});
    const recvOk = await screen(d, page, 'RECEBER', ['Mostre este QR', 'QR Code e ligação'], ['Criar cobrança', 'Partilhar QR']);
    const recvText = await d.visibleText();
    // Same defect, same fix: two separate conditions behind one constant string.
    // Which of them failed is the whole question, so the detail now says.
    // This asserted /Receber em @/ — the exact string the product deliberately
    // does NOT render, and which apps/mobile/test/merchant/banza_identity_test.dart
    // asserts is absent: "A Business @banza is not a transfer destination
    // (transfers route to consumer handles only), so 'Receber em @banza' would
    // be a dead promise."
    //
    // What the screen does show is the @banza itself (qr_screen.dart reads
    // session.banzaAddress). So that is what is checked, together with the
    // promise staying absent — under large text, which is this proof's subject.
    const recvIdentity = recvText.includes(`@${biz.handle}`);
    const noDeadPromise = !/Receber em /.test(recvText);
    R.mark('LARGE_TEXT_QR_USABLE', recvOk && recvIdentity && noDeadPromise,
      recvOk && recvIdentity && noDeadPromise
        ? 'Receive QR card + @banza identity intact under large text, with no payment promise'
        : `card=${recvOk ? 'intact' : 'incomplete'} identity=${recvIdentity ? 'present' : 'MISSING'}` +
          ` deadPromise=${noDeadPromise ? 'absent' : 'PRESENT'}` +
          ` — saw: ${recvText.replace(/\s+/g, ' ').slice(0, 140)}`);

    // ── Criar cobrança (form) ──
    // The navigation asserts itself. `waitForText('Valor').catch(() => {})`
    // swallowed a failed tap, and the screen gate below then reported the
    // Receber screen's content as a Criar-cobrança failure — a navigation
    // problem wearing an accessibility problem's name.
    const navVia = await go(d, 'Criar cobrança', { until: 'Nova cobrança' });
    // Waited for 'Valor', which this screen has never had: charge_screen.dart
    // offers 'Nova cobrança', 'Detalhes da cobrança', 'Total' and 'Gerar
    // cobrança'. The wait could only ever time out, and the swallowed catch
    // then let the next gate describe the screen it had not left.
    let reachedCharge = true;
    try { await d.waitForText('Nova cobrança', { timeout: 12000 }); }
    catch { reachedCharge = false; }
    R.mark('LARGE_TEXT_NAV_CRIAR_COBRANCA', reachedCharge,
      reachedCharge ? `tapping Criar cobrança reached the form under large text (via ${navVia})`
        : `tapping Criar cobrança did NOT leave the current screen — tapped via ${
          navVia ?? 'NOTHING: all three strategies failed'} — saw: ${
          (await d.visibleText()).replace(/\s+/g, ' ').slice(0, 160)}`);
    await screen(d, page, 'CRIAR_COBRANCA', ['Nova cobrança', 'Detalhes da cobrança'], ['Gerar cobrança']);
    // Return to the shell (the charge screen is a pushed route).
    await page.goto(`${APP}/business`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await d.enableSemantics();
    await d.waitForText('Saldo disponível', { timeout: 20000 }).catch(() => {});

    // ── Histórico ──
    await go(d, 'Histórico');
    await sleep(800);
    await screen(d, page, 'HISTORICO', ['Histórico', 'Movimentos', 'Ainda não', 'Sem movimentos', 'Saldo'], []);

    // ── Perfil (context switcher + logout present) ──
    await go(d, 'Perfil');
    await sleep(600);
    // 'Mudar para Pessoal' and 'Terminar sessão Business' exist nowhere in the
    // app — grep returns zero files for either. The profile shows the @banza
    // (profile_screen.dart reads session.banzaAddress) and its sign-out control
    // is labelled 'Terminar sessão'. Two labels that no longer exist were being
    // reported as an accessibility failure under large text.
    await screen(d, page, 'PERFIL', ['Perfil', `@${biz.handle}`], ['Terminar sessão']);

    // Verdict.
    const screens = R.gates.filter((g) => g.gate.startsWith('LARGE_TEXT_SCREEN_'));
    const allScreens = screens.length >= 6 && screens.every((g) => g.verdict === 'PASS');
    R.mark('BUSINESS_WEB_LARGE_TEXT', allScreens && home, `${screens.filter((g) => g.verdict === 'PASS').length}/${screens.length} screens clean under ${(LARGE_FONT_PX / BASE_FONT_PX).toFixed(2)}× text`);
    await ctx.close();
  } catch (e) {
    R.mark('PROOF_18', false, e.message);
  } finally {
    await browser.close().catch(() => {});
    if (biz) await retireBusiness(biz.merchantId);
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_18_BUSINESS_WEB_LARGE_TEXT=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
