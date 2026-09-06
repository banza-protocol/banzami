/**
 * console-shot.mjs — capture the REAL deployed Developer Console for the deck.
 *
 * Signs in as a throwaway synthetic developer (the same server-side OTP path the
 * CAP-DEV-001 harness uses, which refuses real addresses), creates a workspace,
 * a project and one API key, screenshots the Console, then REVOKES the key it
 * minted. RA-077: a harness must withdraw what it creates.
 *
 * No mock, no illustrative data — this is the deployed product.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const HARNESS = '/Users/fm65/banzami/tools/e2e/dev-console';
const CONSOLE = 'https://developers.banzami.com';
const API = 'https://developer-api.banzami.com';
const ORIGIN = { Origin: CONSOLE, 'Content-Type': 'application/json' };
const stamp = String(Math.floor(Date.now() / 1000));
const email = `shot-${stamp}@banzami-e2e.test`;
const getOTP = e => execFileSync('bash', [`${HARNESS}/otp-retrieve.sh`, e], { encoding: 'utf8' }).trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
let keyId = null, csrf = null, projId = null;
try {
  let r = await ctx.request.post(`${API}/auth/request-otp`, { headers: ORIGIN, data: { email } });
  if (!r.ok()) throw new Error(`request-otp ${r.status()}`);
  const code = getOTP(email);
  if (!/^\d{6}$/.test(code)) throw new Error('otp not recovered');
  r = await ctx.request.post(`${API}/auth/verify`, { headers: ORIGIN, data: { email, code } });
  if (!r.ok()) throw new Error(`verify ${r.status()}`);
  csrf = (await r.json()).csrf_token;
  console.log('signed in');

  const H = { ...ORIGIN, 'X-CSRF-Token': csrf };
  r = await ctx.request.post(`${API}/workspaces`, { headers: H, data: { name: 'Banzami Demo' } });
  let wsId = r.ok() ? ((await r.json()).id || (await r.json()).workspace?.id) : null;
  if (!wsId) {
    const g = await ctx.request.get(`${API}/workspaces`, { headers: { Origin: CONSOLE } });
    const a = await g.json(); wsId = (Array.isArray(a) ? a : a.workspaces || a.data || [])[0]?.id;
  }
  r = await ctx.request.post(`${API}/workspaces/${wsId}/projects`, { headers: H, data: { name: 'Loja Online' } });
  projId = r.ok() ? ((await r.json()).id || (await r.json()).project?.id) : null;
  if (!projId) {
    const g = await ctx.request.get(`${API}/workspaces/${wsId}/projects`, { headers: { Origin: CONSOLE } });
    const a = await g.json(); projId = (Array.isArray(a) ? a : a.projects || a.data || [])[0]?.id;
  }
  console.log('workspace + project ready');

  r = await ctx.request.post(`${API}/projects/${projId}/api-keys`, {
    headers: H, data: { name: 'Chave do servidor', scopes: ['payments:write', 'payments:read', 'webhooks:write'] },
  });
  if (r.ok()) { const j = await r.json(); keyId = j.id || j.api_key?.id || j.key?.id; console.log('api key created'); }
  else console.log('api key create →', r.status());

  const page = await ctx.newPage();
  for (const [route, file] of [['/api-keys', 'console-keys'], ['/dashboard', 'console-overview'], ['/webhooks', 'console-webhooks']]) {
    await page.goto(CONSOLE + route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${file}.png` });
    console.log('shot', file, '←', page.url().replace(CONSOLE, '') || '/');
  }
} finally {
  if (keyId && csrf && projId) {
    const r = await ctx.request.post(`${API}/projects/${projId}/api-keys/${keyId}/revoke`, {
      headers: { ...ORIGIN, 'X-CSRF-Token': csrf }, data: {},
    }).catch(() => null);
    console.log('key revoked →', r ? r.status() : 'failed');
  }
  await browser.close();
}
