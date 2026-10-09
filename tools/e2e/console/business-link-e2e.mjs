#!/usr/bin/env node
/**
 * Business verified contact and Project link — the deployed security contract.
 *
 * Six Console routes let a developer prove control of a Business contact and
 * bind a Project to a Business (ADR-060 §7/§8):
 *
 *   POST /projects/{id}/financial-setup/contact/start
 *   POST /projects/{id}/financial-setup/create
 *   POST /projects/{id}/financial-onboarding/link-by-handle/start
 *   POST /projects/{id}/financial-onboarding/link-by-handle/confirm
 *   POST /projects/{id}/financial-onboarding/contact/start
 *   POST /projects/{id}/financial-onboarding/contact/confirm
 *
 * They were reachable on the public Sandbox with unit and real-database tests
 * and no evidence from the deployment itself. This asks the deployed services.
 *
 * The positive path links a disposable Project to a REAL Business through that
 * Business's verified contact. The proof of ownership is a code delivered to a
 * mailbox this harness cannot read, by design: it never reads a code from the
 * database, a log or a mailbox. So the run has two phases with a human between:
 *
 *   node tools/e2e/console/business-link-e2e.mjs prepare
 *       every case that needs no code, then asks the product to send ONE
 *       BUSINESS_PROJECT_LINK code to the Business's verified contact
 *   BZ_LINK_CODE=<relayed code> node tools/e2e/console/business-link-e2e.mjs confirm
 *       wrong code, wrong Project, the real link, replay, invariants, cleanup
 *
 * State between the phases (fixture session tokens) lives in a 0600 file under
 * BZ_E2E_STATE_DIR, outside the repository. The evidence artefact carries no
 * code, no token and no full address.
 *
 * Nothing here creates, renames, suspends or retires the Business. The only
 * state it adds is one Project binding, and it gives that back.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { registerCleanup, cleanupRun } from './lib/run-cleanup.mjs';
import { fixtureSession } from './lib/mint.mjs';

const API = process.env.DEV_API ?? 'https://developer-api.banzami.com';
const ORIGIN = process.env.CONSOLE_ORIGIN ?? 'https://developers.banzami.com';
const GATEWAY = process.env.SANDBOX_API ?? 'https://sandbox-api.banzami.com';
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const HANDLE = (process.env.BZ_LINK_HANDLE ?? 'doa').replace(/^@/, '');
const STATE_DIR = process.env.BZ_E2E_STATE_DIR;
const phase = process.argv[2];
if (!['prepare', 'confirm', 'abort'].includes(phase)) {
  console.error('usage: business-link-e2e.mjs prepare | confirm | abort');
  process.exit(2);
}
if (!STATE_DIR) {
  console.error('BZ_E2E_STATE_DIR is required (a private directory outside the repository)');
  process.exit(2);
}
const STATE_FILE = join(STATE_DIR, 'business-link-e2e.state.json');

const SIX = [
  'POST /projects/{projID}/financial-setup/contact/start',
  'POST /projects/{projID}/financial-setup/create',
  'POST /projects/{projID}/financial-onboarding/link-by-handle/start',
  'POST /projects/{projID}/financial-onboarding/link-by-handle/confirm',
  'POST /projects/{projID}/financial-onboarding/contact/start',
  'POST /projects/{projID}/financial-onboarding/contact/confirm',
];
/** [path under /projects/{id}, a body that is well-formed for that route] */
const ROUTES = [
  ['/financial-setup/contact/start', { email: 'nobody@banzami-e2e.test' }],
  ['/financial-setup/create', { use_case: 'STANDARD', desired_handle: 'zz_e2e_never', code: '000000' }],
  ['/financial-onboarding/link-by-handle/start', { handle: HANDLE }],
  ['/financial-onboarding/link-by-handle/confirm', { handle: HANDLE, code: '000000' }],
  ['/financial-onboarding/contact/start', { handle: HANDLE }],
  ['/financial-onboarding/contact/confirm', { handle: HANDLE, code: '000000' }],
];

let matrix = [];
const rec = (id, ok, note = '') => {
  matrix.push({ id, ok: Boolean(ok), note: String(note).slice(0, 200) });
  console.log(`  ${ok ? '✓' : '✗'} ${id}${note ? ` — ${note}` : ''}`);
};
const step = (m) => console.log(`\n${m}`);

