#!/usr/bin/env node
/**
 * The Console's refund, asked of the deployed system.
 *
 * A refund is the only place in the Console where a browser takes money back
 * out of an account, so the authority for it is proved against the running
 * service rather than against the predicate that implements it. Every check
 * here calls the deployed API with a real session: a hidden button is not
 * authorisation, and a role that cannot see the control can still send the
 * request.
 *
 * The payment being refunded is a real one — a project key opens a wallet
 * account, opens a session, and a funded consumer pays the link — so the
 * balance assertions are about money that actually moved.
 *
 * Usage: node tools/e2e/console/refund-rbac.mjs
 */
import { execFileSync } from 'node:child_process';
import { registerCleanup } from './lib/run-cleanup.mjs';

const API = process.env.DEV_API ?? 'https://developer-api.banzami.com';
const ORIGIN = 'https://developers.banzami.com';
const HERE = new URL('.', import.meta.url).pathname;
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };
const step = (m) => console.log(`\n${m}`);

const ssh = (s) => execFileSync('ssh', [REMOTE, s], { encoding: 'utf8', maxBuffer: 1 << 24 });
const session = (email) =>
  execFileSync('bash', [`${HERE}mint-console-session.sh`, email, '90'], { encoding: 'utf8' }).trim().split('\n').pop();

/** The Sandbox preamble every remote snippet needs: container names and a psql. */
const PRE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"; DEV="$P-developer-api"; GW="$P-api-gateway-staging"; PUB="$P-public-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1" 2>/dev/null; }
`;

async function call(token, path, method = 'GET', body) {
  const headers = { cookie: `__Host-bz_dev_session=${token}` };
  if (method !== 'GET') {
    const me = await fetch(`${API}/auth/me`, { headers });
    const j = await me.json().catch(() => ({}));
    Object.assign(headers, {
      'content-type': 'application/json',
      origin: ORIGIN,
      'x-csrf-token': j.csrf_token ?? '',
    });
  }
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* */ }
  // The error envelope is {error:{code,message}}; success bodies are flat. Both
  // reach the caller, with the code lifted so an assertion can name it.
  return { status: r.status, body: j, code: j?.error?.code ?? j?.code ?? '' };
}

const stamp = Date.now().toString(36);
const ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'VIEWER'];
const email = (r) => `console-refund-${r.toLowerCase()}-${stamp}@banzami-e2e.test`;
const outsiderEmail = `console-refund-outsider-${stamp}@banzami-e2e.test`;

// Everything this run created, removed whatever happens — including on the
// failure paths, which is when leaks actually happen. Matched on the run stamp,
// so a concurrent run is untouched. The wallet account and its payments stay:
// they are financial history, and history is not a fixture.
let canonWs = '';
registerCleanup({
  emailPattern: `console-refund-%${stamp}@banzami-e2e.test`,
  namePattern: `console-refund-${stamp}%`,
});
process.on('uncaughtException', (e) => { console.error(e); process.exit(1); });

// ── the people ───────────────────────────────────────────────────────────────
step('one member of every canonical role, on the bound project');
const allEmails = [...ROLES.map(email), outsiderEmail];
ssh(`${PRE}
  for e in ${allEmails.join(' ')}; do
    q "insert into account_identity.identity_users (email, verified, status)
       select '$e', true, 'ACTIVE'
        where not exists (select 1 from account_identity.identity_users where email='$e')" >/dev/null
  done
  echo done`);

const tok = Object.fromEntries(ROLES.map((r) => [r, session(email(r))]));
const outsiderTok = session(outsiderEmail);
ROLES.every((r) => tok[r]) && outsiderTok ? ok('six sessions minted') : bad('session minting failed');

// A refund needs a project with a financial owner, so this uses the canonical
// bound project — the same one the other Console suites read — and adds these
// members to its workspace for the length of the run.
const canon = ssh(`${PRE}
  q "select p.id, p.workspace_id from developer.dev_projects p
      where p.status='ACTIVE' and exists (select 1 from developer.dev_project_sandbox_binding b
        where b.project_id=p.id and b.state='ACTIVE') limit 1"`).trim().split('|');
