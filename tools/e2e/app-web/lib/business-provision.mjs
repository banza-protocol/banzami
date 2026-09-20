/**
 * Provision a generic synthetic Sandbox Business that can sign in with @handle +
 * PIN — the canonical onboarding path, no DB writes, no founder/DOA, no backdoor
 * (APP-BANZAMI-WEB-BUSINESS-001 §88/§124):
 *
 *   submit application (public)
 *     → upload the 2 required KYB docs (presigned R2 → PUT → confirm)
 *       → approve (internal key) → activation_token
 *         → activation/complete {token, pin}  (sets the PIN)
 *           → auth/token {handle, pin} now succeeds.
 *
 * The public onboarding steps (submit, upload-url, R2 PUT, confirm,
 * activation/complete) run against the REAL public Sandbox API edge
 * (`sandbox-api.banzami.com`) from this machine — the exact path a real applicant
 * uses. Only the internal approve runs on the VM via `docker exec` (it needs the
 * gateway's own INTERNAL_API_KEY from /proc/1/environ, which never leaves the VM).
 *
 * Why the public edge and not localhost-inside-the-container: the
 * `application-submit` limiter is a 30/24h sliding window keyed on the caller's
 * masked IP. Submitting from inside the gateway keys every synthetic Business to
 * the one localhost bucket, so a heavy acceptance day exhausts it for everyone.
 * The public edge keys to this machine's own IP bucket, so the acceptance suite is
 * rate-limit-safe (APP_WEB_ACCEPTANCE_RATE_LIMIT_SAFE) and a genuine RATE_LIMITED
 * is surfaced truthfully (thrown as { rateLimited:true }) instead of faked.
 * Override the edge with BZ_PROVISION_API when driving a different Sandbox stack.
 */
import { execFileSync } from 'node:child_process';
import { ownCreated } from './e2e-own.mjs';

const VM = process.env.BZ_VM ?? 'root@217.160.9.248';
const API = (process.env.BZ_PROVISION_API ?? 'https://sandbox-api.banzami.com').replace(/\/+$/, '');
const sshOut = (cmd) => execFileSync('ssh', ['-o', 'ConnectTimeout=30', VM, cmd], { encoding: 'utf8', maxBuffer: 8 << 20 });

const RATE_RE = /RATE_LIMITED|too many requests|slow down/i;
const rateLimitError = (where) => Object.assign(new Error(`business provisioning rate-limited at ${where} (application-submit 30/24h per IP)`), { rateLimited: true });

async function api(method, path, { json, body, contentType } = {}) {
  const headers = {};
  let payload;
  if (json !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(json); }
  else if (body !== undefined) { if (contentType) headers['content-type'] = contentType; payload = body; }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON (e.g. R2) */ }
  return { status: res.status, data, text };
}

/**
 * @returns {Promise<{handle:string, pin:string, merchantId:string, applicationId:string}>}
 */
/** Merchant ids supplied by the operator, which this process must never retire. */
const REUSED = new Map();