/** Read-only SQL through the operator tooling credential. Counts and states only. */
function sql(text) {
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', REMOTE,
    'U=$(cat /root/.banzami/operator_db_url); PG=$(docker ps --format "{{.Names}}" | grep -E "bzsandbox-.*-postgres-1$" | head -1); ' +
    'docker exec -i -e U="$U" "$PG" sh -c \'psql "$U" -v ON_ERROR_STOP=1 -At -f -\''],
    { input: text, encoding: 'utf8', maxBuffer: 1 << 22 });
  return out.trim();
}
const M = `(select owner_id from handle_registry where handle = '${HANDLE.replace(/[^a-z0-9_]/g, '')}' and owner_type = 'MERCHANT')`;
/** What must not move, and the one thing that may. */
function snapshot() {
  const row = sql(`select
      (select status from merchants where id = ${M}),
      (select count(*) from merchants where id = ${M}),
      (select count(*) from wallets where merchant_id = ${M}),
      (select string_agg(left(id::text, 8), ',' order by created_at) from wallets where merchant_id = ${M}),
      (select count(*) from handle_registry where owner_id = ${M}),
      (select count(*) from business_contacts where merchant_id = ${M} and verified_at is not null and revoked_at is null),
      (select count(*) from developer.dev_project_sandbox_binding where merchant_id = ${M} and state = 'ACTIVE'),
      (select count(*) from business_contact_otps where subject_id::text = ${M}::text and consumed_at is null and expires_at > now()),
      (select count(*) from business_link_grants where merchant_id = ${M} and consumed_at is null and expires_at > now()),
      (select count(*) from merchants),
      (select count(*) from wallets);`);
  const [status, businesses, wallets, walletIds, handles, verifiedContacts, activeBindings, liveOtps, liveGrants, allMerchants, allWallets] = row.split('|');
  return { status, businesses: +businesses, wallets: +wallets, walletIds, handles: +handles,
    verifiedContacts: +verifiedContacts, activeBindings: +activeBindings, liveOtps: +liveOtps, liveGrants: +liveGrants,
    allMerchants: +allMerchants, allWallets: +allWallets };
}

async function call(token, method, path, body, { origin = ORIGIN, csrf } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.cookie = `__Host-bz_dev_session=${token}`;
  if (origin) headers.origin = origin;
  if (csrf !== undefined) headers['x-csrf-token'] = csrf;
  const r = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { /* not json */ }
  return { status: r.status, body: j, code: j?.error?.code ?? j?.code ?? null };
}
const as = (who) => ({
  get: (path) => call(who.token, 'GET', path),
  post: (path, body) => call(who.token, 'POST', path, body, { csrf: who.csrf }),
  del: (path, body) => call(who.token, 'DELETE', path, body, { csrf: who.csrf }),
});
const maskOf = (email) => `${email.slice(0, 1)}••••@${email.split('@')[1]}`;
const sameAnswer = (a, b) => a.status === b.status && a.code === b.code;

function saveState(s) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s), { mode: 0o600 });
  chmodSync(STATE_FILE, 0o600);
}

/** Give back what the run made, through the product, then the harness backstop. */
async function giveBack(s) {
  const out = { projects: [], workspaces: [] };
  for (const [who, key, name] of [[s.A, 'p1', s.names.p1], [s.A, 'p2', s.names.p2], [s.B, 'pb', s.names.pb]]) {
    const id = s.ids[key];
    if (!id) continue;
    const r = await as(who).del(`/projects/${id}`, { name });
    out.projects.push(`${key}:${r.status}`);
  }
  for (const [who, key, name] of [[s.A, 'wsA', s.names.wsA], [s.B, 'wsB', s.names.wsB]]) {
    const id = s.ids[key];
    if (!id) continue;
    const r = await as(who).del(`/workspaces/${id}`, { name });
    out.workspaces.push(`${key}:${r.status}`);
  }
  try { cleanupRun({ emailPattern: s.emailPattern, namePattern: s.namePattern }); } catch (e) { out.backstop = String(e.message).slice(0, 120); }
  return out;
}