const [canonPrj] = canon;
canonWs = canon[1];
canonPrj ? ok(`bound project ${canonPrj.slice(0, 8)}`) : bad('no bound project — nothing to refund against');
if (!canonPrj) process.exit(1);

ssh(`${PRE}
  ${ROLES.map((r) => `
  q "insert into developer.dev_workspace_members (workspace_id, user_id, role, accepted_at, status)
     select '${canonWs}', u.id, '${r}', now(), 'ACTIVE' from account_identity.identity_users u
      where u.email='${email(r)}'
        and not exists (select 1 from developer.dev_workspace_members m
                         where m.workspace_id='${canonWs}' and m.user_id=u.id)" >/dev/null`).join('\n')}
  echo done`);

// ── a real payment to refund ────────────────────────────────────────────────
step('a real payment, paid by a funded consumer');
const paid = ssh(`${PRE}
  DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key')
  JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret')
  SC='["identity:read","payment_sessions:read","payment_sessions:write","wallet_accounts:read","wallet_accounts:create"]'
  KEYJSON=$(docker exec -i "$DEV" curl -s -X POST "http://localhost:8086/internal/v1/projects/${canonPrj}/fixture-keys" \\
    -H "X-Internal-Key: $DEVINT" -H 'Content-Type: application/json' \\
    --data "{\\"name\\":\\"console-refund-${stamp}\\",\\"scopes\\":$SC,\\"created_by\\":\\"11111111-2222-4333-8444-555555555555\\"}")
  KEY=$(printf '%s' "$KEYJSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).secret||"")}catch(e){}})')
  ACCT=$(docker exec -i "$GW" curl -s -X POST http://localhost:8080/v1/business/wallet-accounts \\
    -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \\
    --data '{"purpose":"CAMPAIGN","reference_type":"DOA_CAMPAIGN","reference_id":"console-refund-${stamp}","label":"Console refund probe"}' \\
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).id||"")}catch(e){}})')
  SESJSON=$(docker exec -i "$GW" curl -s -X POST http://localhost:8080/v1/business/payment-sessions \\
    -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \\
    --data "{\\"wallet_account_id\\":\\"$ACCT\\",\\"purpose\\":\\"DONATION\\",\\"reference_type\\":\\"DOA_DONATION\\",\\"reference_id\\":\\"console-refund-${stamp}\\",\\"amount_minor\\":300000,\\"currency\\":\\"AOA\\"}")
  SESSION=$(printf '%s' "$SESJSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).session_id||"")}catch(e){}})')
  SLUG=$(printf '%s' "$SESJSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const i=(j.interfaces||[]).find(x=>x.type==="PAYMENT_LINK");process.stdout.write(i?String(i.value).split("/").filter(Boolean).pop():"")}catch(e){}})')
  PAYER=$(q "SELECT cw.consumer_id FROM consumer_wallets cw JOIN ledger_entries le ON le.account_id=cw.available_account_id
             WHERE cw.status='ACTIVE' AND cw.currency='AOA' GROUP BY cw.consumer_id
             HAVING COALESCE(SUM(CASE WHEN le.entry_type='CREDIT' THEN le.amount_minor ELSE -le.amount_minor END),0) >= 400000
             ORDER BY 1 LIMIT 1")
  CJWT=$(SECRET="$JWTSEC" V="$PAYER" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900,customer_id:process.env.V};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));')
  PAYCODE=$(docker exec -i "$PUB" curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:8083/v1/payment-links/$SLUG/pay" \\
    -H "Authorization: Bearer $CJWT" -H 'Content-Type: application/json' --data '{"amount_minor":300000}')
  # A second session, deliberately left unpaid: "nothing to give back" is its own
  # answer and needs its own subject.
  UNPAID=$(docker exec -i "$GW" curl -s -X POST http://localhost:8080/v1/business/payment-sessions \\
    -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \\
    --data "{\\"wallet_account_id\\":\\"$ACCT\\",\\"purpose\\":\\"DONATION\\",\\"reference_type\\":\\"DOA_DONATION\\",\\"reference_id\\":\\"console-refund-unpaid-${stamp}\\",\\"amount_minor\\":100000,\\"currency\\":\\"AOA\\"}" \\
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).session_id||"")}catch(e){}})')
  printf '%s|%s|%s|%s\\n' "$SESSION" "$ACCT" "$PAYCODE" "$UNPAID"`).trim().split('\n').pop().split('|');

const [paymentID, acctID, payCode, unpaidID] = paid;
payCode === '200' ? ok(`payment of 3 000 Kz completed (${String(paymentID).slice(0, 8)})`) : bad(`payment failed (http ${payCode})`);
if (payCode !== '200') process.exit(1);

// Read from the ledger, not from a stored figure. A balance column would show
// what something believed; the entries show what actually posted, which is the
// question a refund test is asking.
const balance = () => Number(ssh(`${PRE}
  q "select coalesce(sum(case when e.entry_type='CREDIT' then e.amount_minor else -e.amount_minor end),0)
       from ledger_entries e join wallet_accounts wa on wa.account_id = e.account_id
      where wa.id='${acctID}'"`).trim() || '0');

