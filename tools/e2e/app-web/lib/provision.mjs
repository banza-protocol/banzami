/**
 * Developer provisioning — a thin orchestration layer over the EXISTING shared
 * cleanroom primitive (console-client.mjs: the documented request-otp → code →
 * verify sign-in and authenticated Console calls). It does NOT reimplement auth
 * or duplicate the public-sandbox-cleanroom; it composes those primitives to
 * stand up exactly what the App-Web deep-link flow needs: a generic developer,
 * a workspace, a project with Sandbox Financial Setup, a project key, an
 * optional webhook endpoint, and payment links whose payer slug drives
 * app.banzami.com/pay/{slug}.
 *
 * No DOA, no founder project, no pre-existing resource (item 17).
 */
import { signIn, api as consoleApi } from '../../cleanroom/console-client.mjs';
import { ownCreated } from './e2e-own.mjs';

export const GW = process.env.BZ_SANDBOX_GW ?? 'https://sandbox-api.banzami.com';

/**
 * Routes that BRING A RESOURCE INTO EXISTENCE, and what kind it is.
 *
 * Ownership is registered here, in the shared client, rather than at each call
 * site. There is no single `createTestPayer()` helper to instrument: nine
 * files POST /v1/sandbox/test-payers directly, and S23-RAIL-001 was one of
 * them — it declared its project and its consumer while 1 200 000 sat in a
 * test payer nothing had handed over.
 *
 * Adding `ownCreated` to proof 23 alone would have fixed that one journey and
 * left the shape of the defect untouched, which is the same bet that has now
 * lost twice. The client that performs the creation is the narrowest place
 * that sees EVERY creation, so it is where the registration belongs.
 *
 * Keyed on method + path, never on a response field that happens to be named
 * `id`: a GET returning an id creates nothing.
 */
export const GATEWAY_CREATES = [
  [/^\/v1\/sandbox\/test-payers$/, 'test_payer'],
  [/^\/v1\/payment-links$/, 'payment_link'],
  [/^\/v1\/payment-sessions$/, 'payment_session'],
  [/^\/v1\/wallet-accounts$/, 'wallet_account'],
  [/^\/v1\/webhooks(\/endpoints)?$/, 'webhook_endpoint'],
];

/** Authenticated gateway HTTP with a project secret key. */
export function gatewayHttp(secret) {
  return async (path, method = 'GET', body, extra = {}) => {
    const headers = { authorization: `Bearer ${secret}`, ...extra };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(GW + path, {
      method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let j = null; try { j = await r.json(); } catch { /* empty */ }
    if (method === 'POST' && (r.status === 200 || r.status === 201) && j?.id) {
      const [, kind] = GATEWAY_CREATES.find(([re]) => re.test(path.split('?')[0])) ?? [];
      if (kind) ownCreated(kind, j.id, { creation_source: `gateway ${method} ${path.split('?')[0]}` });
    }
    return { status: r.status, body: j, headers: r.headers };
  };
}

const SCOPES = [
  'identity:read', 'payment_sessions:write', 'payment_sessions:read',
  'payment_links:write', 'payment_links:read',
  'webhooks:write', 'webhooks:read', 'refunds:write', 'refunds:read',
  'sandbox:read', 'sandbox:write',
];

/**
 * Stand up a fresh generic developer tenant.
 * @returns { sess, call, ws, wsName, project, projectName, secret, keyId, gw, stamp }
 */
export async function provisionMerchant({ prefix = 'appweb' } = {}) {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const like = `${prefix}-${stamp}`;
  const sess = await signIn(`e2e-appweb-${stamp}@banzami-e2e.test`);
  const call = (method, path, body) => consoleApi(sess, method, path, body);

  const w = await call('POST', '/workspaces', { name: like });
  const ws = w.body?.id;
  if (w.status !== 201 || !ws) throw new Error(`workspace create ${w.status}`);
  const wsName = w.body?.name ?? like;

  const projectName = `${like}-shop`;
  const p = await call('POST', `/workspaces/${ws}/projects`, { name: projectName });
  const project = p.body?.id;
  if (p.status !== 201 || !project) throw new Error(`project create ${p.status}`);

  // Owned at the moment it becomes fundable, before financial-setup can fail:
  // a project that exists but never reached READY is still a resource this run
  // created, and cleanup must know about it.
  // A DEVELOPER PROJECT, not a merchant. Verified against the schema rather
  // than named by intuition: a project id matches
  // developer.dev_project_sandbox_binding.project_id and matches
  // wallets.merchant_id zero times. Registering it as `merchant` would have
  // resolved to no account at all, and the journey would have read as owning
  // nothing — the same silence B2 just removed, reintroduced one layer up.
  ownCreated('fixture_project', project, { creation_source: 'provisionMerchant', workspace: ws, name: projectName });
  ownCreated('fixture_workspace', ws, { creation_source: 'provisionMerchant', name: wsName });

  const setup = await call('POST', `/projects/${project}/financial-setup`, { use_case: 'STANDARD' });
  if (setup.status !== 200 || !['READY', 'SEALED'].includes(setup.body?.state)) {
    throw new Error(`financial-setup ${setup.status} ${setup.body?.state}`);
  }

  const k = await call('POST', `/projects/${project}/keys`, { kind: 'SECRET', name: like, scopes: SCOPES });
  const secret = k.body?.secret;
  const keyId = k.body?.id;
  if (k.status !== 201 || !secret) throw new Error(`key create ${k.status}`);

  return { sess, call, ws, wsName, project, projectName, secret, keyId, gw: gatewayHttp(secret), stamp };
}

/** Create a payment link and derive its payer slug + surfaces. */
export async function createPaymentLink(gw, { amountMinor, currency = 'AOA', description }) {
  const r = await gw('/v1/payment-links', 'POST', { amount_minor: amountMinor, currency, description });
  if (r.status !== 201) throw new Error(`payment-link create ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  const id = r.body?.id ?? r.body?.link_id;
  const iface = (r.body?.interfaces ?? []).find((i) => i.type === 'PAYMENT_LINK')?.value;
  let slug = r.body?.slug;
  if (!slug && iface) {
    const segs = new URL(iface).pathname.split('/').filter(Boolean);
    slug = segs[0] === 'pay' ? segs[1] : segs[segs.length - 1];
  }
  if (!slug) throw new Error(`no slug in payment-link response: ${JSON.stringify(r.body).slice(0, 200)}`);
  return {
    id, slug,
    hostedUrl: iface ?? `https://pay.banzami.com/pay/${slug}`,
    appWebUrl: `https://app.banzami.com/pay/${slug}`,
  };
}

/** Register a webhook endpoint (returns { id, secret } from the gateway). */
export async function registerWebhook(gw, url, events) {
  const r = await gw('/v1/webhooks/endpoints', 'POST', { url, events });
  if (r.status !== 201) throw new Error(`webhook register ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  return { id: r.body?.id, secret: r.body?.secret };
}
