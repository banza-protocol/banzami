#!/usr/bin/env node
/**
 * APP-BANZAMI-WEB-DUAL-APP-PARITY-001 — Proof 10: full Business Web sign-in on the
 * ACTUAL native Business app.
 *
 * A generic synthetic Business (canonical onboarding: application → KYB docs →
 * approve → activation, NO DB writes/backdoor) signs in through the REAL native
 * screens now hosted on Web — Welcome → Conectar conta → @handle → Continuar →
 * PIN → Home — then navigates the native tab tree, opens Receber, and logs out
 * through the native Profile. No session injection, no BFF session mutation, no
 * auth bypass. Also proves: the merchant JWT/refresh stay server-side (browser
 * holds only the opaque web session + a sentinel), the BFF-echoed merchant_id
 * adapter that lets the shared native login resolve identity on Web, auth
 * persistence across a hard refresh, and that the old session cannot be replayed
 * after logout.
 *
 *   BANZAMI_E2E=RUN node proofs/10-business-web-login.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { FlutterSemanticsDriver } from '../lib/semantics-driver.mjs';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';
import { businessWebSignIn } from '../lib/business-signin.mjs';

const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';
const R = new GateReport('10-business-web-login');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.env.BANZAMI_E2E !== 'RUN') {
  console.error('refusing to run: set BANZAMI_E2E=RUN to drive the deployed app-web');
  process.exit(2);
}

/** A cookie-jar fetch helper against the BFF, to inspect the server-side session. */
function bff() {
  const jar = {};
  const ch = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const grab = (res) => { const a = res.headers.getSetCookie ? res.headers.getSetCookie() : []; for (const c of a) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) jar[m[1]] = m[2]; } };
  return { jar, ch, grab };
}

