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
const LARGE_FONT_PX = 24;
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
async function go(d, name) {
  await d.enableSemantics();
  try { await d.tapButton(name, { timeout: 3000 }); await sleep(1200); return; } catch { /* not a role=button */ }
  const byLabel = d.page.locator(`flt-semantics[aria-label="${name}"], [role="tab"][aria-label="${name}"], [aria-label="${name}"]`).first();
  if (await byLabel.count()) { try { await d.tapLocatorBox(byLabel); await sleep(1200); return; } catch { /* fall through */ } }
  await d.tapText(name);
  await sleep(1200);
}

// Assert one screen: it rendered (a marker is visible), no horizontal overflow,
// and each expected action label is present in the accessibility tree.
async function screen(d, page, label, marker, actions = []) {
  const txt = await d.visibleText();
  const rendered = marker.some((m) => txt.includes(m));
  const hOk = await noHScroll(page);
  const missing = actions.filter((a) => !txt.includes(a));
  R.mark(`LARGE_TEXT_SCREEN_${label}`, rendered && hOk && missing.length === 0,
    `${rendered ? 'rendered' : 'NOT rendered'}; hScroll=${!hOk}; ${missing.length ? 'missing actions: ' + missing.join(',') : 'all actions present'}`);
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
    await screen(d, page, 'LOGIN', ['Business'], ['Entrar']);

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
    const homeHasHandle = homeText.includes(`@${biz.handle}`);
    R.mark('LARGE_TEXT_HOME_IDENTITY', homeHasHandle,
      homeHasHandle ? `@${biz.handle} shown`
        : `@${biz.handle} NOT in Home's visible text under large text — saw: ${homeText.replace(/\s+/g, ' ').slice(0, 140)}`);

    // ── Receber (QR + identity block) ──
    await go(d, 'Receber');
    await d.waitForText('Mostre este QR', { timeout: 15000 }).catch(() => {});
    const recvOk = await screen(d, page, 'RECEBER', ['Mostre este QR', 'QR Code e ligação'], ['Criar cobrança', 'Partilhar QR']);
    const recvText = await d.visibleText();
    // Same defect, same fix: two separate conditions behind one constant string.
    // Which of them failed is the whole question, so the detail now says.
    const recvIdentity = /Receber em @/.test(recvText);
    R.mark('LARGE_TEXT_QR_USABLE', recvOk && recvIdentity,
      recvOk && recvIdentity ? 'Receive QR card + identity render intact under large text'
        : `card=${recvOk ? 'intact' : 'incomplete'} identity=${recvIdentity ? 'present' : 'MISSING'}` +
          ` — saw: ${recvText.replace(/\s+/g, ' ').slice(0, 140)}`);

    // ── Criar cobrança (form) ──
    await go(d, 'Criar cobrança');
    await d.waitForText('Valor', { timeout: 12000 }).catch(() => {});
    await screen(d, page, 'CRIAR_COBRANCA', ['Valor', 'Gerar cobrança'], ['Gerar cobrança']);
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
    await screen(d, page, 'PERFIL', ['Perfil', `@${biz.handle}`, 'Mudar para Pessoal'], ['Mudar para Pessoal', 'Terminar sessão Business']);

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