const afterPay = balance();
afterPay === 300000 ? ok('the account holds 3 000 Kz') : bad(`account holds ${afterPay}, expected 300000`);

// ── what each role may do ───────────────────────────────────────────────────
// The matrix is not read off the role names. OWNER and ADMIN may refund;
// DEVELOPER may build the capability and not exercise it; FINANCE is denied
// even though the name is the one that sounds like it should not be.
step('the refund matrix, asked of the deployed API');
const MAY_REFUND = { OWNER: true, ADMIN: true, DEVELOPER: false, FINANCE: false, VIEWER: false };

for (const r of ROLES) {
  const cap = await call(tok[r], `/projects/${canonPrj}/refund-capability`);
  if (cap.status !== 200) { bad(`${r}: capability read failed (${cap.status})`); continue; }
  cap.body.allowed === MAY_REFUND[r]
    ? ok(`${r}: capability says allowed=${cap.body.allowed}`)
    : bad(`${r}: capability says allowed=${cap.body.allowed}, expected ${MAY_REFUND[r]}`);
  cap.body.configured === true
    ? ok(`${r}: the deployment reports a refund path`)
    : bad(`${r}: the deployment reports no refund path — the credential is not wired`);
}

// The denied roles go first, so that if one of them succeeded the money would
// have moved before the allowed role is even asked, and the balance assertion
// after it would catch it.
for (const r of ROLES.filter((x) => !MAY_REFUND[x])) {
  const res = await call(tok[r], `/projects/${canonPrj}/payments/${paymentID}/refund`, 'POST',
    { amount_minor: 50000, reason: `rbac probe ${r}`, idempotency_key: `probe-${r}-${stamp}` });
  res.status === 403
    ? ok(`${r} is refused (403) — the button being hidden is not what stops them`)
    : bad(`${r} got ${res.status} on a refund it must not be allowed to make`);
}
balance() === afterPay
  ? ok('no denied role moved any money')
  : bad(`balance changed to ${balance()} while only denied roles had asked`);

// ── the refund itself ───────────────────────────────────────────────────────
step('an OWNER refunds, and the money actually moves');
const idem = `console-refund-${stamp}`;
const first = await call(tok.OWNER, `/projects/${canonPrj}/payments/${paymentID}/refund`, 'POST',
  { amount_minor: 100000, reason: 'pagamento duplicado', idempotency_key: idem });
first.status === 200 ? ok(`refund created (${String(first.body?.id).slice(0, 8)})`) : bad(`refund failed: ${first.status} ${JSON.stringify(first.body)}`);

const afterRefund = balance();
afterRefund === afterPay - 100000
  ? ok(`the account fell to ${afterRefund} — 1 000 Kz went back`)
  : bad(`balance is ${afterRefund}, expected ${afterPay - 100000}`);

step('a repeat of the same confirmed refund is the same refund');
const replay = await call(tok.OWNER, `/projects/${canonPrj}/payments/${paymentID}/refund`, 'POST',
  { amount_minor: 100000, reason: 'pagamento duplicado', idempotency_key: idem });
