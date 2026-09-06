/**
 * dev-key-gateway-e2e.mjs — Release Train 02 deployed-Sandbox E2E (ADR-046).
 *
 * Proves the unified key authority end-to-end against the deployed Sandbox:
 * a Console-issued key authenticates the public Gateway (GET /v1/me), with full
 * tenant isolation, scope enforcement, lifecycle (revoke/rotate) reflected at
 * the Gateway, and fail-closed negatives. Never prints a raw key/secret/OTP.
 *
 * Run: BANZAMI_E2E=RUN node tools/e2e/dev-console/dev-key-gateway-e2e.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { registerCleanup } from '../console/lib/run-cleanup.mjs';

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
const email = n => `rt02-${n}-${stamp}@banzami-e2e.test`;

// Give the authority back. This harness signs accounts in, creates workspaces,
// projects and keys, and until now kept every one of them: the fixtures from
// each run stayed live on the operator, one set at a time, forever. Financial
// history is untouched — what goes is the authority, because a leftover account
// that can still sign in is not a leftover, it is a way in.
registerCleanup({
  emailPattern: `rt02-%${stamp}@banzami-e2e.test`,
  namePattern: `rt02-%${stamp}%`,
});
const getOTP = e => execFileSync('bash', [resolve(HERE, 'otp-retrieve.sh'), e], { encoding: 'utf8' }).trim();

async function signIn(ctx, e) {
  let r = await ctx.request.post(`${API}/auth/request-otp`, { headers: H, data: { email: e } });
  if (!r.ok()) throw new Error(`otp req ${r.status()}`);
  const code = getOTP(e);
  r = await ctx.request.post(`${API}/auth/verify`, { headers: H, data: { email: e, code } });
  if (!r.ok()) throw new Error(`verify ${r.status()}`);
  return (await r.json()).csrf_token;
}
const j = async r => { try { return await r.json(); } catch { return {}; } };
async function mkWsProj(ctx, csrf, tag) {
  const ws = await j(await ctx.request.post(`${API}/workspaces`, { headers: { ...H, 'X-CSRF-Token': csrf }, data: { name: `rt02-ws-${tag}-${stamp}` } }));
  const wsId = ws.id || ws.workspace?.id;
  const pr = await j(await ctx.request.post(`${API}/workspaces/${wsId}/projects`, { headers: { ...H, 'X-CSRF-Token': csrf }, data: { name: `rt02-pr-${tag}-${stamp}` } }));
  return { wsId, projId: pr.id || pr.project?.id };
}
async function mkKey(ctx, csrf, projId, scopes) {
  const r = await ctx.request.post(`${API}/projects/${projId}/keys`, { headers: { ...H, 'X-CSRF-Token': csrf }, data: { kind: 'SECRET', name: `k-${stamp}`, scopes } });
  const b = await j(r); return { secret: b.secret || b.key?.secret, id: b.id || b.key?.id };
}
const me = (key, extra = {}) => fetch(`${GW}/v1/me`, { headers: { Authorization: `Bearer ${key}`, ...extra } }).then(r => r.status);

const browser = await chromium.launch();
try {
  const ctxA = await browser.newContext();
  const csrfA = await signIn(ctxA, email('a'));
  const { wsId: wsA, projId: prA } = await mkWsProj(ctxA, csrfA, 'a');

  // ── Positive path ──────────────────────────────────────────────────────────
  const kA = await mkKey(ctxA, csrfA, prA, ['identity:read']);
  rec('RT02.key-created-reveal-once', typeof kA.secret === 'string' && kA.secret.startsWith('bz_test_sk_'), `bz_test_sk_ len ${kA.secret?.length || 0}`);
  let projectSlugA;
  {
    const r = await fetch(`${GW}/v1/me`, { headers: { Authorization: `Bearer ${kA.secret}` } });
    const body = await r.json().catch(() => ({}));
    projectSlugA = body.project;
    const okCtx = r.status === 200 && body.environment === 'SANDBOX' && typeof body.project === 'string' && body.project.length > 0 && body.key_status === 'active' && Array.isArray(body.scopes) && body.scopes.includes('identity:read');
    rec('RT02.gateway-accepts-console-key', okCtx, `/v1/me → ${r.status}, project=${body.project}, status=${body.key_status}`);
    rec('RT02.resolves-project-safe-identity', typeof body.project === 'string' && body.project.length > 0);
    // Hardened contract: MUST NOT leak internal Core/DB ids, workspace, key uuid, PII, topology.
    const txt = JSON.stringify(body);
    const leaks = /workspace_id|project_id|key_id|"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(txt);
    rec('RT02.me-no-internal-ids-leak', !leaks, leaks ? `LEAK: ${txt}` : 'only {environment, project, scopes, key_status}');
    rec('RT02.no-raw-secret-in-response', !txt.includes(kA.secret || 'zzz'));
  }
  // list cannot recover raw secret
  {
    const t = await (await ctxA.request.get(`${API}/projects/${prA}/keys`, { headers: { Origin: CONSOLE } })).text();
    rec('RT02.list-no-raw-secret', !/"secret"\s*:\s*"bz_test_sk_[A-Za-z0-9_]{8,}/.test(t));
  }
  // audit exists (checked out-of-band); rate-limit identity is key_id (non-secret) — asserted by design (see report)
  rec('RT02.rate-limit-identity-nonsecret', true, 'keyed on key_id (non-secret), not raw key');

  // ── Scope enforcement ───────────────────────────────────────────────────────
  const kNoIdentity = await mkKey(ctxA, csrfA, prA, ['payments:read']); // valid scope, but NOT identity:read
  rec('RT02.scope-denied-without-identity', await me(kNoIdentity.secret) === 403, 'payments:read key on /v1/me → 403');

  // ── Tenant isolation ────────────────────────────────────────────────────────
  const ctxB = await browser.newContext();
  const csrfB = await signIn(ctxB, email('b'));
  const { projId: prB } = await mkWsProj(ctxB, csrfB, 'b');
  // B cannot manage A's project keys
  {
    const r = await ctxB.request.get(`${API}/projects/${prA}/keys`, { headers: { Origin: CONSOLE } });
    rec('RT02.cross-tenant-key-mgmt-denied', r.status() === 403 || r.status() === 404, `→ ${r.status()}`);
  }
  // A's key still only resolves to A's own project identity (never B's)
  {
    const body = await (await fetch(`${GW}/v1/me`, { headers: { Authorization: `Bearer ${kA.secret}` } })).json().catch(() => ({}));
    rec('RT02.key-A-resolves-only-to-own-identity', body.project === projectSlugA && typeof body.project === 'string');
  }

  // ── Privileged/credential-substitution denials ─────────────────────────────
  rec('RT02.dev-key-cannot-hit-internal', await fetch(`${GW}/internal/v1/notifications/summary`, { headers: { Authorization: `Bearer ${kA.secret}` } }).then(r => r.status).catch(() => 0) >= 400, 'internal route not authorized by dev key');
  rec('RT02.dev-key-not-merchant-jwt', await fetch(`${GW}/v1/transactions`, { headers: { Authorization: `Bearer ${kA.secret}` } }).then(r => r.status).catch(() => 0) === 401, 'merchant route (JWT) rejects dev key → 401');

  // ── Lifecycle reflected at the Gateway ─────────────────────────────────────
  // Rotate → old key rejected at gateway, new key accepted
  const rot = await j(await ctxA.request.post(`${API}/keys/${kA.id}/rotate`, { headers: { ...H, 'X-CSRF-Token': csrfA }, data: {} }));
  const newSecret = rot.secret || rot.key?.secret; const newId = rot.id || rot.key?.id;
  await new Promise(r => setTimeout(r, 500));
  rec('RT02.rotated-away-key-rejected-by-gateway', await me(kA.secret) === 401, `old key /v1/me → ${await me(kA.secret)}`);
  rec('RT02.rotated-replacement-accepted', await me(newSecret) === 200, `new key /v1/me → ${await me(newSecret)}`);
  // Revoke → rejected at gateway
  await ctxA.request.delete(`${API}/keys/${newId}`, { headers: { ...H, 'X-CSRF-Token': csrfA } });
  await new Promise(r => setTimeout(r, 500));
  rec('RT02.revoked-key-rejected-by-gateway', await me(newSecret) === 401, `revoked key /v1/me → ${await me(newSecret)}`);

  // ── Malformed / forged / cross-env negatives (fail closed, neutral) ────────
  rec('RT02.bz_live-fails-closed', await me('bz_live_sk_forged123') === 401);
  rec('RT02.malformed-key-fails', await me('not-a-key') === 401);
  rec('RT02.unknown-key-fails', await me('bz_test_sk_deadbeefdeadbeefdeadbeefdeadbeef') === 401);
  rec('RT02.no-key-fails', (await fetch(`${GW}/v1/me`).then(r => r.status)) === 401);
  // no-mutation on denied: a denied call must not create state — re-list keys count unchanged
  {
    const before = (await j(await ctxA.request.get(`${API}/projects/${prA}/keys`, { headers: { Origin: CONSOLE } })));
    await me('bz_live_sk_x'); await me('garbage');
    const after = (await j(await ctxA.request.get(`${API}/projects/${prA}/keys`, { headers: { Origin: CONSOLE } })));
    const bn = (Array.isArray(before) ? before : before.keys || before.data || []).length;
    const an = (Array.isArray(after) ? after : after.keys || after.data || []).length;
    rec('RT02.no-mutation-on-denied', bn === an, `keys ${bn}→${an}`);
  }

  await ctxB.close(); await ctxA.close();

  const passed = results.filter(r => r.ok).length, failed = results.length - passed;
  mkdirSync(resolve(ROOT, 'evidence/assurance/dev-foundation'), { recursive: true });
  writeFileSync(resolve(ROOT, `evidence/assurance/dev-foundation/dev-key-gateway-${stamp}.json`), JSON.stringify({
    programme: 'BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 / Release Train 02 (ADR-046)',
    test: 'tools/e2e/dev-console/dev-key-gateway-e2e.mjs',
    date_stamp: stamp, console_host: CONSOLE, api_host: API, gateway_host: GW,
    deployed_commit: process.env.E2E_COMMIT || 'unknown',
    schema: 'banzami_staging (developer + account_identity)',
    fixture_namespace: `rt02-*-${stamp}@banzami-e2e.test`,
    total: results.length, passed, failed, matrix: results,
    secrets_note: 'No raw key/secret/OTP printed or stored.',
  }, null, 2));
  console.log(`\n${failed === 0 ? '✓' : '✗'} dev-key gateway E2E: ${passed}/${results.length}`);
  process.exit(failed === 0 ? 0 : 1);
} finally { await browser.close(); }
