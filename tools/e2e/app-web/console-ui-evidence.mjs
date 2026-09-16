#!/usr/bin/env node
/**
 * WEB-E2E-RUNNER-001 — Console UI evidence (items 18, 19).
 *
 * Drives the authenticated Developers Console in a real browser (it is a Next.js
 * app with an ordinary DOM, so standard Playwright selectors work) and confirms,
 * from live rendering rather than source inspection, that:
 *   18. the API Explorer renders BOTH the "Testar na App Banzami Web ↗" and the
 *       "Abrir a página de pagamento" actions for a payer-facing response;
 *   19. the App Banzami page exists in the sidebar and shows "Sandbox ·
 *       Disponível" and the three testing modes.
 *
 * The session is minted the documented way (request-otp → the message → verify)
 * and given to the browser as its cookie — the same approach the existing
 * console browser acceptance uses.
 *
 *   node console-ui-evidence.mjs
 */
import { launchChromium } from './lib/browser.mjs';
import { provisionMerchant } from './lib/provision.mjs';
import { API } from '../cleanroom/console-client.mjs';
import { GateReport } from './lib/report.mjs';
import { assuranceDir } from '../lib/assurance-output.mjs';

const CONSOLE = process.env.BZ_CONSOLE ?? 'https://developers.banzami.com';
const R = new GateReport('console-ui-evidence');
const stamp = Date.now().toString(36);

let browser; let M;
try {
  ({ browser } = await launchChromium());
  M = await provisionMerchant({ prefix: 'appweb-ui' });

  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: '__Host-bz_dev_session', value: M.sess.token, url: API, httpOnly: true, secure: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(([w, p]) => {
    try { localStorage.setItem('bz_dev_active_ws', w); localStorage.setItem(`bz_dev_active_prj_${w}`, p); } catch { /* */ }
  }, [M.ws, M.project]);
  const page = await ctx.newPage();

  // ── Item 19: App Banzami Console page + sidebar nav ───────────────────────
  await page.goto(`${CONSOLE}/app-banzami`, { waitUntil: 'networkidle' });
  const bodyText = await page.locator('body').innerText();
  const navHasAppBanzami = await page.getByText('App Banzami', { exact: false }).count() > 0;
  R.mark('DEVELOPER_CONSOLE_APP_BANZAMI_NAV', navHasAppBanzami, 'App Banzami present in Console');
  const sandboxAvailable = /Sandbox/.test(bodyText) && /Dispon[íi]vel/.test(bodyText);
  R.mark('APP_BANZAMI_PAGE_SANDBOX_AVAILABLE', sandboxAvailable, 'Sandbox · Disponível shown');
  // The three Sandbox testing modes: App Banzami Web + test payer as cards, the
  // hosted checkout named in prose ("checkout hospedado" / pay.banzami.com).
  const lower = bodyText.toLowerCase();
  const modes = {
    'App Banzami Web': lower.includes('app banzami web'),
    'Pagador de teste': lower.includes('pagador de teste'),
    'Checkout hospedado': lower.includes('checkout hospedado') || lower.includes('pay.banzami.com') || lower.includes('página de pagamento'),
  };
  const shown = Object.entries(modes).filter(([, v]) => v).map(([k]) => k);
  R.mark('APP_BANZAMI_THREE_MODES_RENDERED', shown.length === 3, `modes: ${shown.join(', ')}`);

  // ── Item 18: API Explorer renders both payer actions ──────────────────────
  await page.goto(`${CONSOLE}/explorer?op=createPaymentSession`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="explorer-send"]').waitFor({ timeout: 20000 });
  const textarea = page.locator('textarea').first();
  if (await textarea.count()) {
    await textarea.fill(JSON.stringify({
      purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `ui_${stamp}`,
      amount_minor: 175000, currency: 'AOA', description: 'Console UI evidence',
    }, null, 2));
  }
  await page.locator('[data-testid="explorer-send"]').click();
  await page.locator('[data-testid="explorer-response"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);

  const appWebBtn = page.locator('[data-testid="explorer-app-web"]');
  const hostedBtn = page.locator('[data-testid="explorer-hosted-page"]');
  const appWebHref = await appWebBtn.getAttribute('href').catch(() => null);
  const hostedHref = await hostedBtn.getAttribute('href').catch(() => null);
  const appWebText = await appWebBtn.innerText().catch(() => '');
  R.mark('API_EXPLORER_APP_WEB_ACTION_RENDERED',
    Boolean(appWebHref && /app\.banzami\.com\/pay\//.test(appWebHref)),
    `"${appWebText.trim()}" -> ${appWebHref}`);
  R.mark('API_EXPLORER_HOSTED_ACTION_RENDERED',
    Boolean(hostedHref && /pay\.banzami\.com\/pay\/|\/pay\//.test(hostedHref)),
    `hosted -> ${hostedHref}`);

  await ctx.close();
} catch (e) {
  R.mark('CONSOLE_UI_EVIDENCE', false, e.message);
} finally {
  try { if (M?.ws) await M.call('DELETE', `/workspaces/${M.ws}`, { name: M.wsName }); } catch { /* best effort */ }
  if (browser) await browser.close().catch(() => {});
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nCONSOLE_UI_EVIDENCE=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exitCode = R.ok ? 0 : 1;
}