(async () => {
  let biz;
  const { browser } = await launchChromium();
  try {
    biz = await provisionBusiness({ handlePrefix: 'e2ebizlogin' });
    R.mark('GENERIC_SYNTHETIC_BUSINESS_PROVISIONED', !!biz.handle && !!biz.merchantId, `@${biz.handle}`);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${APP}/business`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const d = new FlutterSemanticsDriver(page, { label: 'biz' });
    await d.enableSemantics();

    // Direct /business while logged out shows the native Business Welcome.
    const sawWelcome = await d.waitForText('Conectar conta', { timeout: 25000 }).then(() => true).catch(() => false);
    R.mark('DIRECT_BUSINESS_ROUTE_AUTH', sawWelcome, 'unauthenticated /business shows the native Business Welcome');

    // 1/2/4. Full native sign-in journey (@handle + PIN → Home).
    await businessWebSignIn(d, biz);
    const home = await d.waitForText('Saldo disponível', { timeout: 30000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_WEB_FULL_SIGNIN_E2E', home, 'reached the native Business Home via Welcome→@handle→PIN');
    // Reaching Home from a Web sign-in where the token is a BFF sentinel proves the
    // non-secret merchant_id adapter (BFF body → MerchantAuthTokens.merchantId →
    // shared MerchantLoginScreen); without it the shared screen throws before Home.
    R.mark('BUSINESS_WEB_MERCHANT_ID_ADAPTER', home, 'shared native login resolved identity via the BFF merchant_id');

    // 5. Native Home content: identity + Sandbox truth, no Consumer contamination.
    const homeText = home ? await d.visibleText() : '';
    R.mark('BUSINESS_WEB_NATIVE_HOME_AFTER_LOGIN', /Saldo disponível/.test(homeText), 'native Business Home rendered');
    R.mark('BUSINESS_WEB_SANDBOX_TRUTH', /SANDBOX|Sandbox/.test(homeText), 'Sandbox truth visible on Home');

    // 3. Server-side authority + no real Bearer in the browser.
    const store = await page.evaluate(() => {
      const dump = {};
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); dump[k] = localStorage.getItem(k); } } catch (_) {}
      return { cookie: document.cookie, ls: dump };
    });
    const lsBlob = JSON.stringify(store.ls);
    // A real merchant JWT is a 3-part dotted token; the browser must never hold one.
    const jwtInLs = /"[^"]*\.[^"]*\.[^"]*"/.test(lsBlob) && /eyJ/.test(lsBlob);
    const jwtInCookie = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(store.cookie);
    R.mark('BUSINESS_WEB_REAL_BEARER_BROWSER_EXPOSURE_0', !jwtInLs && !jwtInCookie, 'no real merchant Bearer in cookie/localStorage');
    const st = await page.evaluate(async () => (await fetch('/session/state', { credentials: 'include' }).then((r) => r.json()).catch(() => ({}))));
    const serverSide = st.business === true && !!(st.business_context && st.business_context.merchant_id);
    R.mark('BUSINESS_WEB_AUTHORITY_SERVER_SIDE', serverSide, 'business_authority held server-side (BFF /session/state)');
    R.mark('BUSINESS_WEB_MERCHANT_ID_MATCHES', st.business_context && st.business_context.merchant_id === biz.merchantId, `merchant_id=${st.business_context?.merchant_id}`);

    // 6. Hard refresh keeps the session (restored from the server-side web session).
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await d.enableSemantics();
    const stillIn = await d.waitForText('Saldo disponível', { timeout: 30000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_WEB_AUTH_HARD_REFRESH', stillIn, 'hard refresh restored the Business session (no login loop)');

    // 7. Native tab tree.
    await d.tapText('Histórico').catch(() => {});
    const hist = await d.waitForText('Histórico', { timeout: 15000 }).then(() => true).catch(() => false);
    await d.tapText('Perfil').catch(() => {});
    const perfil = await d.waitForText('Terminar sessão', { timeout: 15000 }).then(() => true).catch(() => false);
    await d.tapText('Receber').catch(() => {});
    const onReceive = await d.waitForText('Mostre este QR', { timeout: 20000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_WEB_NATIVE_TAB_TREE_E2E', hist && perfil && onReceive, 'Início/Histórico/Receber/Perfil are the native screens');

    // 8. Receive screen = persistent Receive Point + Criar cobrança.
    const recvText = await d.visibleText();
    R.mark('BUSINESS_WEB_NATIVE_RECEIVE_E2E', /Mostre este QR/.test(recvText) && /Criar cobrança/.test(recvText), 'native Receive Point + Criar cobrança');

    // 9. Logout through the native Profile.
    await d.tapText('Perfil').catch(() => {});
    await d.waitForText('Terminar sessão', { timeout: 15000 });
    // tapButton, NOT tapText. The tile is an InkWell, so Flutter gives it a
    // semantics node with role="button" and pointer-events:all; a tapText on the
    // label overlay is swallowed and onTap never fires — silently, with no Dart
    // exception to notice. That one wrong verb failed this gate AND the replay
    // gate below it, because a logout that never happened leaves the session
    // valid, which reads exactly like business authority surviving logout.
    await d.tapButton('Terminar sessão');
    // Confirm dialog ("Terminar sessão?") → Sair (now a proper semantics button).
    await d.waitForText('Terminar sessão?', { timeout: 10000 }).catch(() => {});
    await sleep(400);
    await d.tapButton('Sair').catch(() => d.tapText('Sair').catch(() => {}));
    const backToWelcome = await d.waitForText('Conectar conta', { timeout: 20000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_WEB_NATIVE_LOGOUT_E2E', backToWelcome, 'logout returns to the native Business Welcome');

    // 10. The old business authority no longer authorizes after logout.
    const afterLogout = await page.evaluate(async () => (await fetch('/session/state', { credentials: 'include' }).then((r) => r.json()).catch(() => ({}))));
    const businessGone = afterLogout.business !== true;
    const replay = await page.evaluate(async () => (await fetch('/business/api/v1/business/receive-point', { credentials: 'include' }).then((r) => r.status).catch(() => 0)));
    R.mark('BUSINESS_WEB_SESSION_REPLAY', businessGone && (replay === 401 || replay === 403),
      `session.business=${afterLogout.business} · post-logout business route → ${replay}`);
  } catch (e) {
    R.mark('PROOF_10', false, e.message);
  } finally {
    await browser.close().catch(() => {});
    // A reused fixture (BZ_BIZ_HANDLE) persists; only retire what this run created.
    if (biz && !biz.reused && biz.merchantId) await retireBusiness(biz.merchantId).catch(() => {});
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_10_BUSINESS_WEB_LOGIN=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
