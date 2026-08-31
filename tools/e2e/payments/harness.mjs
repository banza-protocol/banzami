/**
 * Stage E harness — shared setup for deployed-Sandbox payment E2E.
 *
 * Everything here is SETUP, never capability evidence. Provisioning a merchant
 * proves onboarding works; it says nothing about whether payments work. The
 * capability itself must still execute through the public perimeter.
 *
 * Safety is enforced before any financial call, not documented and hoped for:
 * the environment must self-report as sandbox AND the deployed build must match
 * the revision under assurance. A money-moving test against an unidentified build
 * produces evidence about software nobody can name — the exact failure Stage E
 * found already in production for seven weeks.
 */
import { randomUUID, randomInt } from 'node:crypto';

export const API = (process.env.BANZAMI_E2E_API_BASE || 'https://sandbox-api.banzami.com').replace(/\/$/, '');

/** Valid per the merchant_applications CHECK constraint. "COMPANY" is not one. */
export const BUSINESS_ACCOUNT_TYPE = 'MERCHANT';

/** Purposes core accepts. The gateway forwards this verbatim; an empty string is rejected. */
export const PURPOSE = 'GENERIC';

/** Nominal only — this harness never moves a large sum, even in sandbox. */
export const MAX_NOMINAL_MINOR = 500_000;

export function assertExplicitRun(flag) {
  if (flag !== 'RUN') throw new Error('Payment E2E is inert. Set BANZAMI_E2E=RUN to execute it deliberately.');
}

export function assertNominal(amountMinor) {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error(`amount must be a positive integer minor value; got ${amountMinor}`);
  if (amountMinor > MAX_NOMINAL_MINOR) throw new Error(`refusing a non-nominal amount ${amountMinor} > ${MAX_NOMINAL_MINOR}`);
}

export async function req(method, path, { token, body, idem, base } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idem) headers['Idempotency-Key'] = idem;
  const res = await fetch(`${(base || API)}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON is a valid observation */ }
  return { status: res.status, body: json, raw: text, headers: res.headers };
}

/**
 * The money-safety boundary. Refuses to proceed unless the deployed environment
 * says sandbox and the running build is the one under assurance.
 */
export async function assertSandboxAndBuild(expectedCommit) {
  const r = await req('GET', '/readyz');
  if (r.status !== 200) throw new Error(`readiness is ${r.status} — refusing to run financial E2E`);
  const env = r.body?.environment;
  if (env !== 'sandbox') throw new Error(`environment is "${env}" — refusing to run financial E2E anywhere but sandbox`);
  const build = r.body?.build;
  if (!build || build === 'unknown') throw new Error('deployed build is unidentifiable — evidence against it would be meaningless');
  if (expectedCommit && !(expectedCommit.startsWith(build) || build.startsWith(expectedCommit))) {
    throw new Error(`deployed build ${build} is not the revision under assurance (${expectedCommit})`);
  }
  return { environment: env, build };
}

/**
 * Provisions one isolated merchant through the real public flow. The PIN is
 * generated per run and never returned in evidence; the token is returned for
 * use but must never be logged or persisted.
 */
export async function provisionMerchant(runId, tag) {
  const stamp = `${Date.now()}${randomInt(1000, 9999)}`;
  const handle = `e2e${tag}${stamp}`.toLowerCase().slice(0, 30);
  const email = `${handle}@banzami-e2e.test`;
  const pin = String(randomInt(1000, 9999));

  const app = await req('POST', '/v1/merchant/applications', {
    body: {
      environment: 'SANDBOX', desired_handle: handle, business_name: `E2E ${tag} ${runId.slice(0, 8)}`,
      category: 'retail', subcategory: 'general', email, phone: '+244900000000',
      nif: '5417000000', country: 'AO', province: 'Luanda', municipality: 'Luanda', city: 'Luanda',
      address: 'E2E test address', address_reference: runId.slice(0, 8),
      legal_representative: 'E2E Harness', representative_role: 'Director',
      representative_email: email, representative_phone: '+244900000000',
      business_activity: 'automated assurance', estimated_volume: '0-100000',
      business_account_type: BUSINESS_ACCOUNT_TYPE, terms_accepted: true,
    },
  });
  if (app.status !== 201) throw new Error(`merchant application ${app.status}: ${app.raw.slice(0, 200)}`);
  const token = app.body.activation_token;

  const val = await req('POST', '/v1/merchant/activation/validate', { body: { token } });
  if (val.status !== 200) throw new Error(`activation validate ${val.status}`);
  const done = await req('POST', '/v1/merchant/activation/complete', { body: { token, pin } });
  if (done.status !== 200) throw new Error(`activation complete ${done.status}`);
  const auth = await req('POST', '/v1/merchant/auth/token', { body: { handle, pin } });
  if (auth.status !== 200) throw new Error(`merchant auth ${auth.status}`);

  const me = await req('GET', '/v1/business/me', { token: auth.body.token });
  if (me.status !== 200) throw new Error(`business/me ${me.status}`);

  return {
    handle,
    merchantId: me.body.id,
    walletId: me.body.wallet?.wallet_id,
    walletAccountId: me.body.wallet?.primary_account_id,
    environment: auth.body.environment,
    token: auth.body.token, // never persisted to evidence
  };
}

export const newRunId = () => randomUUID();
export const idemKey = (runId, label) => `${runId}:${label}`;
