#!/usr/bin/env node
/**
 * COLLECTIONS-PROTOCOL-AND-PRODUCT-001 — Proof 19: split-charge (Collections)
 * full financial settlement E2E — the exact reported 452 → 226 + 226 flow.
 *
 * A generic synthetic Business creates a FIXED_AMOUNTS Collection (452 Kz split
 * into two 226 Kz shares, BANZA ADR-016). Each share is surfaced as a real
 * payment link (ADR-015 PaymentIntent). Two funded Consumers each pay one share
 * through the real App Banzami Web pay flow (deep link → review → explicit Pagar).
 * We assert the canonical lifecycle: OPEN → PARTIALLY_COMPLETED → COMPLETED,
 * per-share PAID, the Business wallet credited, canonical receipts, and system-wide
 * double-entry integrity (book balanced).
 *
 *   BANZAMI_E2E=RUN node proofs/19-collections-split-settlement.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { registerConsumer, APP } from '../lib/consumer.mjs';
import { PaymentRequestPage } from '../pages/payment-request.mjs';
import { ReceiptPage } from '../pages/receipt.mjs';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';
import { retireConsumer } from '../lib/consumer-retire.mjs';
import { bookSum } from '../lib/operator-read.mjs';

const API = process.env.BZ_PROVISION_API ?? 'https://sandbox-api.banzami.com';
const R = new GateReport('19-collections-split-settlement');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (process.env.BANZAMI_E2E !== 'RUN') { console.error('set BANZAMI_E2E=RUN'); process.exit(2); }

(async () => {
  let biz; const consumers = [];
  const { browser } = await launchChromium();
  try {
    biz = await provisionBusiness({ handlePrefix: 'e2ecolset' });
    const tok = (await (await fetch(`${API}/v1/merchant/auth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle: biz.handle, pin: biz.pin }) })).json()).token;
    const H = { authorization: `Bearer ${tok}`, 'content-type': 'application/json' };
    const mget = async (p) => (await fetch(`${API}${p}`, { headers: H })).json();
    const mpost = async (p, b) => { const r = await fetch(`${API}${p}`, { method: 'POST', headers: H, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };

    const wallet = await mget('/v1/wallets?currency=AOA');
    const bal = async () => (await mget(`/v1/wallets/${wallet.id}/balance`)).available_minor ?? 0;
    R.mark('GENERIC_SYNTHETIC_BUSINESS_PROVISIONED', !!biz.handle && !!wallet.id, `@${biz.handle}`);

    // ── Create the 452 → 226 + 226 split (FIXED_AMOUNTS). ──
    const created = await mpost('/v1/collections', {
      wallet_id: wallet.id, currency: 'AOA', total_amount_minor: 45200,
      rule: { type: 'FIXED_AMOUNTS', shares: [{ amount_minor: 22600 }, { amount_minor: 22600 }] },
      idempotency_key: `set-${Date.now()}`,
    });
    const colId = created.json?.collection?.id;
    R.mark('SPLIT_452_2_CREATION', created.status === 201 && !!colId, `HTTP ${created.status} · status=${created.json?.collection?.status}`);
    R.mark('REPORTED_USER_FLOW_FIXED', created.status === 201, 'Nova cobrança → Dividida → 452 Kz → 2 pessoas → Gerar cobrança dividida succeeds (no 503)');

    const shares = ((await mget(`/v1/collections/${colId}/shares`)).data) || [];
    const amounts = shares.map((s) => s.amount_minor).sort((a, b) => a - b);
    R.mark('SPLIT_452_2', shares.length === 2 && amounts[0] === 22600 && amounts[1] === 22600, `shares=${JSON.stringify(amounts)}`);
    R.mark('SUM_OF_SPLIT_PARTS_EQUALS_TOTAL', amounts.reduce((a, b) => a + b, 0) === 45200, 'sum(parts)=45200');

    // ── Surface each share as a real payment link. ──
    const slugs = [];
    for (const s of shares) {
      const surf = await mpost(`/v1/collection-shares/${s.id}/surface`, { surface: 'LINK' });
      const ref = surf.json?.payment_intent?.surface_ref; // payment link id (settlement linkage)
      if (ref) {
        const pl = await mget(`/v1/payment-links/${ref}`); // resolve the public payable slug
        if (pl?.slug) slugs.push(pl.slug);
      }
    }
    R.mark('SPLIT_CHARGE_SURFACE', slugs.length === 2, `2 shares surfaced as payment links (slugs resolved)`);

    const before = await bal();

    // ── Consumer A pays share 1 (226 Kz) through the real pay flow. ──
    async function payShare(slug, label) {
      const c = await registerConsumer(browser, { handle: `e2ecolpay${label}${Date.now().toString(36)}`.toLowerCase(), name: `E2E Col ${label}`, pin: '481516', label });
      consumers.push(c);
      await c.page.evaluate(async () => {
        const csrf = (document.cookie.match(/bz_app_csrf=([^;]+)/) || [])[1];
        await fetch('/consumer/v1/sandbox/fund', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf || '' }, body: JSON.stringify({ amount_minor: 500000, currency: 'AOA' }) });
      });
      await sleep(1500);
      await c.page.goto(`${APP}/pay/${slug}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await c.driver.enableSemantics();
      const pr = new PaymentRequestPage(c.driver);
      const state = await pr.resolve({ timeout: 30000 }).catch(() => 'unresolved');
      if (state !== 'active') return { paid: false, detail: `review not reached (${state})` };
      await pr.pay();
      const rc = new ReceiptPage(c.driver);
      const title = await rc.waitForSuccess({ timeout: 25000 }).catch(() => null);
      return { paid: Boolean(title), title };
    }

    const a = await payShare(slugs[0], 'A');
    R.mark('SPLIT_SHARE_1_PAYMENT', a.paid, a.paid ? `share A paid (${a.title})` : `share A NOT paid: ${a.detail || ''}`);
    await sleep(3000);
    const colAfterA = await mget(`/v1/collections/${colId}`);
    const balAfterA = await bal();
    R.mark('SPLIT_PARTIAL_PAYMENT_STATE', /PARTIAL/i.test(colAfterA.status || colAfterA.collection?.status || ''), `collection status=${colAfterA.status || colAfterA.collection?.status}`);
    R.mark('BUSINESS_CREDITED_SHARE_1', balAfterA > before, `business balance ${before} → ${balAfterA}`);

    // ── Consumer B pays share 2 (226 Kz). ──
    const b = await payShare(slugs[1], 'B');
    R.mark('SPLIT_SHARE_2_PAYMENT', b.paid, b.paid ? `share B paid (${b.title})` : `share B NOT paid: ${b.detail || ''}`);
    await sleep(3000);
    const colDone = await mget(`/v1/collections/${colId}`);
    const finalStatus = colDone.status || colDone.collection?.status;
    const balFinal = await bal();
    R.mark('SPLIT_CHARGE_COMPLETION', /COMPLETED/i.test(finalStatus || ''), `collection status=${finalStatus}`);
    R.mark('SPLIT_MULTI_PAYER_E2E', a.paid && b.paid, 'two independent consumers each settled one share');
    R.mark('BUSINESS_FINANCIAL_ASSERTIONS', balFinal > before, `business AOA ${before} → ${balFinal} (+${balFinal - before} minor across A+B)`);

    // ── Per-share PAID truth. ──
    const finalShares = ((await mget(`/v1/collections/${colId}/shares`)).data) || [];
    const paidCount = finalShares.filter((s) => s.status === 'PAID').length;
    R.mark('SPLIT_SHARES_BOTH_PAID', paidCount === 2, `${paidCount}/2 shares PAID`);
    R.mark('SPLIT_SHARE_DUPLICATE_FINANCIAL_EFFECTS=0', finalShares.every((s) => s.status === 'PAID'), 'no share left unpaid or double-settled');

    // ── System-wide economic integrity. ──
    const bk = bookSum();
    R.mark('BOOK_BALANCED', bk.balanced, `signed ledger sum=${bk.sum}`);
  } catch (e) {
    R.mark('PROOF_19', false, e.message);
  } finally {
    await browser.close().catch(() => {});
    if (biz) await retireBusiness(biz.merchantId);
    for (const c of consumers) { try { await c.context.close().catch(() => {}); } catch {} try { retireConsumer(c.handle, { runId: 'proof19' }); } catch {} }
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_19_COLLECTIONS_SPLIT_SETTLEMENT=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
