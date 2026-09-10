#!/usr/bin/env node
/**
 * The KYB sidebar badge follows a Business App upload, on the deployed Sandbox.
 *
 *   node tools/e2e/business/kyb-attention-e2e.mjs [--await-decision <seconds>] [--out <dir>]
 *
 * A synthetic Business (ACTIVE, @handle, AOA wallet, KYB approved through the
 * Sandbox fixture route) activates through the public activation API and signs
 * in with its PIN, as its owner does in the Business App. Then, as the app, it
 * sends two new KYB documents (post-approval maintenance): each upload gets a
 * signed PUT, the bytes go to the KYB bucket, and completing it puts the
 * document in PENDING_REVIEW.
 *
 * The attention summary — the gateway endpoint admin-api reads for the
 * BANZADMIN sidebar, called here from inside the admin-api container exactly as
 * admin-api calls it — must show kyb_documents +1: one Business waiting, however
 * many of its documents are pending.
 *
 * With --await-decision the harness then waits for an operator to decide the
 * documents in BANZADMIN (Documentos KYB → the Business → aprovar/rejeitar) and
 * checks the badge is back where it started. Without it, the fixture is left
 * for that decision and its @handle is printed.
 *
 * The PIN and activation token are generated here, sent in request bodies (the
 * token's hash over ssh stdin), and never printed. Nothing moves money. The
 * fixture Business is suspended once the documents are decided (or at once if
 * the upload leg fails).
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GW = process.env.GW_API ?? 'https://sandbox-api.banzami.com';
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const AWAIT = Number(arg('--await-decision', '0'));
const OUT = arg('--out', join(process.cwd(), `evidence/assurance/business/kyb-attention-${Date.now()}`));
mkdirSync(OUT, { recursive: true });

const steps = [];
const rec = (name, ok, note = '') => {
  steps.push({ step: name, ok: Boolean(ok), note: String(note).slice(0, 300) });
  console.log(`  ${ok ? '\x1b[0;32m✓\x1b[0m' : '\x1b[0;31m✗\x1b[0m'} ${name}${note ? ` — ${note}` : ''}`);
  return ok;
};
const ssh = (s, input) => execFileSync('ssh', [REMOTE, s], { encoding: 'utf8', maxBuffer: 1 << 24, input });
const PRE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"; GWC="$P-api-gateway-staging"; ADM="$P-admin-api"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }
  JWTSEC=$(docker exec "$GWC" sh -c 'cat /run/secrets/jwt_secret')
  mint(){ SECRET="$JWTSEC" V="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.V,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
`;

// The attention summary as admin-api reads it. The internal key is read from
// the admin-api process environment inside its container and never printed.
function attention() {
  const raw = ssh(`${PRE}
    docker exec "$ADM" sh -c '
      pe() { tr "\\0" "\\n" < /proc/1/environ | sed -n "s/^$1=//p" | head -1; }
      KEY="$(pe STAGING_INTERNAL_API_KEY)"; [ -n "$KEY" ] || KEY="$(pe INTERNAL_API_KEY)"
      wget -q -O - --header="X-Internal-Key: $KEY" "$(pe GATEWAY_STAGING_INTERNAL_URL)/internal/v1/attention-summary"'`);
  return JSON.parse(raw);
}

const stamp = Date.now().toString(36);
const PIN = String(randomInt(100000, 999999));
const ACTIVATION = randomBytes(32).toString('base64url');
let fixture = null;

async function http(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const r = await fetch(`${GW}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* 204 */ }
  return { status: r.status, body: j, code: j?.code ?? j?.error?.code };
}

function makeBusiness() {
  const handle = `kyba${stamp}`.slice(0, 30);
  const out = ssh(`${PRE}
    ROOT=$(mint 00000000-0000-0000-0000-000000000001)
    M=$(printf '{"name":"KYB Atencao ${stamp}","email":"kyba-${stamp}@projects.banzami.test"}' | docker exec -i "$GWC" curl -s -X POST http://localhost:8080/v1/merchants -H "Authorization: Bearer $ROOT" -H 'Content-Type: application/json' --data @- | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).id||"")}catch{}})')
    T=$(mint "$M")
    docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/wallets -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"currency":"AOA"}'
    docker exec "$CORE" curl -s -o /dev/null -X POST http://localhost:8081/internal/v1/sandbox/business-readiness -H 'Content-Type: application/json' -d "{\\"merchant_id\\":\\"$M\\",\\"handle\\":\\"${handle}\\"}"
    read -r TOKHASH
    q "insert into merchant_app_credentials (merchant_id, environment, handle) values ('$M', 'SANDBOX', '${handle}')" >/dev/null
    q "insert into merchant_activation_tokens (id, merchant_id, environment, token_hash, expires_at)
       values (gen_random_uuid(), '$M', 'SANDBOX', '$TOKHASH', now() + interval '15 minutes')" >/dev/null
    printf '%s' "$M"`, `${createHash('sha256').update(ACTIVATION).digest('hex')}\n`).trim();
  fixture = out;
  return { merchant: out, handle };
}

