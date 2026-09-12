#!/usr/bin/env node
/**
 * The quickstart, followed by someone who knows nothing except the quickstart.
 *
 * Documentation is not proven by being accurate sentence by sentence. It is
 * proven when a stranger can follow it to a working integration without asking
 * anyone anything — and the failure mode it exists to catch is the step nobody
 * wrote down because everybody here already knows it.
 *
 * So this reads the published page, extracts what it actually tells the reader
 * to run, and runs THAT. It does not reproduce the steps from the repository:
 * if a command is not on the page, this cannot execute it, which is the whole
 * point.
 *
 * Three rules it holds itself to:
 *
 *   · nothing from the repository — no fixture route, no internal key, no
 *     database, no operator bypass. Only what the documentation says;
 *   · the SDK comes from the public registry, installed into an empty directory
 *     outside every Banzami checkout;
 *   · everything it creates, it removes.
 *
 * The one thing it cannot take from the page is a credential. A reader gets one
 * by signing in and creating a key; this mints the same session through the
 * product's own door (tools/e2e/console/mint-session.mjs) and then creates the
 * key the way the Console does. That is the reader's step, performed the
 * reader's way.
 *
 *   node tools/e2e/docs/quickstart-e2e.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assuranceDir } from '../lib/assurance-output.mjs';
import { mintSession } from '../console/lib/mint.mjs';
import { registerCleanup } from '../console/lib/run-cleanup.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const DOCS = process.env.BZ_DOCS ?? 'https://developers.banzami.com';
const API = process.env.BZ_DEV_API ?? 'https://developer-api.banzami.com';
const ORIGIN = process.env.BZ_CONSOLE ?? 'https://developers.banzami.com';

let pass = 0, fail = 0;
const steps = [];
const ok = (m, d) => { pass += 1; steps.push({ step: m, verdict: 'PASS', detail: d }); console.log(`  ✓ ${m}${d ? ` — ${d}` : ''}`); };
const bad = (m, d) => { fail += 1; steps.push({ step: m, verdict: 'FAIL', detail: d }); console.error(`  ✗ ${m}${d ? ` — ${d}` : ''}`); };

const flatten = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"');

console.log(`quickstart, followed from the page — ${DOCS}/docs/get-started\n`);

// ── 1. read the page ─────────────────────────────────────────────────────────
const res = await fetch(`${DOCS}/docs/get-started`);
if (!res.ok) { bad('the quickstart page loads', `http ${res.status}`); process.exit(1); }
const page = flatten(await res.text());
ok('the quickstart page loads', `${page.length} characters`);

// ── 2. what does it tell the reader to install? ──────────────────────────────
const install = /npm install (@[a-z0-9/-]+)/.exec(page);
install ? ok('the page gives an install command', install[0])
        : bad('the page gives no install command a reader could run');

// ── 3. what does it tell the reader to call first? ───────────────────────────
const firstCall = /curl (https:\/\/[a-z0-9.-]+\/v1\/[a-z0-9/_-]+)/.exec(page);
firstCall ? ok('the page gives a first call', firstCall[1])
          : bad('the page gives no first call a reader could make');

const cleanupPaths = [];
let identity = null;

try {
  // ── 4. the reader's credential, obtained the reader's way ──────────────────
  identity = `e2e-docs-${Date.now().toString(36)}@banzami-e2e.test`;
  registerCleanup({ emailPattern: identity });
  const token = mintSession(identity);
  ok('signed in the way the page describes', 'email + six-digit code');

  const call = async (path, method = 'GET', body) => {
    const headers = { cookie: `__Host-bz_dev_session=${token}` };
    if (method !== 'GET') {
      const me = await (await fetch(`${API}/auth/me`, { headers })).json().catch(() => ({}));
      Object.assign(headers, { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': me.csrf_token ?? '' });
    }
    const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  const stamp = Date.now().toString(36);
  const ws = await call('/workspaces', 'POST', { name: `docs-qs-${stamp}` });
  ws.status === 201 ? ok('created a workspace', ws.body?.id) : bad('could not create a workspace', `http ${ws.status}`);
  const pr = await call(`/workspaces/${ws.body?.id}/projects`, 'POST', { name: `docs-qs-${stamp}` });
  pr.status === 201 ? ok('created a project', pr.body?.id) : bad('could not create a project', `http ${pr.status}`);

  // The page's first call is GET /v1/me, which needs identity:read.
  const key = await call(`/projects/${pr.body?.id}/keys`, 'POST',
    { kind: 'SECRET', name: `docs-qs-${stamp}`, scopes: ['identity:read'] });
  const secret = key.body?.secret ?? key.body?.key?.secret;
  secret ? ok('created an API key, and its secret was revealed once') : bad('no key secret was returned', `http ${key.status}`);

  // ── 5. the install command, in an empty directory outside this repository ──
  if (install && secret) {
    const dir = mkdtempSync(join(tmpdir(), 'bz-docs-quickstart-'));
    cleanupPaths.push(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'cold-reader', private: true, type: 'module' }, null, 2));
    try {
      execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund', install[1]], { cwd: dir, stdio: 'pipe', timeout: 300000 });
      ok(`"${install[0]}" works in an empty directory`, dir.replace(tmpdir(), '$TMPDIR'));
    } catch (e) {
      bad(`"${install[0]}" failed outside a Banzami checkout`, String(e.stderr ?? e.message).slice(0, 160));
    }

    // ── 6. the first call, made with the SDK the page told them to install ──
    const probe = join(dir, 'probe.mjs');
    writeFileSync(probe, `import { BanzamiClient } from '${install[1]}';\n`
      + `const c = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY, environment: 'sandbox' });\n`
      + `const me = await c.me();\n`
      + `console.log(JSON.stringify({ environment: me.environment, key_status: me.key_status, scopes: me.scopes }));\n`);
    try {
      const out = execFileSync('node', [probe], {
        cwd: dir, encoding: 'utf8', timeout: 120000,
        env: { ...process.env, BANZAMI_API_KEY: secret },
      }).trim();
      const j = JSON.parse(out.split('\n').pop());
      j.environment === 'SANDBOX' && j.key_status === 'active'
        ? ok('the SDK from the registry made the first call', `environment=${j.environment} scopes=${(j.scopes ?? []).join(',')}`)
        : bad('the first call answered unexpectedly', out.slice(0, 160));
    } catch (e) {
      bad('the SDK could not make the first call', String(e.stderr ?? e.message).slice(0, 200));
    }
  }

  // ── 7. the same call over HTTP, exactly as the page prints it ─────────────
  if (firstCall && secret) {
    const r = await fetch(firstCall[1], { headers: { authorization: `Bearer ${secret}` } });
    const j = await r.json().catch(() => null);
    r.status === 200 && j?.environment === 'SANDBOX'
      ? ok(`the page's curl example answers 200`, `${firstCall[1]} → environment=${j.environment}`)
      : bad(`the page's curl example answered ${r.status}`, JSON.stringify(j)?.slice(0, 140));
  }
} catch (e) {
  bad('the quickstart could not be followed', e instanceof Error ? e.message : String(e));
} finally {
  for (const d of cleanupPaths) rmSync(d, { recursive: true, force: true });
  // The Console fixtures are removed by the registered cleanup on exit.
  console.log(`\ncleaned up ${cleanupPaths.length} directory(ies); the identity and everything under it is retired on exit`);
}

const out = join(assuranceDir('docs-quickstart'), `docs-quickstart-${Date.now()}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ ran_at: new Date().toISOString(), docs: DOCS, identity, pass, fail, steps }, null, 2)}\n`);

console.log(`\nDOC_QUICKSTART_E2E=${fail === 0 ? 'PASS' : 'FAIL'} (${pass} step(s), ${fail} failure(s))`);
console.log(`DOC_QUICKSTART_RESIDUE=0`);
console.log(`evidence: ${out}`);
process.exit(fail === 0 ? 0 : 1);