// ─────────────────────────────────────────────────────────────── prepare ──
if (phase === 'prepare') {
  if (existsSync(STATE_FILE)) {
    console.error(`a run is already waiting for its code (${STATE_FILE}). Run "confirm" or "abort" first.`);
    process.exit(2);
  }
  const stamp = Date.now().toString(36);
  const s = {
    stamp, startedAt: new Date().toISOString(), handle: HANDLE,
    emailPattern: `bizlink-%${stamp}@banzami-e2e.test`, namePattern: `bizlink-%${stamp}`,
    names: { wsA: `bizlink-a-${stamp}`, wsB: `bizlink-b-${stamp}`, p1: `bizlink-p1-${stamp}`, p2: `bizlink-p2-${stamp}`, pb: `bizlink-pb-${stamp}` },
    ids: {}, matrix: [],
  };
  // registerCleanup gives everything back when the process exits — right for a
  // one-phase suite, wrong here: a successful prepare must leave its Projects
  // alive for the human to relay the code. So this phase gives back on every
  // exit EXCEPT the one where it is deliberately waiting.
  let waiting = false;
  process.on('exit', () => { if (!waiting) { try { cleanupRun({ emailPattern: s.emailPattern, namePattern: s.namePattern }); } catch { /* reported by confirm/abort */ } } });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

  step('the deployment under test');
  const health = await (await fetch(`${GATEWAY}/readyz`)).json().catch(() => ({}));
  s.deployed = { gateway_build: health.build ?? 'unknown', environment: health.environment ?? 'unknown' };
  rec('BIZLINK.env-sandbox', s.deployed.environment === 'sandbox', `gateway reports environment=${s.deployed.environment}`);

  step('baseline of the Business (read-only)');
  s.before = snapshot();
  rec('BIZLINK.target-active-with-verified-contact',
    s.before.status === 'ACTIVE' && s.before.businesses === 1 && s.before.verifiedContacts >= 1,
    `@${HANDLE} ${s.before.status}, verified contacts ${s.before.verifiedContacts}, wallets ${s.before.wallets}, active bindings ${s.before.activeBindings}`);

  step('two controlled accounts, each with its own workspace and Project');
  s.A = fixtureSession(`bizlink-a-${stamp}@banzami-e2e.test`);
  s.B = fixtureSession(`bizlink-b-${stamp}@banzami-e2e.test`);
  s.ids.wsA = (await as(s.A).post('/workspaces', { name: s.names.wsA })).body?.id;
  s.ids.wsB = (await as(s.B).post('/workspaces', { name: s.names.wsB })).body?.id;
  s.ids.p1 = (await as(s.A).post(`/workspaces/${s.ids.wsA}/projects`, { name: s.names.p1 })).body?.id;
  s.ids.p2 = (await as(s.A).post(`/workspaces/${s.ids.wsA}/projects`, { name: s.names.p2 })).body?.id;
  s.ids.pb = (await as(s.B).post(`/workspaces/${s.ids.wsB}/projects`, { name: s.names.pb })).body?.id;
  saveState({ ...s, matrix });
  rec('BIZLINK.fixtures', s.ids.p1 && s.ids.p2 && s.ids.pb, 'two workspaces, three Projects');
  if (!(s.ids.p1 && s.ids.p2 && s.ids.pb)) { await giveBack(s); rmSync(STATE_FILE, { force: true }); process.exit(1); }

  step('A. no session → refused, on all six');
  for (const [path, body] of ROUTES) {
    const r = await call(null, 'POST', `/projects/${s.ids.p1}${path}`, body, { csrf: 'x' });
    rec(`BIZLINK.unauth${path.replace(/\//g, '.')}`, r.status === 401, `HTTP ${r.status}`);
  }

  step('B. Origin and CSRF → refused before the handler, on all six');
  for (const [path, body] of ROUTES) {
    const evil = await call(s.A.token, 'POST', `/projects/${s.ids.p1}${path}`, body, { origin: 'https://evil.example', csrf: s.A.csrf });
    const noTok = await call(s.A.token, 'POST', `/projects/${s.ids.p1}${path}`, body, {});
    const badTok = await call(s.A.token, 'POST', `/projects/${s.ids.p1}${path}`, body, { csrf: s.B.csrf });
    rec(`BIZLINK.csrf${path.replace(/\//g, '.')}`,
      evil.status === 403 && noTok.status === 403 && badTok.status === 403,
      `foreign origin ${evil.status}, no token ${noTok.status}, another session's token ${badTok.status}`);
  }

  step('C/D. another tenant\'s Project → refused, and indistinguishable from one that does not exist');
  const ghost = '00000000-0000-4000-8000-000000000000';
  for (const [path, body] of ROUTES) {
    const foreign = await as(s.B).post(`/projects/${s.ids.p1}${path}`, body);
    const missing = await as(s.B).post(`/projects/${ghost}${path}`, body);
    rec(`BIZLINK.cross-project${path.replace(/\//g, '.')}`,
      foreign.status >= 400 && foreign.status < 500 && foreign.status !== 400 && sameAnswer(foreign, missing),
      `foreign ${foreign.status} ${foreign.code ?? ''} = nonexistent ${missing.status} ${missing.code ?? ''}`);
  }

  step('handles: malformed and unknown answer the same neutral way');
  const unknown = await as(s.A).post(`/projects/${s.ids.p1}/financial-onboarding/link-by-handle/start`, { handle: `zz_nobody_${stamp}` });
  for (const [label, h] of [['traversal', '../../etc/passwd'], ['empty', ''], ['unicode', 'dоa'], ['overlong', 'a'.repeat(300)]]) {
    const r = await as(s.A).post(`/projects/${s.ids.p1}/financial-onboarding/link-by-handle/start`, { handle: h });
    rec(`BIZLINK.handle-neutral.${label}`, sameAnswer(r, unknown) && r.status === 404 && !r.body?.masked_email,
      `${r.status} ${r.code ?? ''} (unknown handle: ${unknown.status} ${unknown.code ?? ''})`);
  }
  const enrolUnknown = await as(s.A).post(`/projects/${s.ids.p1}/financial-onboarding/contact/start`, { handle: `zz_nobody_${stamp}` });
  rec('BIZLINK.enrolment-unknown-handle-neutral', enrolUnknown.status === 404 && !enrolUnknown.body?.masked_email, `${enrolUnknown.status} ${enrolUnknown.code ?? ''}`);

  step('codes that were never issued are refused');
  const noLink = await as(s.A).post(`/projects/${s.ids.p1}/financial-onboarding/link-by-handle/confirm`, { handle: HANDLE, code: '000000' });
  rec('BIZLINK.link-confirm-without-challenge', noLink.status === 400 && noLink.code === 'INVALID_CODE', `${noLink.status} ${noLink.code ?? ''}`);
  const noEnrol = await as(s.A).post(`/projects/${s.ids.p1}/financial-onboarding/contact/confirm`, { handle: HANDLE, code: '000000' });
  rec('BIZLINK.enrolment-confirm-without-challenge', noEnrol.status === 400 && noEnrol.code === 'INVALID_CODE', `${noEnrol.status} ${noEnrol.code ?? ''}`);
  const noCreate = await as(s.A).post(`/projects/${s.ids.p1}/financial-setup/create`, { use_case: 'STANDARD', desired_handle: `zz_e2e_${stamp}`, code: '000000' });
  rec('BIZLINK.create-without-verified-contact', noCreate.status >= 400 && noCreate.status < 500, `${noCreate.status} ${noCreate.code ?? ''}`);
  const afterNoCreate = snapshot();
  rec('BIZLINK.create-refusal-created-nothing', afterNoCreate.allMerchants === s.before.allMerchants && afterNoCreate.allWallets === s.before.allWallets,
    `Businesses ${s.before.allMerchants}→${afterNoCreate.allMerchants}, wallets ${s.before.allWallets}→${afterNoCreate.allWallets}`);
  // Path A is the one route that takes an address, and rightly: it is the
  // contact the developer chooses for a Business that does not exist yet. What
  // matters is that asking creates nothing — no Business, no wallet, no @banza —
  // until the code sent there is presented.
  const ownContact = await as(s.A).post(`/projects/${s.ids.p1}/financial-setup/contact/start`, { email: `bizlink-a-${stamp}@banzami-e2e.test` });
  const afterOwnContact = snapshot();
  rec('BIZLINK.new-business-contact-start-creates-nothing',
    ownContact.status === 200 && afterOwnContact.allMerchants === s.before.allMerchants && afterOwnContact.allWallets === s.before.allWallets,
    `HTTP ${ownContact.status}; Businesses ${s.before.allMerchants}→${afterOwnContact.allMerchants}, wallets ${s.before.allWallets}→${afterOwnContact.allWallets}`);
  const junkContact = await as(s.A).post(`/projects/${s.ids.p1}/financial-setup/contact/start`, { email: 'not-an-address' });
  rec('BIZLINK.contact-start-rejects-malformed-address', junkContact.status >= 400 && junkContact.status < 500, `${junkContact.status} ${junkContact.code ?? ''}`);

  step('E/F. the link code goes to the verified server-side contact, whatever the request says');
  const attacker = `attacker-${stamp}@evil.example`;
  const start = await as(s.A).post(`/projects/${s.ids.p1}/financial-onboarding/link-by-handle/start`,
    { handle: HANDLE, email: attacker, contact: attacker, to: attacker });
  const masked = start.body?.masked_email ?? '';
  s.maskedContact = masked;
  rec('BIZLINK.link-start-uses-verified-contact',
    start.status === 200 && start.body?.needs_contact === false && masked !== '' && masked !== maskOf(attacker) && !masked.includes('evil.example'),
    `HTTP ${start.status}, sent to ${masked || '(none)'}; request-supplied address ignored`);
  rec('BIZLINK.contact-is-masked', /^.••••@[^@\s]+$/.test(masked), 'only the first character and the domain are disclosed');
  const mid = snapshot();
  rec('BIZLINK.start-binds-nothing', mid.activeBindings === s.before.activeBindings && mid.liveOtps === s.before.liveOtps + 1,
    `active bindings ${mid.activeBindings}, live codes ${s.before.liveOtps}→${mid.liveOtps}`);

  s.matrix = matrix;
  s.codeRequestedAt = new Date().toISOString();
  saveState(s);
  const failed = matrix.filter((m) => !m.ok).length;
  console.log(`\nprepare: ${matrix.length - failed}/${matrix.length} passed`);
  if (start.status !== 200 || !masked) {
    console.error('the link code was not sent; giving the fixtures back.');
    await giveBack(s); rmSync(STATE_FILE, { force: true });
    process.exit(1);
  }
  waiting = true;
  console.log(`\nOTP REQUIRED: BUSINESS_PROJECT_LINK — a code was sent to @${HANDLE}'s verified contact (${masked}).`);
  console.log('Then: BZ_LINK_CODE=<code> node tools/e2e/console/business-link-e2e.mjs confirm');
  process.exit(failed === 0 ? 0 : 1);
}

