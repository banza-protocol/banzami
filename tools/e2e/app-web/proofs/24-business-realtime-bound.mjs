#!/usr/bin/env node
/**
 * The Business Home shows an incoming payment within the acceptable bound —
 * measured, repeatedly, at several phase alignments.
 *
 * WHY THIS EXISTS. The first real Validation Run (BZV-20260918-0003, S15) found
 * the Business Home never updating at all: the payment poller was started behind
 * a kIsWeb guard meant for the local-notification plugin, so on Web it never
 * ran. That is fixed. This proves the fix holds to a NUMBER instead of to one
 * lucky observation.
 *
 * THE BOUND. CLAUDE.md §2.6: "under 2 seconds — ideal, under 5 seconds —
 * acceptable". Five seconds is the outer edge of acceptable, so the assertion
 * is strict: every sample must be UNDER it. A poll of interval T has worst case
 * T + latency + render, and a payment can land microseconds after a tick — so
 * the samples are deliberately spread ACROSS the cycle rather than taken at a
 * convenient moment. One measurement at a lucky phase proves nothing.
 *
 * WHAT IS MEASURED, and between which two points:
 *
 *   payment_confirmed_at            the pay call returns 2xx — money has moved
 *   authoritative_balance_changed   the API first reports the new balance
 *   ui_balance_changed_at           the Home first RENDERS the new balance
 *   latency_ms                      ui_balance_changed_at − payment_confirmed_at
 *
 * The middle reading is kept because it separates "the product was slow to
 * know" from "the product was slow to show" — a regression in either would
 * otherwise arrive as the same number.
 *
 *   BANZAMI_E2E=RUN node proofs/24-business-realtime-bound.mjs
 */
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { launchChromium } from '../lib/browser.mjs';
import { FlutterSemanticsDriver } from '../lib/semantics-driver.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';
import { businessWebSignIn } from '../lib/business-signin.mjs';

const APP = process.env.APP_ORIGIN || 'https://app.banzami.com';
const R = new GateReport('24-business-realtime-bound');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The acceptable bound, from CLAUDE.md §2.6. Not a timeout — an assertion. */
const BOUND_MS = 5000;
/** The ideal band in the same sentence; reported, never asserted. */
const IDEAL_MS = 2000;
/** Offsets across the poll cycle, so no sample sits at a convenient phase. */
const PHASES_MS = [0, 500, 1000, 1500, 1900];
const AMOUNT_MINOR = 70000;

if (process.env.BANZAMI_E2E !== 'RUN') { console.error('set BANZAMI_E2E=RUN'); process.exit(2); }

const kzOnHome = (t) => {
  const m = (t.match(/Saldo dispon[ií]vel[\s·]*([\d\s]+)\s*Kz/i) || [])[1];
  return m ? parseInt(m.replace(/\s/g, ''), 10) : null;
};

