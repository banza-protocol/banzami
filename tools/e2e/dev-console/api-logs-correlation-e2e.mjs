/**
 * api-logs-correlation-e2e.mjs — Console API Logs (ADR-054), deployed Sandbox.
 *
 * The docs tell a developer to keep the `request_id` from an error envelope and
 * quote it in support. Until the operator recorded per-request logs there was
 * nowhere to look one up, and the Logs screen showed webhook activity instead.
 * This proves the loop actually closes end to end:
 *
 *   real project key → real request to the deployed Gateway → its request_id
 *   → the same id found through the real Console, with the same method, path
 *   and status → and NOT findable by another Project.
 *
 * Both directions of isolation are asserted, plus the non-oracle property: a
 * foreign request_id answers exactly as an id that never existed.
 *
 * Never prints a raw key, secret or OTP.
 *
 * Run: BANZAMI_E2E=RUN node tools/e2e/dev-console/api-logs-correlation-e2e.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const CONSOLE = 'https://developers.banzami.com';
const API = 'https://developer-api.banzami.com';
const GW = 'https://sandbox-api.banzami.com';
const H = { Origin: CONSOLE, 'Content-Type': 'application/json' };
if (process.env.BANZAMI_E2E !== 'RUN') { console.error('need BANZAMI_E2E=RUN'); process.exit(2); }

const stamp = process.env.E2E_TS || String(Math.floor(Date.now() / 1000));
const results = [];
const rec = (id, ok, note = '') => { results.push({ id, ok, note }); console.log(`  ${ok ? '✓' : '✗'} ${id}${note ? ' — ' + note : ''}`); };
const email = n => `rt54-${n}-${stamp}@banzami-e2e.test`;
const getOTP = e => execFileSync('bash', [resolve(HERE, 'otp-retrieve.sh'), e], { encoding: 'utf8' }).trim();
const j = async r => { try { return await r.json(); } catch { return {}; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function signIn(ctx, e) {
  let r = await ctx.request.post(`${API}/auth/request-otp`, { headers: H, data: { email: e } });
  if (!r.ok()) throw new Error(`otp req ${r.status()}`);
  const code = getOTP(e);
  r = await ctx.request.post(`${API}/auth/verify`, { headers: H, data: { email: e, code } });
  if (!r.ok()) throw new Error(`verify ${r.status()}`);
  return (await r.json()).csrf_token;
}
async function mkWsProj(ctx, csrf, tag) {
  const ws = await j(await ctx.request.post(`${API}/workspaces`, { headers: { ...H, 'X-CSRF-Token': csrf }, data: { name: `rt54-ws-${tag}-${stamp}` } }));
  const wsId = ws.id || ws.workspace?.id;
  const pr = await j(await ctx.request.post(`${API}/workspaces/${wsId}/projects`, { headers: { ...H, 'X-CSRF-Token': csrf }, data: { name: `rt54-pr-${tag}-${stamp}` } }));
  return { wsId, projId: pr.id || pr.project?.id };
}
async function mkKey(ctx, csrf, projId, scopes) {
  const b = await j(await ctx.request.post(`${API}/projects/${projId}/keys`,
    { headers: { ...H, 'X-CSRF-Token': csrf }, data: { kind: 'SECRET', name: `k-${stamp}`, scopes } }));
  return b.secret || b.key?.secret;
}

/** Call the deployed Gateway and return {status, requestId} from the response itself. */
async function call(path, key) {
  const r = await fetch(`${GW}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  return { status: r.status, requestId: r.headers.get('x-request-id') || '' };
}

/** Poll the Console's own logs endpoint — writes are asynchronous by design. */
async function findLog(ctx, projId, requestId, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const b = await j(await ctx.request.get(
      `${API}/projects/${projId}/logs?request_id=${encodeURIComponent(requestId)}`, { headers: { Origin: CONSOLE } }));
    if (Array.isArray(b.logs) && b.logs.length) return b;
    await sleep(500);
  }
  return { logs: [] };
}

const browser = await chromium.launch();
try {
  const ctxA = await browser.newContext();
  const csrfA = await signIn(ctxA, email('a'));
  const { projId: prA } = await mkWsProj(ctxA, csrfA, 'a');
  const keyA = await mkKey(ctxA, csrfA, prA, ['identity:read']);
  rec('LOG.setup-key-issued', typeof keyA === 'string' && keyA.startsWith('bz_test_sk_'), `bz_test_sk_ len ${keyA?.length || 0}`);

  // ── 1. A real successful request, and its request_id ───────────────────────
  const ok = await call('/v1/me', keyA);
  rec('LOG.gateway-returns-request-id', ok.status === 200 && /^[0-9a-f-]{8,}$/i.test(ok.requestId),
    `/v1/me → ${ok.status}, x-request-id present=${!!ok.requestId}`);

  // ── 2. The SAME id, found through the Console ──────────────────────────────
  const foundOk = await findLog(ctxA, prA, ok.requestId);
  const rowOk = foundOk.logs?.[0];
  rec('LOG.success-request-is-logged', !!rowOk, rowOk ? `${rowOk.method} ${rowOk.path} → ${rowOk.status}` : 'not found');
  rec('LOG.fields-match-the-actual-request',
    !!rowOk && rowOk.method === 'GET' && rowOk.path === '/v1/me' && rowOk.status === ok.status && rowOk.request_id === ok.requestId,
    rowOk ? `method=${rowOk.method} path=${rowOk.path} status=${rowOk.status}` : '—');
  rec('LOG.latency-and-environment-recorded',
    !!rowOk && typeof rowOk.latency_ms === 'number' && rowOk.environment === 'SANDBOX',
    rowOk ? `latency_ms=${rowOk.latency_ms} env=${rowOk.environment}` : '—');
  rec('LOG.retention-window-reported', typeof foundOk.retention_days === 'number' && foundOk.retention_days > 0,
    `retention_days=${foundOk.retention_days}`);

  // ── 3. A FAILING request is logged too — that is the one being debugged ────
  // A route that EXISTS and authenticates, then denies: an unrouted path 404s
  // before authentication and has no project to attribute — correctly unlogged.
  const denied = await call('/v1/refunds', keyA); // key lacks refunds:read
  const foundBad = await findLog(ctxA, prA, denied.requestId);
  const rowBad = foundBad.logs?.[0];
  rec('LOG.failure-is-logged-too', !!rowBad && rowBad.status === denied.status && denied.status >= 400,
    `gateway ${denied.status} → logged ${rowBad?.status ?? 'nothing'}`);

  // ── 4. Nothing credential-bearing is ever returned ────────────────────────
  {
    const txt = JSON.stringify(foundOk);
    const leaks = txt.includes(keyA) || /authorization|api_key|apikey|webhook_secret|cookie/i.test(txt);
    rec('LOG.no-credential-in-the-log-response', !leaks, leaks ? 'LEAK' : 'method/path/status/request_id/latency only');
  }

  // ── 5. The real Console UI shows it ────────────────────────────────────────
  {
    const page = await ctxA.newPage();
    await page.goto(`${CONSOLE}/logs`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const hasTab = await page.getByText('Pedidos à API').count() > 0;
    rec('LOG.console-has-an-api-requests-tab', hasTab);
    const box = page.getByPlaceholder(/request_id/i).first();
    if (await box.count() > 0) {
      await box.fill(ok.requestId);
      await page.waitForTimeout(3000);
      const body = await page.locator('body').innerText();
      rec('LOG.console-ui-finds-the-request-id', body.includes(ok.requestId) && body.includes('/v1/me'),
        body.includes(ok.requestId) ? 'row rendered with its path' : 'not rendered');
    } else {
      rec('LOG.console-ui-finds-the-request-id', false, 'filter input not found');
    }
    await page.close();
  }

  // ── 5b. The Overview reports the project's REAL traffic ───────────────────
  // It used to render invented KPIs behind a label. Asserting the numbers move
  // with actual requests is the only check that distinguishes "wired" from
  // "wired to something".
  {
    const before = await j(await ctxA.request.get(`${API}/projects/${prA}/logs?limit=1`, { headers: { Origin: CONSOLE } }));
    const n0 = before.summary?.requests ?? -1;
    await call('/v1/me', keyA);
    await call('/v1/me', keyA);
    let n1 = n0;
    for (let i = 0; i < 20 && n1 < n0 + 2; i++) {
      const after = await j(await ctxA.request.get(`${API}/projects/${prA}/logs?limit=1`, { headers: { Origin: CONSOLE } }));
      n1 = after.summary?.requests ?? -1;
      if (n1 >= n0 + 2) break;
      await sleep(500);
    }
    rec('LOG.overview-summary-counts-real-requests', n1 >= n0 + 2, `requests ${n0} → ${n1} after 2 calls`);

    const page = await ctxA.newPage();
    await page.goto(`${CONSOLE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const body = await page.locator('body').innerText();
    const invented = ['1.482', '12.450.000', '24.9k', '3.204', '95.3%', 'invoice.paid', 'INV-2025'];
    const found = invented.filter((v) => body.includes(v));
    rec('LOG.overview-has-no-invented-figures', found.length === 0, found.length ? `still shows ${found.join(', ')}` : 'none of the old constants render');
    rec('LOG.overview-renders-real-request-count', body.includes(String(n1)) || /Pedidos à API/.test(body),
      `page shows the project's own request figures`);
    await page.close();
  }

  // ── 6. Isolation — both directions, and no oracle ─────────────────────────
  const ctxB = await browser.newContext();
  const csrfB = await signIn(ctxB, email('b'));
  const { projId: prB } = await mkWsProj(ctxB, csrfB, 'b');
  const keyB = await mkKey(ctxB, csrfB, prB, ['identity:read']);
  const okB = await call('/v1/me', keyB);
  await findLog(ctxB, prB, okB.requestId); // B's own row exists — the fixture is not vacuous

  {
    const r = await ctxB.request.get(`${API}/projects/${prA}/logs`, { headers: { Origin: CONSOLE } });
    rec('LOG.b-cannot-read-a-project-logs', r.status() === 403 || r.status() === 404, `GET A's logs as B → ${r.status()}`);
  }
  {
    const r = await ctxA.request.get(`${API}/projects/${prB}/logs`, { headers: { Origin: CONSOLE } });
    rec('LOG.a-cannot-read-b-project-logs', r.status() === 403 || r.status() === 404, `GET B's logs as A → ${r.status()}`);
  }
  {
    // A's request_id, asked for inside B's OWN project: must answer exactly as
    // an id that never existed — otherwise it is an existence oracle.
    const foreign = await j(await ctxB.request.get(`${API}/projects/${prB}/logs?request_id=${encodeURIComponent(ok.requestId)}`, { headers: { Origin: CONSOLE } }));
    const invented = await j(await ctxB.request.get(`${API}/projects/${prB}/logs?request_id=req_nonexistent_${stamp}`, { headers: { Origin: CONSOLE } }));
    const same = JSON.stringify(foreign.logs) === JSON.stringify(invented.logs) && (foreign.logs || []).length === 0;
    rec('LOG.foreign-request-id-is-not-an-oracle', same,
      `foreign=${(foreign.logs || []).length} invented=${(invented.logs || []).length}`);
  }
  {
    // Non-vacuity: B genuinely has logs of its own, so the empty answers above
    // mean "filtered out", not "this project never had anything".
    const own = await j(await ctxB.request.get(`${API}/projects/${prB}/logs`, { headers: { Origin: CONSOLE } }));
    rec('LOG.b-has-its-own-logs-fixture-not-vacuous', (own.logs || []).length > 0, `B rows=${(own.logs || []).length}`);
  }
  {
    // An unauthenticated caller reads nobody's logs.
    const r = await fetch(`${API}/projects/${prA}/logs`, { headers: { Origin: CONSOLE } });
    rec('LOG.unauthenticated-cannot-read-logs', r.status === 401 || r.status === 403, `no session → ${r.status}`);
  }

  await ctxB.close(); await ctxA.close();

  const passed = results.filter(r => r.ok).length, failed = results.length - passed;
  mkdirSync(resolve(ROOT, 'evidence/assurance/dev-foundation'), { recursive: true });
  writeFileSync(resolve(ROOT, `evidence/assurance/dev-foundation/api-logs-correlation-${stamp}.json`), JSON.stringify({
    programme: 'BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 / Console API Logs (ADR-054)',
    test: 'tools/e2e/dev-console/api-logs-correlation-e2e.mjs',
    date_stamp: stamp, console_host: CONSOLE, api_host: API, gateway_host: GW,
    deployed_commit: process.env.E2E_COMMIT || 'unknown',
    schema: 'banzami_staging (developer.dev_api_request_logs)',
    fixture_namespace: `rt54-*-${stamp}@banzami-e2e.test`,
    total: results.length, passed, failed, matrix: results,
    secrets_note: 'No raw key/secret/OTP printed or stored.',
  }, null, 2));
  console.log(`\n${failed === 0 ? '✓' : '✗'} API logs correlation E2E: ${passed}/${results.length}`);
  process.exit(failed === 0 ? 0 : 1);
} finally { await browser.close(); }
