#!/usr/bin/env node
/**
 * check-sandbox-runtime.mjs — Sandbox RUNTIME assurance (Stage C).
 *
 * Why this exists, and why it is separate from `assure-inventory`:
 *
 *   ops/asset-inventory.yaml describes INTENDED state. It lists services as
 *   `active-required` and validates lifecycle values, secret hygiene and
 *   dispositions — all deterministic, all offline. It cannot tell you whether
 *   anything is actually running, and it passed for weeks while the Sandbox
 *   public surfaces answered 503. That is not a bug in the inventory gate: a
 *   static registry should stay static and deterministic.
 *
 *   So runtime truth gets its own layer. This checker proves the Sandbox is
 *   OPERATIONAL — reachable, healthy, and identifying itself as sandbox.
 *
 * What it deliberately does NOT do:
 *
 *   * It is not an E2E suite. A healthy runtime means the environment can be
 *     TESTED; it says nothing about whether a capability behaves correctly.
 *     Capability release still requires the e2e_sandbox test IDs and evidence
 *     artifacts the assurance manifest demands.
 *   * It performs no financial operation. Liveness is established with health
 *     and readiness reads only — never by moving money.
 *   * It never prints response bodies wholesale, headers, or anything that
 *     could carry a token; only the fields it asserts on.
 *
 * Fail-closed: unreachable, non-2xx, a 5xx, a timeout, or an environment that
 * does not identify as sandbox all FAIL. Silence is never success.
 *
 * Network dependency is explicit and intended: this gate cannot be satisfied
 * offline, which is the whole point of it.
 *
 * Target selection:
 *   BANZAMI_SANDBOX_API_BASE      (default https://sandbox-api.banzami.com)
 *   BANZAMI_SANDBOX_DEVAPI_BASE   (default https://developer-api.banzami.com)
 *   BANZAMI_SANDBOX_INSECURE_TLS=1  accept the origin certificate when probing
 *                                   the origin directly (the Cloudflare Origin
 *                                   CA is deliberately not publicly trusted)
 */

// A mistyped override must not silently fall back to the default target. It
// fails safe either way — the defaults are the public hostnames, which return
// 503 until the Cloudflare routing step exists, so a typo yields a FAIL rather
// than a false PASS. But a FAIL for the wrong reason is still a wrong answer:
// probing BANZAMI_SANDBOX_DEVELOPER_API_BASE (no such variable) reported the
// developer API as "not serving" while it was serving correctly. Reject unknown
// variables in this namespace instead of guessing what was meant.
const KNOWN_ENV = new Set([
  'BANZAMI_SANDBOX_API_BASE',
  'BANZAMI_SANDBOX_DEVAPI_BASE',
  'BANZAMI_SANDBOX_INSECURE_TLS',
  'BANZAMI_SANDBOX_TIMEOUT_MS',
]);
const unknownEnv = Object.keys(process.env)
  .filter((k) => k.startsWith('BANZAMI_SANDBOX_') && !KNOWN_ENV.has(k))
  .sort();
if (unknownEnv.length) {
  console.error(
    `\x1b[31m✗ unknown override(s): ${unknownEnv.join(', ')}\x1b[0m\n` +
      `  this gate would have silently probed its DEFAULT target instead.\n` +
      `  known: ${[...KNOWN_ENV].join(', ')}`,
  );
  process.exit(2);
}

const TIMEOUT_MS = Number(process.env.BANZAMI_SANDBOX_TIMEOUT_MS || 10000);
const API = (process.env.BANZAMI_SANDBOX_API_BASE || 'https://sandbox-api.banzami.com').replace(/\/$/, '');
const DEV = (process.env.BANZAMI_SANDBOX_DEVAPI_BASE || 'https://developer-api.banzami.com').replace(/\/$/, '');

if (process.env.BANZAMI_SANDBOX_INSECURE_TLS === '1') {
  // Origin-direct probing only: the origin presents a Cloudflare Origin CA
  // certificate, which is intentionally not in the public trust store.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const GREEN = '\x1b[32m', RED = '\x1b[31m', OFF = '\x1b[0m';
let failures = 0;
const pass = (m) => console.log(`  ${GREEN}✓${OFF} ${m}`);
const fail = (m) => { console.log(`  ${RED}✗ ${m}${OFF}`); failures++; };

async function get(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'manual' });
    const body = await res.text();
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: '', error: e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : e.message };
  } finally {
    clearTimeout(t);
  }
}

/**
 * A surface is healthy when it answers 2xx AND identifies as sandbox wherever it
 * exposes an environment field. An endpoint that answers 200 while reporting a
 * LIVE environment is a FAILURE, not a pass: that would mean this gate is
 * pointed at the wrong stack, which is exactly the mistake it must never make.
 */
async function checkSurface(label, base, path, opts = {}) {
  const requireSandboxEnv = opts.requireSandboxEnv === true;
  const r = await get(`${base}${path}`);

  if (r.status === 0) return fail(`${label}: unreachable (${r.error})`);
  if (r.status >= 500) return fail(`${label}: ${r.status} — surface not serving`);
  if (r.status < 200 || r.status > 299) return fail(`${label}: unexpected status ${r.status}`);

  let env = null;
  try {
    const j = JSON.parse(r.body);
    env = j.environment ?? j.env ?? null;
  } catch { /* plain-text health body is acceptable */ }

  if (env && !/^sandbox$/i.test(String(env)))
    return fail(`${label}: reports environment "${env}" — refusing to treat a non-sandbox stack as the Sandbox`);
  if (requireSandboxEnv && !env)
    return fail(`${label}: 200 but exposes no environment identity to verify`);

  pass(`${label}: ${r.status}${env ? ` (environment=${env})` : ''}`);
}

console.log(`Sandbox runtime assurance - timeout ${TIMEOUT_MS}ms`);
console.log(`  api: ${API}`);
console.log(`  dev: ${DEV}\n`);

await checkSurface('sandbox API health', API, '/health');
await checkSurface('sandbox API readiness', API, '/readyz', { requireSandboxEnv: true });
await checkSurface('sandbox consumer API', API, '/consumer/health');
await checkSurface('developer API health', DEV, '/health', { requireSandboxEnv: true });

console.log(failures
  ? `\n${RED}✗ Sandbox runtime check FAILED (${failures})${OFF} - the Sandbox is not operational; capability E2E cannot be run or trusted against it`
  : `\n${GREEN}✓ Sandbox runtime is operational${OFF} (reachable, healthy, sandbox-identified) - E2E may be executed against it`);
process.exit(failures ? 1 : 0);