// Core answers the replay of a settled idempotency key as a conflict rather than
// by re-returning the refund. Either way the requirement is the same and it is
// the one that matters: the second press must not move money again.
[200, 409].includes(replay.status)
  ? ok(`the replay is recognised (${replay.status} ${replay.code || 'same refund'})`)
  : bad(`replay answered ${replay.status}`);
balance() === afterRefund
  ? ok('the replay moved no money')
  : bad(`the replay moved money: ${balance()} vs ${afterRefund}`);

step('an ADMIN may refund too — a second, deliberate partial with its own key');
const second = await call(tok.ADMIN, `/projects/${canonPrj}/payments/${paymentID}/refund`, 'POST',
  { amount_minor: 50000, reason: 'segunda parcela', idempotency_key: `console-refund-2-${stamp}` });
second.status === 200 ? ok('ADMIN refunded a second partial') : bad(`ADMIN refund failed: ${second.status} ${JSON.stringify(second.body)}`);
balance() === afterRefund - 50000
  ? ok(`the account fell again to ${balance()}`)
  : bad(`balance is ${balance()}, expected ${afterRefund - 50000}`);

// ── what must not work ──────────────────────────────────────────────────────
step('the refusals');

const unpaid = await call(tok.OWNER, `/projects/${canonPrj}/payments/${unpaidID}/refund`, 'POST',
  { amount_minor: 10000, reason: 'nada pago', idempotency_key: `unpaid-${stamp}` });
unpaid.status === 409 && unpaid.code === 'NOT_REFUNDABLE'
  ? ok('an unpaid payment has nothing to give back, and says so')
  : bad(`unpaid payment answered ${unpaid.status} ${unpaid.code || '(no code)'}`);

const outsider = await call(outsiderTok, `/projects/${canonPrj}/payments/${paymentID}/refund`, 'POST',
  { amount_minor: 10000, reason: 'stranger', idempotency_key: `outsider-${stamp}` });
outsider.status === 404
  ? ok('a non-member gets 404 — the same answer as for a project that does not exist')
  : bad(`non-member got ${outsider.status}; 403 would confirm the project is real`);

const noKey = await call(tok.OWNER, `/projects/${canonPrj}/payments/${paymentID}/refund`, 'POST',
  { amount_minor: 10000, reason: 'sem chave' });
noKey.status === 400
  ? ok('a refund with no idempotency key is refused')
  : bad(`missing idempotency key answered ${noKey.status}`);

const negative = await call(tok.OWNER, `/projects/${canonPrj}/payments/${paymentID}/refund`, 'POST',
  { amount_minor: -1000, reason: 'negativo', idempotency_key: `neg-${stamp}` });
negative.status === 400
  ? ok('a negative refund is refused')
  : bad(`negative amount answered ${negative.status}`);

const ghost = await call(tok.OWNER, `/projects/${canonPrj}/payments/00000000-0000-0000-0000-000000000000/refund`, 'POST',
  { amount_minor: 10000, reason: 'fantasma', idempotency_key: `ghost-${stamp}` });
ghost.status === 404
  ? ok('a payment that does not exist is 404')
  : bad(`unknown payment answered ${ghost.status}`);

const finalBalance = balance();
finalBalance === afterRefund - 50000
  ? ok(`every refusal moved nothing — the account still holds ${finalBalance}`)
  : bad(`a refusal moved money: ${finalBalance}`);

// The ledger is the last word: two refunds, and nothing unbalanced anywhere.
const unbalanced = ssh(`${PRE}
  q "select count(*) from (select p.id from ledger_postings p join ledger_entries e on e.posting_id=p.id
       group by p.id having sum(case e.entry_type when 'DEBIT' then -e.amount_minor else e.amount_minor end) <> 0) x"`).trim();
unbalanced === '0' ? ok('the ledger is still balanced everywhere') : bad(`${unbalanced} unbalanced postings`);

console.log(`\nCONSOLE_REFUND_RBAC: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