export async function provisionBusiness({ handlePrefix = 'e2ebiz', pin = '481516' } = {}) {
  // Reuse a supplied generic Sandbox Business (skips the rate-limited application
  // submit, 30/24h per IP). Set BZ_BIZ_HANDLE (+ BZ_BIZ_PIN, BZ_BIZ_MERCHANT_ID)
  // to sign in against an existing fixture. A reused Business is NOT retired by the
  // proof (it persists for the next run).
  const reuse = process.env.BZ_BIZ_HANDLE;
  if (reuse && reuse.trim()) {
    const fixture = {
      handle: reuse.trim().replace(/^@/, '').toLowerCase(),
      pin: process.env.BZ_BIZ_PIN ?? pin,
      merchantId: process.env.BZ_BIZ_MERCHANT_ID ?? '',
      applicationId: null,
      reused: true,
    };
    if (fixture.merchantId) REUSED.set(fixture.merchantId, fixture.handle);
    return fixture;
  }
  const handle = `${handlePrefix}${Date.now().toString(36)}`.toLowerCase().slice(0, 28);
  const email = `${handle}@synthetic.test`;

  // 1. Submit application — the REAL public edge (this machine's IP bucket).
  const submit = await api('POST', '/v1/merchant/applications', { json: {
    desired_handle: handle, business_name: `E2E ${handle}`, category: 'retail',
    email, phone: '+244900000000', nif: '5417000000', country: 'AO',
    province: 'Luanda', municipality: 'Luanda', city: 'Luanda', address: 'Luanda, Angola',
    legal_representative: 'E2E Rep', representative_role: 'Director',
    representative_email: email, representative_phone: '+244900000000',
    business_activity: 'Testing', estimated_volume: '0-100000', terms_accepted: true,
  } });
  if (submit.status === 429 || RATE_RE.test(submit.text || '')) throw rateLimitError('submit');
  const applicationId = submit.data?.application_id;
  if (!applicationId) throw new Error(`business submit failed: HTTP ${submit.status} ${(submit.text || '').slice(0, 160)}`);

  // 2. Upload the two required KYB documents (presigned R2 → PUT → confirm), public edge.
  const pdf = Buffer.from('%PDF-1.4\n%minimal synthetic KYB doc\n', 'utf8');
  for (const document_type of ['BUSINESS_REGISTRATION', 'REPRESENTATIVE_ID']) {
    const up = await api('POST', `/v1/merchant/applications/${applicationId}/documents/upload-url`,
      { json: { document_type, filename: 'doc.pdf', mime_type: 'application/pdf', size_bytes: pdf.byteLength } });
    if (up.status === 429 || RATE_RE.test(up.text || '')) throw rateLimitError('upload-url');
    const documentId = up.data?.document_id, uploadUrl = up.data?.upload_url;
    if (!uploadUrl || !documentId) throw new Error(`upload-url failed (${document_type}): HTTP ${up.status} ${(up.text || '').slice(0, 160)}`);
    // The presigned R2 URL is absolute — PUT the bytes to it directly.
    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: pdf });
    if (!putRes.ok) throw new Error(`R2 PUT failed (${document_type}): HTTP ${putRes.status}`);
    const conf = await api('POST', `/v1/merchant/applications/${applicationId}/documents/${documentId}/confirm`, { json: {} });
    if (conf.status >= 400) throw new Error(`confirm failed (${document_type}): HTTP ${conf.status}`);
  }

  // 3. Approve (internal) — on the VM only; the INTERNAL_API_KEY never leaves it.
  const approveOut = sshOut(`
set -uo pipefail
GW=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-api-gateway-staging')
IK=$(docker exec "$GW" sh -c "tr '\\0' '\\n' < /proc/1/environ | sed -n 's/^INTERNAL_API_KEY=//p'")
jval(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write((JSON.parse(s)["'$1'"]||"")+"")}catch{process.stdout.write("")}})'; }
AP=$(printf '{"reviewed_by":"app-web-business-e2e"}' \\
  | docker exec -i "$GW" curl -s -X POST "http://localhost:8080/internal/v1/merchant-applications/${applicationId}/approve" -H "X-Internal-Key: $IK" -H 'Content-Type: application/json' --data @-)
TOKEN=$(printf '%s' "$AP" | jval activation_token)
MID=$(printf '%s' "$AP" | jval merchant_id)
[ -z "$TOKEN" ] && { echo "ERR|approve_failed:$AP"; exit 0; }
echo "OK|$TOKEN|$MID"
`).trim().split('\n').pop();
  if (!approveOut.startsWith('OK|')) throw new Error(`business approve failed: ${approveOut}`);
  const [, activationToken, merchantId] = approveOut.split('|');

  // 4. Set the PIN via activation/complete — public edge.
  const done = await api('POST', '/v1/merchant/activation/complete', { json: { token: activationToken, pin } });
  if (done.status >= 400) throw new Error(`activation/complete failed: HTTP ${done.status} ${(done.text || '').slice(0, 160)}`);

  // A REUSED Business (BZ_BIZ_HANDLE) is deliberately NOT owned above: it
  // outlives the run and retiring it would destroy a shared fixture. This one
  // the run created, so it belongs to the run.
  ownCreated('business', merchantId, { creation_source: 'provisionBusiness', handle, applicationId });
  return { handle, pin, merchantId, applicationId };
}

// Retire a synthetic Business (best-effort, canonical lifecycle) — suspend so its
// receive point/QR fail closed, without deleting any financial history.
/**
 * Retire a Business this run created.
 *
 * REFUSES a reused fixture, structurally. The reuse contract above says a
 * supplied Business persists for the next run, and exactly two of the nine
 * proofs that call this implemented it — so a reused fixture was SUSPENDED by
 * whichever proof ran next, and every later run signing in with that handle got
 * a login error that looks nothing like "your fixture was retired".
 *
 * Seven call sites remembering a rule is not a rule. The function that does the
 * damage is the one that has to know.
 */
export async function retireBusiness(merchantId) {
  if (!merchantId) return 'no-op';
  if (REUSED.has(merchantId)) {
    console.log(`  · not retiring @${REUSED.get(merchantId)} — supplied via BZ_BIZ_HANDLE, it persists`);
    return 'skipped-reused';
  }
  try {
    // TWO postings, in this order, exactly as retireConsumer does.
    //
    // This used to suspend and stop there, so every Business kept whatever it
    // had been paid. Proof 24 pays its own fixture 5 x 70 000 across its
    // sampling phases and left 350 000 behind on every execution — invisible
    // while the aggregate cap had room, and indistinguishable from a clean run
    // in every report, because the harness DID call a function named
    // "retireBusiness". A retirement that returns nothing is a suspension.
    //
    // The funds go back through the canonical balanced posting to transit
    // (owner_type MERCHANT, the same route tools/ops/retire-synthetic-residue.sh
    // uses), so no value is created or destroyed and the book stays at zero.
    sshOut(`
CORE=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging')
IK=$(docker exec "$CORE" sh -c "tr '\\0' '\\n' < /proc/1/environ | sed -n 's/^INTERNAL_API_KEY=//p'")
docker exec "$CORE" curl -s -o /dev/null -X POST "http://localhost:8081/internal/v1/sandbox/retire-funds" -H "X-Internal-Key: $IK" -H 'Content-Type: application/json' -d '{"owner_type":"MERCHANT","owner_id":"${merchantId}","reason":"app-web-business-e2e cleanup","retired_by":"app-web-e2e","idempotency_key":"appweb-m-${merchantId}"}' || true
docker exec "$CORE" curl -s -o /dev/null -X POST "http://localhost:8081/internal/v1/merchants/${merchantId}/suspend" -H "X-Internal-Key: $IK" -H 'Content-Type: application/json' -d '{"reason":"app-web-business-e2e cleanup"}' || true
`);
  } catch { /* best-effort */ }
  return 'retired';
}