(async () => {
  let biz;
  const { browser } = await launchChromium();
  try {
    biz = await provisionBusiness({ handlePrefix: 'e2ertbound' });
    R.mark('GENERIC_SYNTHETIC_BUSINESS_PROVISIONED', !!biz.handle, `@${biz.handle}`);

    const page = await (await browser.newContext()).newPage();
    await page.goto(`${APP}/business`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const d = new FlutterSemanticsDriver(page, { label: 'rtb' });
    await d.enableSemantics();
    await businessWebSignIn(d, biz);
    const onHome = await d.waitForText('Saldo disponível', { timeout: 30000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_HOME_RENDERED', onHome, 'signed in and on the Business Home');

    // A funded payer, once, for every sample.
    const cs = {}; const cch = () => Object.entries(cs).map(([k, v]) => `${k}=${v}`).join('; ');
    const grab = (r) => { for (const c of (r.headers.getSetCookie?.() ?? [])) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) cs[m[1]] = m[2]; } };
    const creq = async (m, p, b) => {
      const h = { cookie: cch() };
      if (b !== undefined) { h['content-type'] = 'application/json'; h['x-csrf-token'] = cs['bz_app_csrf'] || ''; }
      const r = await fetch(`${APP}${p}`, { method: m, headers: h, body: b !== undefined ? JSON.stringify(b) : undefined });
      grab(r); let j = null; try { j = await r.clone().json(); } catch {}
      return { status: r.status, body: j };
    };
    grab(await fetch(`${APP}/`));
    await creq('POST', '/consumer/v1/auth/register', { handle: `e2ertpayer${Date.now().toString(36)}`, display_name: 'RT Payer', pin: '481516' });
    const funded = await creq('POST', '/consumer/v1/sandbox/fund', { amount_minor: AMOUNT_MINOR * PHASES_MS.length + 100000, currency: 'AOA' });
    R.mark('PAYER_FUNDED', funded.status === 200 || funded.status === 201, `fund HTTP ${funded.status}`);

    /** Create a charge through the browser's own authenticated Business session. */
    const newCharge = () => page.evaluate(async (amount) => {
      const csrf = document.cookie.split('; ').find((c) => c.startsWith('bz_app_csrf='))?.split('=')[1] ?? '';
      const w = await fetch('/business/api/v1/wallets?currency=AOA', { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
      const r = await fetch('/business/api/v1/payment-links', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ wallet_id: w.id, amount_minor: amount, currency: 'AOA' }),
      });
      let b = null; try { b = await r.json(); } catch {}
      return { status: r.status, slug: b?.slug, walletId: w.id };
    }, AMOUNT_MINOR);

    const apiBalance = () => page.evaluate(async () => {
      const w = await fetch('/business/api/v1/wallets?currency=AOA', { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
      if (!w.id) return null;
      const b = await fetch(`/business/api/v1/wallets/${w.id}/balance`, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
      return b.available_minor ?? b.availableMinor ?? null;
    });

    const samples = [];
    for (const phase of PHASES_MS) {
      const uiBefore = kzOnHome(await d.visibleText());
      const apiBefore = await apiBalance();
      if (uiBefore === null || apiBefore === null) { samples.push({ phase, error: 'no baseline reading' }); continue; }

      const charge = await newCharge();
      if (charge.status !== 201 || !charge.slug) { samples.push({ phase, error: `charge ${charge.status}` }); continue; }

      // Land the payment at this offset into the poll cycle.
      await sleep(phase);
      const t0 = Date.now();
      const pay = await creq('POST', `/consumer/v1/payment-links/${charge.slug}/pay`, { idempotency_key: `rtb-${charge.slug}` });
      if (pay.status !== 200 && pay.status !== 201) { samples.push({ phase, error: `pay ${pay.status}` }); continue; }
      const paidAt = Date.now();

      let apiAt = null, uiAt = null;
      const deadline = paidAt + 20000; // generous: a MISS must be recorded, not timed out into silence
      while (Date.now() < deadline && (apiAt === null || uiAt === null)) {
        if (apiAt === null && (await apiBalance()) > apiBefore) apiAt = Date.now();
        if (uiAt === null) { const v = kzOnHome(await d.visibleText()); if (v !== null && v > uiBefore) uiAt = Date.now(); }
        if (apiAt === null || uiAt === null) await sleep(150);
      }
      samples.push({
        phase,
        payment_confirmed_at: new Date(paidAt).toISOString(),
        authoritative_ms: apiAt ? apiAt - paidAt : null,
        ui_ms: uiAt ? uiAt - paidAt : null,
        latency_ms: uiAt ? uiAt - paidAt : null,
        request_ms: paidAt - t0,
      });
      R.note(`SAMPLE_PHASE_${phase}MS`, uiAt ? `${uiAt - paidAt}ms ui · ${apiAt ? apiAt - paidAt : '—'}ms api` : 'NEVER RENDERED');
    }

    const good = samples.filter((s) => typeof s.latency_ms === 'number');
    R.mark('EVERY_SAMPLE_OBSERVED', good.length === PHASES_MS.length,
      `${good.length}/${PHASES_MS.length} samples produced a measurement` +
      (good.length === PHASES_MS.length ? '' : ` — ${samples.filter((s) => s.error).map((s) => s.error).join(', ')}`));

    const worst = good.length ? Math.max(...good.map((s) => s.latency_ms)) : Infinity;
    const best = good.length ? Math.min(...good.map((s) => s.latency_ms)) : Infinity;
    // THE assertion. Strict: at the bound is not under it.
    R.mark('BUSINESS_HOME_VISIBILITY_WITHIN_BOUND', good.length > 0 && worst < BOUND_MS,
      `worst ${worst}ms across ${good.length} phase(s), bound ${BOUND_MS}ms (CLAUDE.md §2.6)`);
    R.note('BEST_MS', String(best));
    R.note('WITHIN_IDEAL_BAND', `${good.filter((s) => s.latency_ms < IDEAL_MS).length}/${good.length} under ${IDEAL_MS}ms`);
    // Separates "slow to know" from "slow to show": a regression in either would
    // otherwise arrive as one number.
    const showLag = good.filter((s) => typeof s.authoritative_ms === 'number').map((s) => s.ui_ms - s.authoritative_ms);
    R.note('RENDER_LAG_AFTER_AUTHORITATIVE_MS', showLag.length ? String(Math.max(...showLag)) : '—');

    const out = R.write(assuranceDir('app-web'));
    console.log(`\nPROOF_24_BUSINESS_REALTIME_BOUND=${R.failed === 0 ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
    console.log(JSON.stringify({ samples }, null, 2));
  } catch (e) {
    R.mark('PROOF_24', false, e.message);
    R.write(assuranceDir('app-web'));
  } finally {
    await browser.close().catch(() => {});
    if (biz) await retireBusiness(biz.merchantId);
  }
  process.exit(R.failed === 0 ? 0 : 1);
})();