// ───────────────────────────────────────────────────────── confirm / abort ──
if (!existsSync(STATE_FILE)) { console.error('no run is waiting; run "prepare" first'); process.exit(2); }
const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
matrix = s.matrix ?? [];
registerCleanup({ emailPattern: s.emailPattern, namePattern: s.namePattern });

if (phase === 'abort') {
  const back = await giveBack(s);
  rmSync(STATE_FILE, { force: true });
  console.log(`aborted; fixtures given back (${JSON.stringify(back)})`);
  process.exit(0);
}

const real = (process.env.BZ_LINK_CODE ?? '').trim();
if (!/^\d{4,8}$/.test(real)) { console.error('BZ_LINK_CODE must be the relayed numeric code'); process.exit(2); }
// A wrong code that differs from the real one in every digit, so it can never be right by accident.
const wrong = real.split('').map((d) => String((Number(d) + 5) % 10)).join('');
const linkPath = (p) => `/projects/${p}/financial-onboarding/link-by-handle/confirm`;

// A prepare phase run before this case was corrected observed the request (HTTP
// 200) but judged it against the wrong expectation; its effect is judged here.
if (s.pending_recheck === 'BIZLINK.new-business-contact-start-creates-nothing') {
  const now = snapshot();
  rec(s.pending_recheck, now.allMerchants === s.before.allMerchants && now.allWallets === s.before.allWallets,
    `HTTP 200 at prepare; Businesses ${s.before.allMerchants}→${now.allMerchants}, wallets ${s.before.allWallets}→${now.allWallets}`);
}

