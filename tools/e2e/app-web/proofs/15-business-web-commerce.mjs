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
// visibleText() joins accessibility nodes with ' · ', so the balance reads
// "Saldo disponível ·  0 Kz". The old pattern allowed only digits and spaces
// after the label, so it matched nothing and returned null — and a null balance
// made the realtime gate unfalsifiable: it can never converge from null.
// The Business Home's empty activity state, taken from the shell itself
// (merchant/screens/dashboard_screen.dart). Declared as a *_MARKER so
// check-e2e-ui-markers proves it still exists: the gate below asserts its
// ABSENCE, and a negative whose subject the product has renamed can never fail.
// This one had: the proof looked for 'sem pagamentos recebidos', which the app
// has never said.
const EMPTY_ACTIVITY_MARKER = 'Ainda não há pagamentos recebidos';

const kzOnHome = (txt) => { const m = (txt.match(/Saldo dispon[ií]vel[\s·]*([\d\s]+)\s*Kz/i) || [])[1]; return m ? parseInt(m.replace(/\s/g, ''), 10) : null; };

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
    // MoneyInput renders its `label` as a separate Text ABOVE the field, so the
    // TextField's only accessible name is its hint. That is an accessibility
    // gap in the widget — an amount field whose accessible name is "leave blank
    // for a free amount" is not named, it is annotated — but the harness must
    // assert what the product DOES, not what it should do, so it locates the
    // field the way a screen reader would find it today.
    await dA.fillFieldBySemantics('Deixe em branco para valor livre', '700', { verify: false });
    await dA.tapButton('Gerar cobrança').catch(() => dA.tapText('Gerar cobrança'));
    // The generated-charge screen offers 'Partilhar link' and 'Nova cobrança'
    // (merchant/screens/charge_screen.dart). 'Copiar ligação' is older copy.
    const chargeShown = await dA.waitForText('Partilhar link', { timeout: 20000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_WEB_CREATE_CHARGE_PARITY', chargeShown, 'Business Web created a canonical charge (link + QR)');
    const chargeSlug = await api.newestActiveChargeSlug();
    R.mark('BUSINESS_WEB_CHARGE_ARTIFACT_CANONICAL', !!chargeSlug, `charge slug=${chargeSlug}`);
    // Back to Home for the realtime observation.
    //
    // The generated-charge screen is a PUSHED route: its only tappable nodes are
    // Back, 'Partilhar link' and 'Nova cobrança' — there is no tab bar on it, so
    // 'Início' is not reachable from here and pageA.goBack() (browser history in
    // a single-page app) did not pop it either. Pop to Receber first, then take
    // the tab bar, which is what a merchant's thumb does.
    await dA.tapButton('Back').catch(() => {});
    await sleep(1200);
    await dA.tapText('Início').catch(() => {});
    await sleep(2500);
    const onHome = await dA.waitForText('Saldo disponível', { timeout: 20000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_WEB_BACK_TO_HOME', onHome, 'returned to the Business Home through the native tab bar');
    const homeBefore = kzOnHome(await dA.visibleText());

    // ── Consumer Web pays the charge through its own authenticated session. ──
    // A fresh consumer registers + funds + pays the payment-link over the same
    // same-origin BFF the UI uses (a genuine consumer-web payment; the camera-driven
    // consumer payment of a Business QR is separately proven in proof 11).
    const cs = {}; const cch = () => Object.entries(cs).map(([k, v]) => `${k}=${v}`).join('; ');
    const cgrab = (r) => { const a = r.headers.getSetCookie ? r.headers.getSetCookie() : []; for (const c of a) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) cs[m[1]] = m[2]; } };
    const creq = async (m, p, b) => { const h = { cookie: cch() }; if (b !== undefined) { h['content-type'] = 'application/json'; h['x-csrf-token'] = cs['bz_app_csrf'] || ''; } const r = await fetch(`${APP}${p}`, { method: m, headers: h, body: b !== undefined ? JSON.stringify(b) : undefined }); cgrab(r); let j = null; try { j = await r.clone().json(); } catch {} return { status: r.status, body: j }; };
    cgrab(await fetch(`${APP}/`));
    // A payer named for THIS run. The activity row is titled by the payer's
    // display name, and a fixed 'E2E Buyer' would match a row left by any
    // earlier run — the assertion has to name this payment, not that shape.
    const buyerHandle = `e2ecombuyer${Date.now().toString(36)}`;
    const buyerName = `E2E Buyer ${buyerHandle.slice(-6)}`;
    await creq('POST', '/consumer/v1/auth/register', { handle: buyerHandle, display_name: buyerName, pin: '481516' });
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
    // Assert on HISTÓRICO, not Home. The Home's "Pagamentos recentes" section
    // sits below the fold, and Flutter builds a scrollable's children lazily —
    // so its semantics node does not exist until it is scrolled to, and reading
    // Home proves nothing either way. Histórico is the canonical activity
    // surface, it is what a merchant taps, and it is always built.
    await dA.tapText('Histórico').catch(() => {});
    await sleep(2000);
    // Wait for the row, re-entering the tab between reads. The list is fetched
    // when the tab is built, so a single read can show a snapshot taken before
    // this payment landed — waiting for eventual consistency is not the same as
    // relaxing the assertion, and a row that never arrives still fails.
    let histTxt = await dA.visibleText();
    for (let i = 0; i < 12 && !histTxt.includes(buyerName); i++) {
      await dA.tapText('Início').catch(() => {});
      await sleep(900);
      await dA.tapText('Histórico').catch(() => {});
      await sleep(1600);
      histTxt = await dA.visibleText();
    }
    // A row's title is `description ?? payer ?? stateLabel`. This charge carries
    // no description, so the row is the PAYER — and `payer` is the display NAME,
    // which is why this proof gives its payer a name unique to the run. The
    // credited amount is asserted beside it: either alone could be a
    // coincidence, both together name THIS payment. The empty-state check only
    // supplements them; it is never the evidence that activity populated.
    const rowShown = histTxt.includes(buyerName);
    const credited = /\+\s*700\s*Kz/i.test(histTxt);
    R.mark('BUSINESS_WEB_HISTORY_E2E', rowShown && credited && !histTxt.includes(EMPTY_ACTIVITY_MARKER),
      `payer=${rowShown} credit=${credited} empty=${histTxt.includes(EMPTY_ACTIVITY_MARKER)}`);

    // The Business surface says "Comprovativo", never "Referência" — that word
    // appears nowhere in the merchant app, so the old assertion could only fail.
    await dA.tapText(buyerName).catch(() => {});
    await sleep(2000);
    const detail = await dA.visibleText();
    R.mark('BUSINESS_WEB_RECEIPT_E2E', /Comprovativo/i.test(detail),
      'transaction detail offers the canonical proof (Comprovativo)');
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
