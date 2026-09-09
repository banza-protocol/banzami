/**
 * provision-doa-business.mjs — create the @doa Business account on the Sandbox.
 *
 * WHY THIS EXISTS
 *
 * DOA's Admin card reported "A chave resolve @e2edoa17885371237909198, mas o
 * DOA espera @doa". The key was not wrong: DOA's Developer project resolves its
 * payee through its ACTIVE binding (ADR-047), and that binding pointed at a
 * throwaway merchant an E2E run had created. There was no @doa merchant on the
 * Sandbox at all — it did not survive the financial reset and was never
 * recreated, so DOA's donations were settling into a fixture, and DOA's own fee
 * destination (@doa) could not resolve either.
 *
 * This provisions the real account through the SAME public onboarding flow a
 * merchant uses — application → activation → auth — rather than by writing rows.
 * Sandbox auto-approves KYB; nothing here is a shortcut around that gate.
 *
 * The category is DESCRIPTIVE and nothing else. This comment used to say the
 * taxonomy mattered because `donation` mapped to a pricing category, which then
 * chose a rate — that mapping is gone, and it was the defect: what an account is
 * charged comes from a pricing profile an operator assigns it, never from how
 * the account describes itself. Assign the profile explicitly after this runs.
 *
 * Prints the ids needed to bind, and the PIN it generated (Sandbox only —
 * without it the account cannot be signed into again).
 *
 * Usage: node tools/ops/provision-doa-business.mjs [--handle doa] [--dry-run]
 */
const API = (process.env.BANZAMI_E2E_API_BASE || 'https://sandbox-api.banzami.com').replace(/\/$/, '');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const HANDLE = arg('handle', 'doa').replace(/^@+/, '').toLowerCase();
const DRY = process.argv.includes('--dry-run');

async function req(method, path, body, token) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await r.text();
  let parsed; try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  return { status: r.status, body: parsed, raw };
}

const pin = String(Math.floor(1000 + Math.random() * 9000));

const application = {
  environment: 'SANDBOX',
  desired_handle: HANDLE,
  business_name: 'Doa',
  // Doações e causas. Descriptive only — it selects no rate.
  category: 'donation',
  subcategory: 'Crowdfunding comunitário',
  email: 'contact@doadoa.app',
  phone: '+244900000000',
  nif: '5417000000',
  country: 'AO', province: 'Luanda', municipality: 'Luanda', city: 'Luanda',
  address: 'Luanda, Angola', address_reference: 'doa',
  legal_representative: 'Doa', representative_role: 'Director',
  representative_email: 'contact@doadoa.app', representative_phone: '+244900000000',
  business_activity: 'Plataforma de vaquinhas e doações',
  estimated_volume: '0-100000',
  business_account_type: 'MERCHANT',
  terms_accepted: true,
};

if (DRY) {
  console.log(JSON.stringify({ dry_run: true, api: API, handle: HANDLE, application: { ...application, email: '<redacted>' } }, null, 2));
  process.exit(0);
}

const app = await req('POST', '/v1/merchant/applications', application);
if (app.status !== 201) {
  console.error(`application ${app.status}: ${app.raw.slice(0, 300)}`);
  process.exit(1);
}
const token = app.body.activation_token;

const val = await req('POST', '/v1/merchant/activation/validate', { token });
if (val.status !== 200) { console.error(`activation validate ${val.status}: ${val.raw.slice(0, 200)}`); process.exit(1); }
const done = await req('POST', '/v1/merchant/activation/complete', { token, pin });
if (done.status !== 200) { console.error(`activation complete ${done.status}: ${done.raw.slice(0, 200)}`); process.exit(1); }

const auth = await req('POST', '/v1/merchant/auth/token', { handle: HANDLE, pin });
if (auth.status !== 200) { console.error(`auth ${auth.status}: ${auth.raw.slice(0, 200)}`); process.exit(1); }

const me = await req('GET', '/v1/integration', null, auth.body.token);
if (me.status !== 200) { console.error(`business/me ${me.status}: ${me.raw.slice(0, 200)}`); process.exit(1); }

console.log(JSON.stringify({
  handle: HANDLE,
  merchant_id: me.body.id,
  wallet_id: me.body.wallet?.wallet_id,
  primary_account_id: me.body.wallet?.primary_account_id,
  kyb_status: me.body.kyb_status ?? me.body.kyb?.status ?? null,
  category: me.body.category ?? null,
  pricing: me.body.pricing ?? null,
  environment: auth.body.environment,
  pin,
  next: 'bind the DOA Sandbox project to merchant_id / wallet_id / primary_account_id',
}, null, 2));