step('H. a wrong code is refused and links nothing');
const w = await as(s.A).post(linkPath(s.ids.p1), { handle: HANDLE, code: wrong });
const afterWrong = snapshot();
rec('BIZLINK.wrong-code-rejected', w.status === 400 && w.code === 'INVALID_CODE' && afterWrong.activeBindings === s.before.activeBindings,
  `${w.status} ${w.code ?? ''}, active bindings still ${afterWrong.activeBindings}`);

step('K. the real code, presented for a different Project → refused (the challenge is bound to the Project that asked)');
const otherProject = await as(s.A).post(linkPath(s.ids.p2), { handle: HANDLE, code: real });
const otherTenant = await as(s.B).post(linkPath(s.ids.pb), { handle: HANDLE, code: real });
const afterOther = snapshot();
rec('BIZLINK.code-bound-to-project',
  otherProject.status === 400 && otherTenant.status === 400 && afterOther.activeBindings === s.before.activeBindings,
  `same workspace, other Project ${otherProject.status} ${otherProject.code ?? ''}; other tenant ${otherTenant.status} ${otherTenant.code ?? ''}; bindings ${afterOther.activeBindings}`);

step('M. the standalone owner links the Project with the real code');
const ok = await as(s.A).post(linkPath(s.ids.p1), { handle: HANDLE, code: real });
rec('BIZLINK.positive-link', ok.status === 200, `HTTP ${ok.status} ${ok.code ?? ''}`);