// A one-page PDF marked as a Sandbox test document.
function testPdf(label) {
  const text = `SANDBOX TEST DOCUMENT - NOT A LEGAL DOCUMENT - ${label}`;
  const stream = `BT /F1 12 Tf 40 780 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function upload(token, docType) {
  const bytes = testPdf(docType);
  const u = await http(`/v1/merchant/kyb/documents/${docType}/upload-url`, { method: 'POST', token, body: { content_type: 'application/pdf' } });
  if (u.status !== 200) return { ok: false, note: `upload-url ${u.status} ${u.code}` };
  const put = await fetch(u.body.upload_url, { method: u.body.method ?? 'PUT', headers: u.body.headers ?? { 'content-type': 'application/pdf' }, body: bytes });
  if (!put.ok) return { ok: false, note: `PUT ${put.status}` };
  const sha = createHash('sha256').update(bytes).digest('hex');
  const c = await http(`/v1/merchant/kyb/documents/${u.body.document_id}/complete`, { method: 'POST', token, body: { sha256: sha } });
  return { ok: c.status === 200 && c.body?.status === 'PENDING_REVIEW', id: u.body.document_id, note: `complete ${c.status} ${c.body?.status ?? c.code}` };
}

const kyb = (s) => s.categories?.kyb_documents?.count;
let uploadedLeg = false;

async function main() {
  console.log(`\n▸ KYB attention badge — ${GW}\n`);
  const before = attention();
  rec('the attention summary answers for SANDBOX with a KYB count', before.environment === 'SANDBOX' && Number.isInteger(kyb(before)),
    `kyb_documents=${kyb(before)} states=${JSON.stringify(before.categories?.kyb_documents?.states)}`);

  const B = makeBusiness();
  rec('a synthetic Business, approved-shaped (login without a PIN, activation link)', Boolean(B.merchant), B.merchant.slice(0, 8));
  const done = await http('/v1/merchant/activation/complete', { method: 'POST', body: { token: ACTIVATION, pin: PIN } });
  rec('its owner activates it and sets the PIN', [200, 201, 204].includes(done.status), `${done.status}`);
  const s = await http('/v1/merchant/auth/token', { method: 'POST', body: { handle: B.handle, pin: PIN } });
  const token = s.body?.token;
  rec('and signs in to the Business App', s.status === 200 && Boolean(token), `${s.status}`);

  const st = await http('/v1/merchant/kyb/status', { token });
  rec('the app reads its KYB status', st.status === 200, `${st.status} ${JSON.stringify(st.body ?? {}).slice(0, 120)}`);

  const d1 = await upload(token, 'COMPANY_TAX_ID');
  rec('the app sends a new KYB document: signed PUT, bytes in the bucket, PENDING_REVIEW', d1.ok, d1.note);
  const mid = attention();
  rec('the KYB badge counts the Business: +1', kyb(mid) === kyb(before) + 1, `${kyb(before)} → ${kyb(mid)}`);

  const d2 = await upload(token, 'COMMERCIAL_REGISTRATION');
  rec('a second document from the same Business', d2.ok, d2.note);
  const mid2 = attention();
  rec('still +1: the badge counts Businesses waiting, not documents', kyb(mid2) === kyb(before) + 1, `${kyb(before)} → ${kyb(mid2)}`);
  uploadedLeg = d1.ok && d2.ok;

  const rows = ssh(`${PRE} q "select document_type||':'||status from merchant_kyb_documents where merchant_id='${B.merchant}' and status='PENDING_REVIEW' order by 1"`).trim();
  rec('the database holds exactly those two documents pending review', rows.split('\n').filter(Boolean).length === 2, rows.replace(/\n/g, ' '));

  if (!AWAIT) {
    console.log(`\n  Waiting for an operator: BANZADMIN → Documentos KYB → @${B.handle} → decide both documents.`);
    console.log(`  Then re-run the check with: --await-decision (or read kyb_documents in the attention summary).\n`);
    return { handle: B.handle, before: kyb(before) };
  }

  console.log(`\n  Waiting up to ${AWAIT}s for an operator to decide @${B.handle}'s documents in BANZADMIN…`);
  const deadline = Date.now() + AWAIT * 1000;
  let pending = 2;
  while (Date.now() < deadline) {
    pending = Number(ssh(`${PRE} q "select count(*) from merchant_kyb_documents where merchant_id='${B.merchant}' and status='PENDING_REVIEW'"`).trim());
    if (pending === 0) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  rec('an operator decided both documents in BANZADMIN', pending === 0, `pending=${pending}`);
  if (pending === 0) {
    const after = attention();
    rec('the KYB badge is back where it started', kyb(after) === kyb(before), `${kyb(before)} → ${kyb(mid2)} → ${kyb(after)}`);
    const decided = ssh(`${PRE} q "select document_type||':'||status from merchant_kyb_documents where merchant_id='${B.merchant}' and document_type in ('COMPANY_TAX_ID','COMMERCIAL_REGISTRATION') and submitted_at is not null order by 1"`).trim();
    rec('decisions recorded', decided.length > 0, decided.replace(/\n/g, ' '));
  }
  return { handle: B.handle, before: kyb(before) };
}

function retire() {
  if (!fixture) return;
  try {
    ssh(`${PRE}
      T=$(mint "${fixture}")
      docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/merchants/${fixture}/suspend -H "Authorization: Bearer $T"`);
  } catch { /* best effort; the fixture is synthetic */ }
}

let result = null;
try {
  result = await main();
} catch (e) {
  rec('harness completed', false, e.message);
} finally {
  // Leave the Business active only while its documents wait for an operator.
  if (!uploadedLeg || AWAIT) retire();
}
const failed = steps.filter((s) => !s.ok);
const report = { schema: 'banzami-kyb-attention-e2e/v1', gateway: GW, ran_at: new Date().toISOString(),
  fixture_handle: result?.handle ?? null, steps, pass: steps.length - failed.length, fail: failed.length,
  verdict: failed.length ? 'FAIL' : 'PASS' };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n  ${report.verdict}  ${report.pass}/${steps.length}   ${OUT}\n`);
process.exit(failed.length ? 1 : 0);
