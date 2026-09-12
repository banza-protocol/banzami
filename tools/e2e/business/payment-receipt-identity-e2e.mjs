#!/usr/bin/env node
/**
 * Who was paid, on every receipt surface — a generic Business, end to end, on
 * the deployed Sandbox.
 *
 *   node tools/e2e/business/payment-receipt-identity-e2e.mjs [--payer <handle>] [--out <dir>]
 *
 * --payer reuses a synthetic payer an earlier run of this harness created
 * (handle rca…, PIN known to the harness) instead of registering and funding a
 * new one — for when the Sandbox pilot cap on aggregate test funds
 * (PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED) refuses new test credit. The cap is a
 * platform control and is never raised or bypassed here.
 *
 * A synthetic Business ("Loja Genérica <run>", @grc<run>) and a Developer
 * Project with a DIFFERENT name ("Projeto Integração <run>") connected to it by
 * the Business's consent code. The Project's key opens a Payment Session with
 * the Business's own words (metadata.merchant_reference / display_context) and
 * a plain payment link with no description. A synthetic consumer, funded with
 * Sandbox test credit, pays both through the public API, and pays another
 * consumer (P2P regression).
 *
 * For each payment, one expected record — taken from the ledger and the
 * Business's public identity, not from any receipt — is compared with every
 * surface independently: the proof row, the pay response's receipt, the
 * receipt JSON, the payer's PDF, the Business's PDF, the public verifier API
 * and the public verifier page. They must agree on the amount, the operation,
 * the payer, the payee (the Business — never the Project), the Business's
 * reference and context, the confirmed instant, the proof reference, the
 * status and the network. Nothing technical (a link id, "Payment link:", an
 * internal id) may appear on a public surface.
 *
 * Fixtures are retired at the end whatever happens. Test money only.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assuranceDir } from '../lib/assurance-output.mjs';
import { join } from 'node:path';
import { registerCleanup } from '../console/lib/run-cleanup.mjs';
import { mintSession } from '../console/lib/mint.mjs';

const API = process.env.DEV_API ?? 'https://developer-api.banzami.com';
const GW = process.env.GW_API ?? 'https://sandbox-api.banzami.com';
const SITE = process.env.SITE ?? 'https://banzami.com';
const ORIGIN = 'https://developers.banzami.com';
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const HERE = new URL('.', import.meta.url).pathname;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const REUSE_PAYER = arg('--payer', '');
const OUT = arg('--out', assuranceDir(`business/payment-receipt-identity-${Date.now()}`));
mkdirSync(OUT, { recursive: true });

const steps = [];
const rec = (name, ok, note = '') => {
  steps.push({ step: name, ok: Boolean(ok), note: String(note).slice(0, 400) });
  console.log(`  ${ok ? '\x1b[0;32m✓\x1b[0m' : '\x1b[0;31m✗\x1b[0m'} ${name}${note ? ` — ${String(note).slice(0, 200)}` : ''}`);
  return Boolean(ok);
};
const ssh = (s, input) => execFileSync('ssh', [REMOTE, s], { encoding: 'utf8', maxBuffer: 1 << 26, input });
const PRE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"; GWC="$P-api-gateway-staging"; DEV="$P-developer-api"; PUB="$P-public-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -F '|' -c "$1" 2>/dev/null; }
  JWTSEC=$(docker exec "$GWC" sh -c 'cat /run/secrets/jwt_secret')
  mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
`;
const q = (sql) => ssh(`${PRE} q "${sql.replace(/"/g, '\\"')}"`).trim();

const stamp = Date.now().toString(36);
const BUSINESS_NAME = `Loja Genérica ${stamp}`;
const HANDLE = `grc${stamp}`.slice(0, 20);
const PROJECT_NAME = `Projeto Integração ${stamp}`;
const emailOf = (r) => `receipt-${r}-${stamp}@banzami-e2e.test`;
registerCleanup({ emailPattern: `receipt-%-${stamp}@banzami-e2e.test`, namePattern: `rcpt-%${stamp}` });

const session = (email) =>
  mintSession(email);

async function dev(token, path, method = 'GET', body) {
  const headers = { cookie: `__Host-bz_dev_session=${token}` };
  if (method !== 'GET') {
    const me = await fetch(`${API}/auth/me`, { headers });
    const j = await me.json().catch(() => ({}));
    Object.assign(headers, { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': j.csrf_token ?? '' });
  }
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status, body: j, code: j?.error?.code };
}

async function http(url, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: j, text };
}

const fixtures = { merchant: null, keyId: null, consumers: [] };

function pdfText(buf, name) {
  const path = join(OUT, name);
  writeFileSync(path, buf);
  execFileSync('pdftoppm', ['-png', '-r', '80', '-singlefile', path, path.replace(/\.pdf$/, '')]);
  return execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
}

function watDate(iso) {
  const d = new Date(new Date(iso).getTime() + 3600_000); // Africa/Luanda = UTC+1, no DST
  const mon = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][d.getUTCMonth()];
  const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return { pdf: `${d.getUTCDate()} ${mon} ${d.getUTCFullYear()}, ${hm} (WAT)`, page: `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}, ${hm} (WAT)` };
}

async function existingPayer(handle) {
  if (!/^rca[a-z0-9]+$/.test(handle)) throw new Error('--payer must be a synthetic payer this harness created (rca…)');
  const out = ssh(`${PRE}
    R=$(docker exec "$PUB" curl -s -X POST http://localhost:8083/v1/auth/token -H 'Content-Type: application/json' -d '{"handle":"${handle}","pin":"1357"}')
    printf '%s' "$(printf '%s' "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).token||"")}catch{}})')"
    printf '|'; q "select id::text||'|'||coalesce(display_name,'') from consumers where handle='${handle}'"`).trim();
  const [token, id, name] = out.split('|');
  return { id, token, handle, name };
}

async function consumer(tag, fund) {
  const handle = `rc${tag}${stamp}`.slice(0, 20).replace(/[^a-z0-9]/g, '');
  const out = ssh(`${PRE}
    R=$(docker exec "$PUB" curl -s -X POST http://localhost:8083/v1/auth/register -H 'Content-Type: application/json' -d '{"handle":"${handle}","pin":"1357","display_name":"Pagador ${tag.toUpperCase()} ${stamp}"}')
    ID=$(printf '%s' "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).consumer.id)}catch{}})')
    TOK=$(printf '%s' "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).token)}catch{}})')
    ${fund ? `docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/compliance/customers/verify -H "Authorization: Bearer $(mint customer_id "$ID")" -H 'Content-Type: application/json' -d '{"full_name":"SYN","document_type":"BILHETE_DE_IDENTIDADE","document_number":"RC${stamp}${tag}","date_of_birth":"1990-01-01","requested_level":"BASIC"}'
    docker exec "$CORE" curl -s -o /dev/null -X POST http://localhost:8081/internal/v1/consumer-wallets/test-credit -H 'Content-Type: application/json' -d "{\\"consumer_id\\":\\"$ID\\",\\"amount_minor\\":${fund},\\"currency\\":\\"AOA\\"}"` : ''}
    printf '%s|%s' "$ID" "$TOK"`).trim();
  const [id, token] = out.split('|');
  fixtures.consumers.push(id);
  return { id, token, handle, name: `Pagador ${tag.toUpperCase()} ${stamp}` };
}

// One payment, every surface, one expected record.
async function crossSurface(label, { transferId, payResponse, payer, token, expect }) {
  const ledger = q(`SELECT t.amount_minor, t.status, to_char(t.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US'), coalesce(w.merchant_id::text,''), coalesce(cr.handle,''),
                           (SELECT a.id::text FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id WHERE e.posting_id=t.ledger_posting_id AND e.entry_type='CREDIT'),
                           coalesce(t.description,'')
                      FROM transfers t LEFT JOIN wallets w ON w.id=t.recipient_id LEFT JOIN consumers cr ON cr.id=t.recipient_id WHERE t.id='${transferId}'`).split('|');
  const [amount, status, confirmedUtc, creditedMerchant, creditedConsumerHandle, creditAccount, transferDesc] = ledger;
  const walletAccountOwner = creditAccount ? q(`SELECT coalesce((SELECT merchant_id::text FROM wallet_accounts WHERE account_id='${creditAccount}'),(SELECT merchant_id::text FROM wallets WHERE available_account_id='${creditAccount}'),'')`) : '';
  rec(`${label}: the ledger credited the expected party`, expect.kind === 'PAYMENT'
    ? creditedMerchant === fixtures.merchant && (walletAccountOwner === '' || walletAccountOwner === fixtures.merchant)
    : creditedConsumerHandle === expect.payeeHandle,
  `amount ${amount}, credited ${expect.kind === 'PAYMENT' ? `Business ${creditedMerchant.slice(0, 8)}` : `@${creditedConsumerHandle}`}`);
  rec(`${label}: no generated description on the transfer`, !/^Payment link:/.test(transferDesc), transferDesc || '(none)');

  const views = [];
  if (payResponse) views.push(['pay response', payResponse]);
  const j = await http(`${GW}/consumer/v1/consumer/transactions/${transferId}/receipt`, { token });
  views.push(['receipt JSON', j.body]);
  // A P2P proof is established on the first receipt request, so the proof row
  // is read after it.
  const proof = q(`SELECT proof_reference, operation_kind, channel, funding_source, coalesce(payee_handle,''), coalesce(payee_display_name,''), coalesce(merchant_reference,''), coalesce(display_context,''), coalesce(description,''), to_char(confirmed_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US'), status FROM transaction_proofs WHERE transaction_id='${transferId}'`).split('|');
  const [ref, pKind, pChannel, pFunding, pPayeeHandle, pPayeeName, pRef, pCtx, pDesc, pConfirmed, pStatus] = proof;
  rec(`${label}: the proof`, pKind === expect.kind && pChannel === expect.channel && pFunding === 'BANZAMI_BALANCE'
    && pPayeeHandle === expect.payeeHandle && pPayeeName === expect.payeeName && pRef === (expect.merchantReference ?? '')
    && pCtx === (expect.displayContext ?? '') && pDesc === (expect.description ?? '') && pConfirmed === confirmedUtc && pStatus === 'CONFIRMED',
  `${pKind}/${pChannel} payee ${pPayeeName} @${pPayeeHandle}`);

  for (const [name, r] of views) {
    rec(`${label}: ${name}`, r && r.proof_reference === ref && r.operation_kind === expect.kind && r.channel === expect.channel
      && r.funding_source === 'BANZAMI_BALANCE' && r.amount_minor === Number(amount)
      && r.payer?.handle === payer.handle && r.payee?.handle === expect.payeeHandle && (r.payee?.display_name ?? '') === (expect.payeeKind === 'BUSINESS' ? expect.payeeName : r.payee?.display_name)
      && (r.merchant_reference ?? '') === (expect.merchantReference ?? '') && (r.display_context ?? '') === (expect.displayContext ?? '')
      && new Date(r.confirmed_at).getTime() === new Date(`${confirmedUtc}Z`).getTime(),
    `${r?.operation_kind}/${r?.channel} ${r?.payee?.display_name ?? ''} @${r?.payee?.handle} ref ${r?.proof_reference?.slice(0, 9)}…`);
  }

  const pdfRes = await fetch(`${GW}/consumer/v1/consumer/transactions/${transferId}/receipt.pdf`, { headers: { authorization: `Bearer ${token}` } });
  const pdf = pdfText(Buffer.from(await pdfRes.arrayBuffer()), `${label}-payer.pdf`);
  const wat = watDate(`${confirmedUtc}Z`);
  const flat = pdf.replace(/\s+/g, ' ');
  const mustPdf = [expect.kind === 'PAYMENT' ? 'COMPROVATIVO DE PAGAMENTO' : 'COMPROVATIVO DE TRANSFERÊNCIA', ref, `@${expect.payeeHandle}`, `@${payer.handle}`, wat.pdf, expect.amountText,
    ...(expect.kind === 'PAYMENT' ? ['Saldo Banzami'] : [])];
  // A Business is named at its @handle on the PDF; its name is not printed as the payee.
  const payeeNameOnPdf = expect.kind === 'PAYMENT' && flat.includes(expect.payeeName);
  const missing = mustPdf.filter((m) => !flat.toUpperCase().includes(String(m).toUpperCase()));
  const forbidden = ['Payment link:', 'Transferência Banzami · @banza', PROJECT_NAME, 'liquidado em segundos', ...(expect.kind === 'PAYMENT' ? ['Comprovativo de transferência'] : [])]
    .filter((b) => flat.includes(b));
  rec(`${label}: the payer's PDF`, pdfRes.status === 200 && missing.length === 0 && forbidden.length === 0 && !payeeNameOnPdf,
    `missing [${missing.join(', ')}] forbidden [${forbidden.join(', ')}] → ${label}-payer.png`);

  const pub = await http(`${GW}/v1/public/proofs/${ref}`);
  const p = pub.body ?? {};
  const pubText = JSON.stringify(p);
  const leaks = [transferId, fixtures.merchant, payer.id, 'Payment link:', PROJECT_NAME].filter((x) => x && pubText.includes(x));
  rec(`${label}: the public verifier API`, p.exists === true && p.status === 'CONFIRMED' && p.operation_kind === expect.kind && p.channel === expect.channel
    && p.payee_handle === expect.payeeHandle && (expect.payeeKind === 'BUSINESS' ? p.payee_display === expect.payeeName : p.payee_display == null)
    && p.payer_handle === payer.handle && p.payer_display == null && p.network === 'banza'
    && new Date(p.confirmed_at).getTime() === Math.floor(new Date(`${confirmedUtc}Z`).getTime() / 1000) * 1000 && leaks.length === 0,
  `payee ${p.payee_display ?? ''} @${p.payee_handle} payer @${p.payer_handle} leaks [${leaks.join(', ')}]`);

  const page = await http(`${SITE}/r/${ref}`);
  const html = page.text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
  const mustPage = [expect.kind === 'PAYMENT' ? 'Pagamento verificado' : 'Transferência verificada', ref, `@${expect.payeeHandle}`, wat.page,
    `${expect.kind === 'PAYMENT' ? 'Pagamento' : 'Transferência'} · ${expect.channelLabel}`, 'SANDBOX',
    ...(expect.kind === 'PAYMENT' ? [`Para @${expect.payeeHandle}`] : [])];
  const pageMissing = mustPage.filter((m) => !html.includes(m));
  const pageForbidden = ['Payment link:', PROJECT_NAME, 'Para —', payer.name].filter((b) => html.includes(b));
  rec(`${label}: the public verifier page`, page.status === 200 && pageMissing.length === 0 && pageForbidden.length === 0,
    `missing [${pageMissing.join(', ')}] forbidden [${pageForbidden.join(', ')}]`);
  writeFileSync(join(OUT, `${label}-verifier.html`), page.text);
  return { ref, confirmedUtc };
}

async function main() {
  console.log(`\n▸ Payment receipt identity — ${GW}\n`);

  // ── the Business ───────────────────────────────────────────────────────────
  const out = ssh(`${PRE}
    ROOT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
    M=$(printf '{"name":"${BUSINESS_NAME}","email":"rcpt-biz-${stamp}@projects.banzami.test"}' | docker exec -i "$GWC" curl -s -X POST http://localhost:8080/v1/merchants -H "Authorization: Bearer $ROOT" -H 'Content-Type: application/json' --data @- | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).id||"")}catch{}})')
    T=$(mint merchant_id "$M")
    docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/wallets -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"currency":"AOA"}'
    docker exec "$CORE" curl -s -o /dev/null -X POST http://localhost:8081/internal/v1/sandbox/business-readiness -H 'Content-Type: application/json' -d "{\\"merchant_id\\":\\"$M\\",\\"handle\\":\\"${HANDLE}\\"}"
    C=$(docker exec "$GWC" curl -s -X POST http://localhost:8080/v1/merchant/project-link-codes -H "Authorization: Bearer $T")
    printf '%s|%s' "$M" "$(printf '%s' "$C" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).code||"")}catch{}})')"`).trim();
  const [merchant, consentCode] = out.split('|');
  fixtures.merchant = merchant;
  const identity = q(`SELECT coalesce(handle,'')||'|'||display_name FROM business_public_identities WHERE merchant_id='${merchant}'`);
  rec('a synthetic Business, its public identity, and a consent code', merchant && consentCode && identity === `${HANDLE}|${BUSINESS_NAME}`, `${identity} code ${consentCode ? 'issued' : 'missing'}`);

  // ── a Project with a DIFFERENT name, connected by consent ─────────────────
  // The identities come from signing in. These runs used to INSERT rows into
  // account_identity.identity_users, because the old mint script could only sign in
  // an account that already existed — a harness writing into the authentication
  // store to give itself someone to be. Verifying a code creates the identity on
  // the way through, exactly as it does for a first-time developer.
  const owner = session(emailOf('owner'));
  const ws = await dev(owner, '/workspaces', 'POST', { name: `rcpt-ws-${stamp}` });
  const pr = await dev(owner, `/workspaces/${ws.body?.id}/projects`, 'POST', { name: PROJECT_NAME });
  const project = pr.body?.id;
  const link = await dev(owner, `/projects/${project}/financial-onboarding/link`, 'POST', { code: consentCode });
  const fs = await dev(owner, `/projects/${project}/financial-setup`);
  rec(`the Project "${PROJECT_NAME}" is connected to the Business`, [200, 201].includes(link.status) && project,
    `${link.status} ${link.code ?? ''} setup=${fs.body?.state}/${fs.body?.onboarding?.state}`);

  // ── the Project's key opens a session and a plain link ─────────────────────
  const reference = `GEN-${stamp.toUpperCase()}`.slice(0, 20);
  const context = `Encomenda · Livro de receitas ${stamp}`;
  const keyOut = ssh(`${PRE}
    DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key')
    K=$(printf '{"name":"rcpt-key-${stamp}","scopes":["payment_sessions:write","payment_sessions:read","payment_links:write","payment_links:read"],"created_by":"00000000-0000-4000-8000-000000000001"}' | docker exec -i "$DEV" curl -s -X POST http://localhost:8086/internal/v1/projects/${project}/fixture-keys -H "X-Internal-Key: $DEVINT" -H 'Content-Type: application/json' --data @-)
    SECRET=$(printf '%s' "$K" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).secret||"")}catch{}})')
    KID=$(printf '%s' "$K" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).id||"")}catch{}})')
    S=$(curl -s -X POST ${GW}/v1/payment-sessions -H @/dev/fd/3 -H 'Content-Type: application/json' -d '{"amount_minor":200000,"currency":"AOA","description":"${reference}","metadata":{"merchant_reference":"${reference}","display_context":"${context}","payee_name":"Outro Negócio"}}' 3< <(printf 'Authorization: Bearer %s\\n' "$SECRET"))
    BAD=$(curl -s -o /dev/null -w '%{http_code}' -X POST ${GW}/v1/payment-sessions -H @/dev/fd/3 -H 'Content-Type: application/json' -d '{"amount_minor":1000,"currency":"AOA","metadata":{"display_context":"Pague a @outro <b>já</b>"}}' 3< <(printf 'Authorization: Bearer %s\\n' "$SECRET"))
    L=$(curl -s -X POST ${GW}/v1/payment-links -H @/dev/fd/3 -H 'Content-Type: application/json' -d '{"amount_minor":150000,"currency":"AOA"}' 3< <(printf 'Authorization: Bearer %s\\n' "$SECRET"))
    printf '%s\\n%s\\n%s\\n%s' "$KID" "$S" "$L" "$BAD"`);
  const [keyId, sessionJson, linkJson, badStatus] = keyOut.split('\n');
  fixtures.keyId = keyId;
  let sessionBody = {}; let linkBody = {};
  try { sessionBody = JSON.parse(sessionJson); } catch { /* */ }
  try { linkBody = JSON.parse(linkJson); } catch { /* */ }
  const sessionSlug = (sessionBody.interfaces ?? []).find((i) => i.type === 'PAYMENT_LINK')?.value?.split('/').filter(Boolean).pop();
  rec('the Project key opens a Payment Session with the Business\'s own words', Boolean(sessionSlug), sessionJson.slice(0, 160));
  rec('an invalid display context is refused at creation (markup, @handle)', badStatus === '400', badStatus);
  rec('and a plain payment link with no description', Boolean(linkBody.slug), linkJson.slice(0, 120));

  // ── consumers ──────────────────────────────────────────────────────────────
  const payer = REUSE_PAYER ? await existingPayer(REUSE_PAYER) : await consumer('a', 1000000);
  const friend = await consumer('b', 0);
  rec('a funded synthetic payer and a second consumer', payer.id && payer.token && friend.id, `@${payer.handle} @${friend.handle}`);

  // ── the link payment's payee, before paying ────────────────────────────────
  const view = await http(`${GW}/consumer/v1/payment-links/${sessionSlug}`);
  rec('before paying, the link names the Business — not the Project', view.body?.merchant_name === BUSINESS_NAME && view.body?.merchant_handle === HANDLE,
    `${view.body?.merchant_name} @${view.body?.merchant_handle}`);

  // ── pay the session's link ─────────────────────────────────────────────────
  const paid = await http(`${GW}/consumer/v1/payment-links/${sessionSlug}/pay`, { method: 'POST', token: payer.token, body: { idempotency_key: `rcpt-s-${stamp}` } });
  rec('the payer pays the session', paid.status === 200 && paid.body?.transaction_id, `${paid.status} receipt=${paid.body?.receipt ? 'in response' : 'absent'}`);
  const expectation = { kind: 'PAYMENT', channel: 'PAYMENT_LINK', channelLabel: 'Link de pagamento', payeeKind: 'BUSINESS',
    payeeHandle: HANDLE, payeeName: BUSINESS_NAME, amountText: '2 000 Kz' };
  const s1 = await crossSurface('session-payment', { transferId: paid.body?.transaction_id, payResponse: paid.body?.receipt, payer, token: payer.token,
    expect: { ...expectation, merchantReference: reference, displayContext: context, description: '' } });

  // The Business's copy is the same operation, the same reference.
  const wp = q(`SELECT id FROM wallet_payments WHERE transfer_id='${paid.body?.transaction_id}'`);
  if (wp) {
    const biz = ssh(`${PRE}
      T=$(mint merchant_id "${merchant}")
      docker exec "$GWC" curl -s -o /tmp/rcpt-biz.pdf -w '%{http_code}' -H "Authorization: Bearer $T" http://localhost:8080/v1/merchant/transactions/${wp}/receipt.pdf
      docker exec "$GWC" cat /tmp/rcpt-biz.pdf | base64 -w0 > /tmp/rcpt-biz.b64; docker exec "$GWC" rm -f /tmp/rcpt-biz.pdf; echo; cat /tmp/rcpt-biz.b64; rm -f /tmp/rcpt-biz.b64`);
    const [code, b64] = biz.split('\n');
    const text = pdfText(Buffer.from(b64 ?? '', 'base64'), 'session-payment-business.pdf').replace(/\s+/g, ' ');
    rec('the Business\'s PDF: same reference, "pagamento recebido", same payee', code === '200' && text.includes(s1.ref) && /PAGAMENTO RECEBIDO/i.test(text) && text.includes(`@${HANDLE}`),
      `${code} → session-payment-business.png`);
    const n = q(`SELECT count(*) FROM transaction_proofs WHERE transaction_id IN ('${paid.body?.transaction_id}','${wp}')`);
    rec('one operation, one proof', n === '1', `${n} proof(s)`);
  } else {
    rec('the Business\'s PDF', false, 'no wallet payment row for the transfer');
  }

  // ── pay the plain link: no description anywhere ────────────────────────────
  const paid2 = await http(`${GW}/consumer/v1/payment-links/${linkBody.slug}/pay`, { method: 'POST', token: payer.token, body: { idempotency_key: `rcpt-l-${stamp}` } });
  rec('the payer pays the plain link', paid2.status === 200, `${paid2.status}`);
  await crossSurface('plain-link-payment', { transferId: paid2.body?.transaction_id, payResponse: paid2.body?.receipt, payer, token: payer.token,
    expect: { ...expectation, amountText: '1 500 Kz', merchantReference: '', displayContext: '', description: '' } });

  // ── P2P regression ─────────────────────────────────────────────────────────
  const p2p = await http(`${GW}/consumer/v1/transfers`, { method: 'POST', token: payer.token,
    body: { recipient: `@${friend.handle}`, amount_minor: 50000, currency: 'AOA', note: `jantar ${stamp}`, idempotency_key: `rcpt-p-${stamp}` } });
  rec('a P2P transfer', [200, 201].includes(p2p.status) && p2p.body?.transfer_id, `${p2p.status}`);
  await crossSurface('p2p-transfer', { transferId: p2p.body?.transfer_id, payer, token: payer.token,
    expect: { kind: 'P2P_TRANSFER', channel: 'HANDLE', channelLabel: 'Endereço @banza', payeeKind: 'PERSON', payeeHandle: friend.handle, payeeName: friend.name,
      amountText: '500 Kz', merchantReference: '', displayContext: '', description: `jantar ${stamp}` } });
}

function cleanup() {
  try {
    ssh(`${PRE}
      ${fixtures.merchant ? `T=$(mint merchant_id "${fixtures.merchant}"); docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/merchants/${fixtures.merchant}/suspend -H "Authorization: Bearer $T"` : ':'}
      ${fixtures.keyId ? `DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key'); docker exec "$DEV" curl -s -o /dev/null -X POST http://localhost:8086/internal/v1/fixture-keys/${fixtures.keyId}/revoke -H "X-Internal-Key: $DEVINT"` : ':'}`);
  } catch { /* best effort; synthetic */ }
}

try {
  await main();
} catch (e) {
  rec('harness completed', false, e.stack ?? e.message);
} finally {
  cleanup();
}
const failed = steps.filter((s) => !s.ok);
const report = { schema: 'banzami-payment-receipt-identity-e2e/v1', gateway: GW, ran_at: new Date().toISOString(),
  business: { name: BUSINESS_NAME, handle: HANDLE }, project: PROJECT_NAME,
  steps, pass: steps.length - failed.length, fail: failed.length, verdict: failed.length ? 'FAIL' : 'PASS' };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n  ${report.verdict}  ${report.pass}/${steps.length}   ${OUT}\n`);
process.exit(failed.length ? 1 : 0);
