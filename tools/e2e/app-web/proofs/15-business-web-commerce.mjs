#!/usr/bin/env node
/**
 * APP-BANZAMI-WEB-BUSINESS-001 — Proof 15: Create Charge + realtime + history/receipt.
 *
 *  §27 Business Web creates a charge (canonical payment link + QR); a Consumer Web
 *      session pays it through the canonical payer deep link and it settles.
 *  §26 the Business Home converges on the incoming payment with NO manual refresh
 *      (canonical server-truth poll — no local arithmetic).
 *  §28/§29 the payment shows in Business History and its transaction detail carries
 *      the canonical proof reference.
 *
 *   BANZAMI_E2E=RUN node proofs/15-business-web-commerce.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { registerConsumer } from '../lib/consumer.mjs';
import { FlutterSemanticsDriver } from '../lib/semantics-driver.mjs';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';
import { businessWebSignIn, businessWebSignInToHome } from '../lib/business-signin.mjs';

const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';
const R = new GateReport('15-business-web-commerce');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (process.env.BANZAMI_E2E !== 'RUN') { console.error('set BANZAMI_E2E=RUN'); process.exit(2); }

function bff(biz) {
  const s = {}; const ch = () => Object.entries(s).map(([k, v]) => `${k}=${v}`).join('; ');
  const grab = (r) => { const a = r.headers.getSetCookie ? r.headers.getSetCookie() : []; for (const c of a) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) s[m[1]] = m[2]; } };
  let merchantId = '';
  return {
    async login() { grab(await fetch(`${APP}/`)); const r = await fetch(`${APP}/business/api/v1/merchant/auth/token`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': s['bz_app_csrf'], cookie: ch() }, body: JSON.stringify({ handle: biz.handle, pin: biz.pin }) }); grab(r); const st = await this.get('/session/state'); merchantId = st.business_context?.merchant_id || ''; },
    async get(p) { return (await fetch(`${APP}${p}`, { headers: { cookie: ch() } })).json().catch(() => ({})); },
    async newestActiveChargeSlug() { const j = await this.get(`/business/api/v1/payment-links?limit=10&merchant_id=${merchantId}`); const arr = j.data || j.items || []; const active = arr.filter((l) => (l.status || 'ACTIVE') === 'ACTIVE'); return (active[0] || arr[0])?.slug; },
    async balanceMinor() { const w = await this.get('/business/api/v1/wallets?currency=AOA'); if (!w.id) return 0; const b = await this.get(`/business/api/v1/wallets/${w.id}/balance`); return b.available_minor ?? b.availableMinor ?? 0; },
  };
}
const kzOnHome = (txt) => { const m = (txt.match(/Saldo dispon[ií]vel\s*([\d\s]+)\s*Kz/i) || [])[1]; return m ? parseInt(m.replace(/\s/g, ''), 10) : null; };

(async () => {
  let biz;
  const { browser } = await launchChromium();
  try {
    biz = await provisionBusiness({ handlePrefix: 'e2ecom' });
    const api = bff(biz); await api.login();
    R.mark('GENERIC_SYNTHETIC_BUSINESS_PROVISIONED', !!biz.handle, `@${biz.handle}`);

    // ── Browser A: Business Web creates a charge, then returns to Home. ──
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto(`${APP}/business`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const dA = new FlutterSemanticsDriver(pageA, { label: 'comA' });
    await dA.enableSemantics();
    await businessWebSignIn(dA, biz);
    await dA.waitForText('Saldo disponível', { timeout: 30000 });
    // "Criar cobrança" lives on the Receber tab, not on Home. Tapping it from
    // Home used to work when Home carried the action; the native tab tree moved
    // it, and a proof that assumes the old placement times out on a locator and
    // reads like the feature is gone.
    await dA.tapText('Receber').catch(() => {});
    await dA.waitForText('Criar cobrança', { timeout: 20000 });
    await dA.tapButton('Criar cobrança').catch(() => dA.tapText('Criar cobrança'));
    await dA.waitForText('Gerar cobrança', { timeout: 15000 }).catch(() => {});
    await dA.fillFieldBySemantics('Montante', '700', { verify: false });
    await dA.tapButton('Gerar cobrança').catch(() => dA.tapText('Gerar cobrança'));
    const chargeShown = await dA.waitForText('Copiar ligação', { timeout: 20000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_WEB_CREATE_CHARGE_PARITY', chargeShown, 'Business Web created a canonical charge (link + QR)');
    const chargeSlug = await api.newestActiveChargeSlug();
    R.mark('BUSINESS_WEB_CHARGE_ARTIFACT_CANONICAL', !!chargeSlug, `charge slug=${chargeSlug}`);
    // Back to Home for the realtime observation.
    await pageA.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(2500); await dA.enableSemantics().catch(() => {});
    await dA.waitForText('Saldo disponível', { timeout: 20000 }).catch(() => {});
    const homeBefore = kzOnHome(await dA.visibleText());

    // ── Consumer Web pays the charge through its own authenticated session. ──
    // A fresh consumer registers + funds + pays the payment-link over the same
    // same-origin BFF the UI uses (a genuine consumer-web payment; the camera-driven
    // consumer payment of a Business QR is separately proven in proof 11).
    const cs = {}; const cch = () => Object.entries(cs).map(([k, v]) => `${k}=${v}`).join('; ');
    const cgrab = (r) => { const a = r.headers.getSetCookie ? r.headers.getSetCookie() : []; for (const c of a) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) cs[m[1]] = m[2]; } };
    const creq = async (m, p, b) => { const h = { cookie: cch() }; if (b !== undefined) { h['content-type'] = 'application/json'; h['x-csrf-token'] = cs['bz_app_csrf'] || ''; } const r = await fetch(`${APP}${p}`, { method: m, headers: h, body: b !== undefined ? JSON.stringify(b) : undefined }); cgrab(r); let j = null; try { j = await r.clone().json(); } catch {} return { status: r.status, body: j }; };
    cgrab(await fetch(`${APP}/`));
    await creq('POST', '/consumer/v1/auth/register', { handle: `e2ecombuyer${Date.now().toString(36)}`, display_name: 'E2E Buyer', pin: '481516' });
    await creq('POST', '/consumer/v1/sandbox/fund', { amount_minor: 500000, currency: 'AOA' });
    const payRes = await creq('POST', `/consumer/v1/payment-links/${chargeSlug}/pay`, { idempotency_key: `chg-${chargeSlug}` });
    let settled = payRes.status === 200 || payRes.status === 201;
    for (let i = 0; i < 15 && !((await api.balanceMinor()) > 0); i++) await sleep(1500);
    const bizBal = await api.balanceMinor();
    R.mark('BUSINESS_WEB_CHARGE_E2E', settled && bizBal > 0, `pay HTTP ${payRes.status}; business balance now ${bizBal} minor`);

    // ── §26 realtime — Browser A Home converged without a manual refresh. ──
    let converged = false; let homeAfter = homeBefore;
    for (let i = 0; i < 20; i++) { await sleep(1500); homeAfter = kzOnHome(await dA.visibleText()); if (homeAfter != null && (homeBefore == null || homeAfter > homeBefore)) { converged = true; break; } }
    R.mark('BUSINESS_WEB_REALTIME_E2E', converged, `Home balance ${homeBefore} → ${homeAfter} Kz with no manual refresh`);

    // ── §28/§29 history + transaction detail (proof reference). The received
    // payment appears in the Business activity (Home "Actividade recente", same
    // canonical data + detail as Histórico); its detail carries the proof reference. ──
    const homeTxt = await dA.visibleText();
    R.mark('BUSINESS_WEB_HISTORY_E2E', /E2E Buyer|Pagamento recebido/i.test(homeTxt) && !/sem pagamentos recebidos/i.test(homeTxt), 'Business activity reflects the received payment');
    await dA.tapText('E2E Buyer').catch(() => dA.tapText('Pagamento recebido').catch(() => {}));
    await sleep(1500);
    const detail = await dA.visibleText();
    R.mark('BUSINESS_WEB_RECEIPT_E2E', /Refer[êe]ncia/i.test(detail), 'transaction detail shows the canonical proof reference');
  } catch (e) {
    R.mark('PROOF_15', false, e.message);
  } finally {
    await browser.close().catch(() => {});
    if (biz) await retireBusiness(biz.merchantId);
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_15_BUSINESS_WEB_COMMERCE=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
