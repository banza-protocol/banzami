#!/usr/bin/env node
/**
 * The Payment Link list contract the documentation publishes, asked of the
 * deployed Sandbox with a project key.
 *
 * /docs/reference (ref-pl-list) and /docs/testing (cursor-invalido) say:
 *   · limit is 1–100, default 20; anything else → 400 INVALID_PARAM;
 *   · cursor is a previous page's next_cursor, unchanged; anything else → 400 INVALID_PARAM;
 *   · a real next_cursor returns the following page.
 *
 * It borrows a READY documentation fixture project (the DOA tutorial state),
 * mints a short-lived key with only the payment-link scopes through the Console,
 * creates two links so there is a second page to reach, and cancels the links
 * and revokes the key afterwards. No secret is printed or written.
 *
 *   node tools/e2e/docs/payment-links-live.mjs [--state <json>]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';

const API = process.env.BZ_DEV_API ?? 'https://developer-api.banzami.com';
const GW = process.env.BZ_GATEWAY ?? 'https://sandbox-api.banzami.com';
const ORIGIN = 'https://developers.banzami.com';
const i = process.argv.indexOf('--state');
const state = JSON.parse(readFileSync(i > -1 ? process.argv[i + 1] : join(tmpdir(), 'banzami-docs-doa-tutorial.json'), 'utf8'));

const cookie = { cookie: `__Host-bz_dev_session=${state.token}` };
async function consoleCall(path, method = 'GET', body) {
  const headers = { ...cookie };
  if (method !== 'GET') {
    const me = await (await fetch(`${API}/auth/me`, { headers: cookie })).json().catch(() => ({}));
    Object.assign(headers, { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': me.csrf_token ?? '' });
  }
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const rows = [];
const check = (name, ok, detail) => { rows.push({ name, ok: Boolean(ok), detail }); console.log(`  ${ok ? '✓' : '✗'} ${name} — ${detail}`); };

console.log(`payment links — live list contract · project ${state.created.project}\n`);
const fs = await consoleCall(`/projects/${state.created.project}/financial-setup`);
if (!['READY', 'SEALED'].includes(fs.body?.state)) { console.error(`project not ready: ${fs.body?.state ?? fs.status}`); process.exit(2); }

const key = await consoleCall(`/projects/${state.created.project}/keys`, 'POST', { kind: 'SECRET', name: `docs-pl-live-${Date.now().toString(36)}`, scopes: ['payment_links:write', 'payment_links:read'] });
const secret = key.body?.secret ?? key.body?.key?.secret;
const keyId = key.body?.key?.id ?? key.body?.id;
if (!secret) { console.error(`could not create the key: http ${key.status}`); process.exit(2); }

const gw = async (path, method = 'GET', body, extra = {}) => {
  const r = await fetch(GW + path, { method, headers: { authorization: `Bearer ${secret}`, ...(body ? { 'content-type': 'application/json' } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const links = [];
try {
  for (let n = 0; n < 2; n += 1) {
    const c = await gw('/v1/payment-links', 'POST', { amount_minor: 1000 + n, currency: 'AOA', description: `docs list contract ${n}` }, { 'Idempotency-Key': `idem_docs_pl_${Date.now()}_${n}` });
    if (c.body?.id) links.push(c.body.id);
    check(`create link ${n + 1} with a project key (payee from Financial Setup)`, c.status === 201 || c.status === 200, `http ${c.status}${c.body?.code ? ` ${c.body.code}` : ''}`);
  }

  const page1 = await gw('/v1/payment-links?limit=1');
  check('limit=1 → 200, one row, a next_cursor', page1.status === 200 && (page1.body?.data ?? page1.body?.payment_links ?? []).length === 1 && Boolean(page1.body?.next_cursor), `http ${page1.status}, next_cursor ${page1.body?.next_cursor ? 'present' : 'absent'}`);
  if (page1.body?.next_cursor) {
    const page2 = await gw(`/v1/payment-links?limit=1&cursor=${encodeURIComponent(page1.body.next_cursor)}`);
    const a = (page1.body?.data ?? page1.body?.payment_links ?? [])[0]?.id;
    const b = (page2.body?.data ?? page2.body?.payment_links ?? [])[0]?.id;
    check('the next_cursor, unchanged → 200, the following page', page2.status === 200 && b && b !== a, `http ${page2.status}`);
  }
  for (const [q, label] of [['cursor=abc', 'cursor that is not a next_cursor'], ['limit=500', 'limit above 100'], ['limit=0', 'limit below 1'], ['limit=abc', 'limit that is not a number']]) {
    const r = await gw(`/v1/payment-links?${q}`);
    check(`${label} (${q}) → 400 INVALID_PARAM`, r.status === 400 && r.body?.code === 'INVALID_PARAM' && Boolean(r.body?.request_id), `http ${r.status} ${r.body?.code ?? ''} · request_id ${r.body?.request_id ? 'present' : 'absent'}`);
  }
} finally {
  // Every link this contract check ever created on the project, including any a
  // previous run left ACTIVE, is cancelled (DELETE, as ref-pl-cancel documents).
  const all = await gw('/v1/payment-links?limit=100');
  const mine = new Set([...links, ...(all.body?.data ?? all.body?.payment_links ?? []).filter((l) => /^docs list contract/.test(l.description ?? '') && l.status === 'ACTIVE').map((l) => l.id)]);
  for (const id of mine) {
    const c = await gw(`/v1/payment-links/${id}`, 'DELETE', undefined, { 'Idempotency-Key': `idem_docs_pl_cancel_${id}` });
    console.log(`  cleanup — cancel link ${id.slice(0, 8)}: ${c.status}`);
  }
  const left = (await gw('/v1/payment-links?limit=100')).body;
  const active = (left?.data ?? left?.payment_links ?? []).filter((l) => /^docs list contract/.test(l.description ?? '') && l.status === 'ACTIVE').length;
  check('no contract-check link left ACTIVE', active === 0, `${active} active`);
  console.log(`  cleanup — revoke key: ${(await consoleCall(`/keys/${keyId}`, 'DELETE')).status}`);
}

const out = join(assuranceDir('docs-payment-links-live'), `payment-links-live-${Date.now()}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ ran_at: new Date().toISOString(), gateway: GW, project: state.created.project, rows }, null, 2)}\n`);
const failed = rows.filter((r) => !r.ok).length;
console.log(`\nDOCS_PAYMENT_LINK_LIST_CONTRACT_LIVE=${failed ? 'FAIL' : 'PASS'} (${rows.length - failed}/${rows.length})\nevidence: ${out}`);
process.exit(failed ? 1 : 0);
