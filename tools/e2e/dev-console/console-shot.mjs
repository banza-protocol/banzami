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
const keyIds = []; let csrf = null, projId = null;
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

  for (const [name, scopes] of [
    ['Chave do servidor', ['payments:read', 'payments:write']],
    ['Chave de leitura', ['payments:read']],
  ]) {
    r = await ctx.request.post(`${API}/projects/${projId}/keys`, {
      headers: H, data: { kind: 'SECRET', name, scopes },
    });
    if (r.ok()) { const j = await r.json(); keyIds.push(j.id || j.key?.id); console.log('key created:', name); }
    else console.log('key create →', r.status());
  }

  const page = await ctx.newPage();
  for (const [route, file] of [['/api-keys', 'console-keys'], ['/dashboard', 'console-overview'], ['/webhooks', 'console-webhooks']]) {
    await page.goto(CONSOLE + route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${file}.png` });
    console.log('shot', file, '←', page.url().replace(CONSOLE, '') || '/');
  }
} finally {
  for (const id of keyIds) {
    if (!id || !csrf) continue;
    const r = await ctx.request.delete(`${API}/keys/${id}`, { headers: { ...ORIGIN, 'X-CSRF-Token': csrf } }).catch(() => null);
    console.log('key revoked →', r ? r.status() : 'failed');
  }
  await browser.close();
}