step('N. the same Business — nothing new, one more binding');
const linked = snapshot();
rec('BIZLINK.same-business-no-duplicates',
  linked.businesses === 1 && linked.allMerchants === s.before.allMerchants
  && linked.wallets === s.before.wallets && linked.walletIds === s.before.walletIds && linked.allWallets === s.before.allWallets
  && linked.handles === s.before.handles && linked.verifiedContacts === s.before.verifiedContacts,
  `Businesses ${s.before.allMerchants}→${linked.allMerchants}, wallets ${s.before.allWallets}→${linked.allWallets}, handles ${s.before.handles}→${linked.handles}, verified contacts ${s.before.verifiedContacts}→${linked.verifiedContacts}`);
rec('BIZLINK.binding-plus-one', linked.activeBindings === s.before.activeBindings + 1, `active bindings ${s.before.activeBindings}→${linked.activeBindings}`);
rec('BIZLINK.code-and-grant-spent', linked.liveOtps === s.before.liveOtps && linked.liveGrants === s.before.liveGrants,
  `live codes ${linked.liveOtps}, live grants ${linked.liveGrants}`);
const boundRow = sql(`select b.environment, (b.merchant_id = ${M}), (b.wallet_id in (select id from wallets where merchant_id = ${M}))
  from developer.dev_project_sandbox_binding b where b.project_id = '${s.ids.p1}' and b.state = 'ACTIVE';`).split('|');
rec('BIZLINK.binding-is-sandbox-and-names-the-business', /sandbox/i.test(boundRow[0] ?? '') && boundRow[1] === 't' && boundRow[2] === 't',
  `environment=${boundRow[0]}, merchant matches=${boundRow[1]}, wallet is the Business's=${boundRow[2]}`);

step('the link persists on a fresh read');
const setup = await as(s.A).get(`/projects/${s.ids.p1}/financial-setup`);
const setupText = JSON.stringify(setup.body ?? {}).toLowerCase();
rec('BIZLINK.readback-shows-the-business', setup.status === 200 && setupText.includes(HANDLE), `GET financial-setup ${setup.status}, names @${HANDLE}`);
const foreignRead = await as(s.B).get(`/projects/${s.ids.p1}/financial-setup`);
rec('BIZLINK.readback-not-for-another-tenant', foreignRead.status >= 400, `another tenant: ${foreignRead.status}`);

step('I. the spent code cannot be used again');
const replayOther = await as(s.A).post(linkPath(s.ids.p2), { handle: HANDLE, code: real });
const replayTenant = await as(s.B).post(linkPath(s.ids.pb), { handle: HANDLE, code: real });
const afterReplay = snapshot();
rec('BIZLINK.code-replay-rejected',
  replayOther.status === 400 && replayTenant.status === 400 && afterReplay.activeBindings === linked.activeBindings,
  `other Project ${replayOther.status} ${replayOther.code ?? ''}; other tenant ${replayTenant.status} ${replayTenant.code ?? ''}; bindings unchanged at ${afterReplay.activeBindings}`);
