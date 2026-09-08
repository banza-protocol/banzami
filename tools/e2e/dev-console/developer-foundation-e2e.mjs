/**
 * developer-foundation-e2e.mjs — Release Train 01 deployed-Sandbox E2E.
 *
 * Real Chromium against the deployed Sandbox Developer Console + Developer API +
 * public Docs. Covers CAP-DEV-001 (Console: auth/session/cookie/CSRF/workspace/
 * project isolation/accessibility), CAP-DEV-002 (API-key lifecycle: create/
 * reveal-once/list-no-secret/revoke/rotate/cross-tenant/bz_test-only), and
 * CAP-DOCS-001 (Docs: static/no-auth/anchors/no-internal-leak/legacy routing).
 *
 * OTP: recovered server-side via tools/e2e/dev-console/otp-retrieve.sh (the
 * deployed system's own store; no readable inbox is provisioned). NEVER prints
 * any OTP, session token, CSRF token or raw API key — only booleans/lengths.
 *
 * Run: BANZAMI_E2E=RUN node tools/e2e/dev-console/developer-foundation-e2e.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { registerCleanup } from '../console/lib/run-cleanup.mjs';
import { assuranceDir } from '../lib/assurance-output.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const CONSOLE = 'https://developers.banzami.com';
const API = 'https://developer-api.banzami.com';
const ORIGIN = { Origin: CONSOLE, 'Content-Type': 'application/json' };

if (process.env.BANZAMI_E2E !== 'RUN') { console.error('refusing to run without BANZAMI_E2E=RUN (sandbox-only)'); process.exit(2); }

const results = [];
const rec = (id, ok, note = '') => { results.push({ id, ok, note }); console.log(`  ${ok ? '✓' : '✗'} ${id}${note ? ' — ' + note : ''}`); };
const ts = () => process.env.E2E_TS; // stamped by wrapper for determinism
const stamp = process.env.E2E_TS || String(Math.floor(Date.now() / 1000));
const email = n => `rt01-${n}-${stamp}@banzami-e2e.test`;

// Give the authority back. This harness signs accounts in, creates workspaces,
// projects and keys, and until now kept every one of them: the fixtures from
// each run stayed live on the operator, one set at a time, forever. Financial
// history is untouched — what goes is the authority, because a leftover account
// that can still sign in is not a leftover, it is a way in.
registerCleanup({
  emailPattern: `rt01-%${stamp}@banzami-e2e.test`,
  namePattern: `rt01-%${stamp}`,
});
const getOTP = e => execFileSync('bash', [resolve(HERE, 'otp-retrieve.sh'), e], { encoding: 'utf8' }).trim();

async function signIn(ctx, e) {
  let r = await ctx.request.post(`${API}/auth/request-otp`, { headers: ORIGIN, data: { email: e } });
  if (!r.ok()) throw new Error(`request-otp ${r.status()}`);
  const code = getOTP(e);
  if (!/^\d{6}$/.test(code)) throw new Error('otp not recovered');
  r = await ctx.request.post(`${API}/auth/verify`, { headers: ORIGIN, data: { email: e, code } });
  if (!r.ok()) throw new Error(`verify ${r.status()}`);
  const csrf = (await r.json()).csrf_token;
  return { code, csrf };
}

const browser = await chromium.launch();
try {
  // ── CAP-DEV-001: unauthenticated protected route redirects ────────────────
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${CONSOLE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const url = page.url();
    rec('DEV-001.unauth-protected-redirects', /\/login/.test(url), url.replace(CONSOLE, ''));
    await ctx.close();
  }

  // ── CAP-DEV-001: login page renders + accessibility + mobile ──────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await page.goto(`${CONSOLE}/login`, { waitUntil: 'domcontentloaded' });
    const emailInput = page.locator('input[type="email"]');
    const visible = await emailInput.first().isVisible().catch(() => false);
    rec('DEV-001.login-renders-mobile', visible, 'email input visible @375px');
    await emailInput.first().focus();
    const focused = await emailInput.first().evaluate(el => el === document.activeElement).catch(() => false);
    rec('DEV-001.login-keyboard-focus', focused);
    await ctx.close();
  }

  // ── Main authenticated context (user A) ───────────────────────────────────
  const ctxA = await browser.newContext();
  const emailA = email('a');
  const { code: codeA, csrf: csrfA } = await signIn(ctxA, emailA);

  // OTP single-use: reuse the same code → must fail
  {
    const r = await ctxA.request.post(`${API}/auth/verify`, { headers: ORIGIN, data: { email: emailA, code: codeA } });
    rec('DEV-002.otp-single-use', !r.ok(), `reuse → ${r.status()}`);
  }
  // Invalid OTP fails safely
  {
    const r = await ctxA.request.post(`${API}/auth/verify`, { headers: ORIGIN, data: { email: email('bad'), code: '000000' } });
    rec('DEV-001.invalid-otp-fails', !r.ok(), `→ ${r.status()}`);
  }
  // Session cookie attributes
  {
    const cookies = await ctxA.cookies(API);
    const s = cookies.find(c => c.name.includes('bz_dev_session'));
    const ok = s && s.httpOnly && s.secure && /Lax/i.test(s.sameSite) && s.name.startsWith('__Host-') && s.path === '/';
    rec('DEV-001.session-cookie-attrs', !!ok, s ? `${s.name} httpOnly=${s.httpOnly} secure=${s.secure} sameSite=${s.sameSite}` : 'no cookie');
  }
  // Authenticated /auth/me works in the browser context
  {
    const r = await ctxA.request.get(`${API}/auth/me`, { headers: { Origin: CONSOLE } });
    rec('DEV-001.session-authenticated', r.ok(), `me → ${r.status()}`);
  }
  // Session survives a real page load + refresh (browser)
  {
    const page = await ctxA.newPage();
    await page.goto(`${CONSOLE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const stayed = !/\/login/.test(page.url());
    // No session/OTP secret in browser storage
    const storage = await page.evaluate(() => JSON.stringify({ ls: { ...localStorage }, ss: { ...sessionStorage } }));
    const leak = /bz_dev_session|__Host-|\b\d{6}\b(?![^"]*count)/.test(storage) && /session|otp|secret|token/i.test(storage);
    rec('DEV-001.session-survives-refresh', stayed, page.url().replace(CONSOLE, ''));
    rec('DEV-001.no-secret-in-storage', !leak);
    await page.close();
  }
  // CSRF: state-changing without token → 403; with token → 200
  let wsId, projId;
  {
    const noCsrf = await ctxA.request.post(`${API}/workspaces`, { headers: ORIGIN, data: { name: `rt01-ws-${stamp}` } });
    rec('DEV-001.csrf-blocks-without-token', noCsrf.status() === 403, `→ ${noCsrf.status()}`);
    const withCsrf = await ctxA.request.post(`${API}/workspaces`, { headers: { ...ORIGIN, 'X-CSRF-Token': csrfA }, data: { name: `rt01-ws-${stamp}` } });
    rec('DEV-001.workspace-create', withCsrf.ok(), `→ ${withCsrf.status()}`);
    if (withCsrf.ok()) wsId = (await withCsrf.json()).id || (await withCsrf.json()).workspace?.id;
  }
  // Resolve workspace id if not in create response
  if (!wsId) {
    const r = await ctxA.request.get(`${API}/workspaces`, { headers: { Origin: CONSOLE } });
    const arr = await r.json(); wsId = (Array.isArray(arr) ? arr : arr.workspaces || arr.data || [])[0]?.id;
  }
  // Create project
  {
    const r = await ctxA.request.post(`${API}/workspaces/${wsId}/projects`, { headers: { ...ORIGIN, 'X-CSRF-Token': csrfA }, data: { name: `rt01-proj-${stamp}` } });
    rec('DEV-001.project-create', r.ok(), `→ ${r.status()}`);
    if (r.ok()) projId = (await r.json()).id || (await r.json()).project?.id;
  }
  if (!projId) {
    const r = await ctxA.request.get(`${API}/workspaces/${wsId}/projects`, { headers: { Origin: CONSOLE } });
    const arr = await r.json(); projId = (Array.isArray(arr) ? arr : arr.projects || arr.data || [])[0]?.id;
  }

  // ── CAP-DEV-002: API-key lifecycle (management) ───────────────────────────
  let keyId;
  {
    const r = await ctxA.request.post(`${API}/projects/${projId}/keys`, { headers: { ...ORIGIN, 'X-CSRF-Token': csrfA }, data: { kind: 'SECRET', name: `rt01-key-${stamp}`, scopes: ['payments:read'] } });
    const body = r.ok() ? await r.json() : {};
    const secret = body.secret || body.key?.secret;
    keyId = body.id || body.key?.id;
    rec('DEV-002.key-create-reveal-once', r.ok() && typeof secret === 'string' && secret.startsWith('bz_test_'), r.ok() ? `secret revealed (len ${secret?.length||0}, bz_test_ prefix)` : `→ ${r.status()}`);
  }
  // List keys → no raw secret recoverable
  {
    const r = await ctxA.request.get(`${API}/projects/${projId}/keys`, { headers: { Origin: CONSOLE } });
    const txt = await r.text();
    const hasSecret = /"secret"\s*:\s*"bz_test_[A-Za-z0-9_]{8,}/.test(txt);
    rec('DEV-002.list-no-raw-secret', r.ok() && !hasSecret, r.ok() ? 'metadata only' : `→ ${r.status()}`);
  }
  // Rotate the created key → new reveal-once secret; capture the NEW key id
  // (rotate revokes the old key and issues a replacement).
  let rotatedId;
  if (keyId) {
    const r = await ctxA.request.post(`${API}/keys/${keyId}/rotate`, { headers: { ...ORIGIN, 'X-CSRF-Token': csrfA }, data: {} });
    const body = r.ok() ? await r.json() : {};
    const secret = body.secret || body.key?.secret;
    rotatedId = body.id || body.key?.id;
    rec('DEV-002.key-rotate-reveal-once', r.ok() && typeof secret === 'string' && secret.startsWith('bz_test_'), `→ ${r.status()}`);
  }
  // Revoke a LIVE key (the rotated replacement) → 2xx; then it must be REVOKED
  // in a re-list. (dev-console keys have no gateway consumption path — see report.)
  if (rotatedId) {
    const r = await ctxA.request.delete(`${API}/keys/${rotatedId}`, { headers: { ...ORIGIN, 'X-CSRF-Token': csrfA } });
    rec('DEV-002.key-revoke', r.ok(), `→ ${r.status()}`);
    const list = await ctxA.request.get(`${API}/projects/${projId}/keys`, { headers: { Origin: CONSOLE } });
    const arr = await list.json();
    const keys = Array.isArray(arr) ? arr : arr.keys || arr.data || [];
    const revoked = keys.find(k => k.id === rotatedId);
    rec('DEV-002.revoked-key-status', !!revoked && /revoked/i.test(revoked.status || ''), revoked ? `status=${revoked.status}` : 'not found');
  }
  // Original (rotated-away) key id is already invalid → delete is 404 (safe)
  if (keyId) {
    const r = await ctxA.request.delete(`${API}/keys/${keyId}`, { headers: { ...ORIGIN, 'X-CSRF-Token': csrfA } });
    rec('DEV-002.rotated-away-key-gone', r.status() === 404 || r.status() === 409, `stale delete → ${r.status()}`);
  }

  // ── Tenant isolation (user B cannot touch A's resources) ──────────────────
  {
    const ctxB = await browser.newContext();
    const emailB = email('b');
    const { csrf: csrfB } = await signIn(ctxB, emailB);
    const rWs = await ctxB.request.get(`${API}/workspaces/${wsId}`, { headers: { Origin: CONSOLE } });
    rec('DEV-001.cross-tenant-workspace-denied', rWs.status() === 404 || rWs.status() === 403, `→ ${rWs.status()}`);
    const rProj = await ctxB.request.get(`${API}/projects/${projId}`, { headers: { Origin: CONSOLE } });
    rec('DEV-001.cross-tenant-project-denied', rProj.status() === 404 || rProj.status() === 403, `→ ${rProj.status()}`);
    const rKeys = await ctxB.request.get(`${API}/projects/${projId}/keys`, { headers: { Origin: CONSOLE } });
    rec('DEV-002.cross-tenant-keys-denied', rKeys.status() === 404 || rKeys.status() === 403, `→ ${rKeys.status()}`);
    await ctxB.close();
  }

  // ── Logout invalidates session ────────────────────────────────────────────
  {
    const r = await ctxA.request.post(`${API}/auth/logout`, { headers: { ...ORIGIN, 'X-CSRF-Token': csrfA }, data: {} });
    rec('DEV-001.logout', r.ok(), `→ ${r.status()}`);
    const me = await ctxA.request.get(`${API}/auth/me`, { headers: { Origin: CONSOLE } });
    rec('DEV-001.session-invalid-after-logout', me.status() === 401, `me → ${me.status()}`);
  }
  await ctxA.close();

  // ── CAP-DOCS-001: public docs (no auth) ───────────────────────────────────
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const fetches = [];
    page.on('request', req => { if (/developer-api\.banzami\.com\/(auth|workspaces|projects|keys)/.test(req.url())) fetches.push(req.url()); });
    const resp = await page.goto(`${CONSOLE}/docs`, { waitUntil: 'domcontentloaded' });
    rec('DOCS-001.reachable-no-login', resp.ok() && !/\/login/.test(page.url()), `→ ${resp.status()}`);
    rec('DOCS-001.no-management-api-fetch', fetches.length === 0, `${fetches.length} developer-api mgmt calls`);
    const html = await page.content();
    // The glossary anchors moved with the documentation's information
    // architecture: /docs is now a landing page and the glossary owns its own
    // route. Assert them where they live, so this keeps testing that the
    // concepts are deep-linkable without auth rather than testing a layout
    // decision that has since changed.
    const gloss = await ctx.newPage();
    const gr = await gloss.goto(`${CONSOLE}/docs/glossary`, { waitUntil: 'domcontentloaded' });
    const gHtml = await gloss.content();
    rec('DOCS-001.glossary-reachable-no-login', !!gr?.ok() && !/\/login/.test(gloss.url()), `→ ${gr?.status()}`);
    rec('DOCS-001.conceitos-anchor', /id="conceitos"/.test(gHtml));
    rec('DOCS-001.glossario-anchor', /id="glossario"/.test(gHtml));
    await gloss.close();
    const leak = /(localhost|127\.0\.0\.1|172\.\d|core-api|:808\d|217\.160\.9\.248|banzami-postgres)/.test(html);
    rec('DOCS-001.no-internal-host-leak', !leak);
    // legacy /developers/docs reaches canonical without loop
    const legacy = await page.goto(`${CONSOLE}/developers/docs`, { waitUntil: 'domcontentloaded' });
    rec('DOCS-001.legacy-route-safe', legacy.ok() && /\/docs/.test(page.url()), page.url().replace(CONSOLE, ''));
    await ctx.close();
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  const EVIDENCE_DIR = assuranceDir('developer-foundation');
  const out = {
    programme: 'BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 / Release Train 01',
    test: 'tools/e2e/dev-console/developer-foundation-e2e.mjs',
    date_stamp: stamp,
    console_host: CONSOLE, api_host: API,
    deployed_commit: process.env.E2E_COMMIT || 'unknown',
    schema: 'banzami_staging (account_identity + developer schemas)',
    fixture_namespace: `rt01-*-${stamp}@banzami-e2e.test`,
    otp_delivery: 'controlled server-side recovery (no inbox provisioned); email sent via Resend',
    total: results.length, passed, failed,
    matrix: results,
    secrets_note: 'No OTP, session token, CSRF token or raw API key was printed or stored in this artifact.',
  };
  writeFileSync(join(EVIDENCE_DIR, `e2e-${stamp}.json`), JSON.stringify(out, null, 2));
  console.log(`\n${failed === 0 ? '✓' : '✗'} developer-foundation E2E: ${passed}/${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
} finally {
  await browser.close();
}