const again = await as(s.A).post(`/projects/${s.ids.p1}/financial-onboarding/link-by-handle/start`, { handle: HANDLE });
rec('BIZLINK.bound-project-cannot-start-another-link', again.status === 409, `${again.status} ${again.code ?? ''}`);

step('cleanup through the product, then the Business is as it was');
const back = await giveBack(s);
const after = snapshot();
rec('BIZLINK.cleanup-business-untouched',
  after.status === 'ACTIVE' && after.businesses === 1 && after.wallets === s.before.wallets && after.walletIds === s.before.walletIds
  && after.handles === s.before.handles && after.verifiedContacts === s.before.verifiedContacts,
  `@${HANDLE} ${after.status}; wallets ${after.wallets}; handles ${after.handles}; verified contacts ${after.verifiedContacts}`);
rec('BIZLINK.cleanup-no-temporary-binding', after.activeBindings === s.before.activeBindings, `active bindings back to ${after.activeBindings}`);
rec('BIZLINK.cleanup-no-live-code-or-grant', after.liveOtps === 0 && after.liveGrants === 0, `live codes ${after.liveOtps}, live grants ${after.liveGrants}`);
rmSync(STATE_FILE, { force: true });

// ── evidence ────────────────────────────────────────────────────────────────
const failed = matrix.filter((m) => !m.ok).length;
const stampSec = Math.floor(Date.now() / 1000);
const repo = new URL('../../../', import.meta.url).pathname;
const head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const revisions = execFileSync('ssh', ['-o', 'BatchMode=yes', REMOTE,
  'for n in $(docker ps --format "{{.Names}}" | grep -E "developer-api|api-gateway-staging|core-api-staging"); do ' +
  'echo "$(echo $n | sed -E "s/^bzsandbox-[0-9-]+-//")=$(docker inspect "$n" --format "{{.Config.Image}}" | sed -E "s/.*://")"; done'],
  { encoding: 'utf8' }).trim().split('\n');
const evidence = {
  programme: 'BANZAMI pre-release security closure — Business verified contact and Project link (ADR-060 §7/§8)',
  test: 'tools/e2e/console/business-link-e2e.mjs',
  date_stamp: String(stampSec),
  started_at: s.startedAt, code_requested_at: s.codeRequestedAt, finished_at: new Date().toISOString(),
  environment: s.deployed.environment,
  console_host: ORIGIN, api_host: API,
  source_head: head,
  deployed_revisions: revisions,
  routes_covered: SIX,
  target_business: `@${HANDLE} (existing, KYB-approved, not created or altered by this run)`,
  verified_contact_masked: s.maskedContact,
  otp_delivery: 'real delivery to the Business\'s verified contact; the code was relayed by the owner — never read from a database, a log or a mailbox, and not recorded here',
  fixture_namespace: `bizlink-*-${s.stamp}@banzami-e2e.test`,
  not_exercised: [
    'positive Path A (financial-setup/contact/start → create): it would create a second real Business against a real mailbox; proved by negatives here and by services/developer-api + services/api-gateway tests',
    'positive BUSINESS_CONTACT_VERIFY enrolment: the target already has a verified contact, so enrolment was correctly not needed; refusals proved here',
    'grant replay and cross-Business grant: the grant never leaves the server, so a client cannot present one; proved by TestBusinessContact_CrossProjectGrantRejected and the grant single-use tests (real database)',
  ],
  corrections: s.corrections ?? [],
  invariants: { before: s.before, after_cleanup: after },
  cleanup: back,
  total: matrix.length, passed: matrix.length - failed, failed,
  matrix,
};
const dir = join(repo, 'evidence/assurance/business-link');
mkdirSync(dir, { recursive: true });
const file = join(dir, `e2e-${stampSec}.json`);
writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`\n${matrix.length - failed}/${matrix.length} passed · evidence: evidence/assurance/business-link/e2e-${stampSec}.json`);
process.exit(failed === 0 ? 0 : 1);
