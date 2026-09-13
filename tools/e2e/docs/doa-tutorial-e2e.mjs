#!/usr/bin/env node
/**
 * The DOA tutorial, followed by an engineer who has never seen DOA and has only
 * the public page — DOCS-PROD-001 §46.
 *
 * DOA may be special as an application. It must never be special as a Banzami
 * tenant. So this does not touch DOA at all: it builds a FRESH equivalent — a
 * new developer, workspace, project and Business, applied for and reviewed like
 * any other — and does, step by step, only what /docs/doa tells a reader to do.
 * Nothing here names DOA's tenant, key, account or handle, and nothing could.
 *
 * Two things are checked at every step, and both must hold:
 *
 *   1. THE PAGE SAYS IT. Each step names what the published tutorial must teach
 *      for a reader to be able to do it — the method, the scope, the field, the
 *      event — in Portuguese AND English. If the page does not say it, the step
 *      fails with "the page does not tell the reader", even if the API would
 *      have allowed it. That is how a documentation gap shows up here.
 *   2. IT WORKS. The step is then performed against the deployed Sandbox with
 *      @banzami/sdk from the public registry, in an empty directory.
 *
 * Rules (§46): fresh fixture; no DOA branch; no database write; no private
 * endpoint; no unpublished SDK; no invented credentials. Operator review is the
 * canonical BANZADMIN workflow, done by a person. Residue is measured, read-only.
 *
 *   node tools/e2e/docs/doa-tutorial-e2e.mjs prepare    # 1–4, submits the application
 *   … the application is reviewed in BANZADMIN …
 *   node tools/e2e/docs/doa-tutorial-e2e.mjs complete   # 2 again, 5–13, cleanup
 *   node tools/e2e/docs/doa-tutorial-e2e.mjs contract   # page checks only, no Sandbox writes
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';
import { mintSession } from '../console/lib/mint.mjs';
import {
  CONSUMER, DOCS, GW, consoleCaller, journey, readDeployedPage, runInReaderDir,
  sandboxCount, sinkConfigure, sinkRequests, uploadDueDocuments,
} from './lib/journey.mjs';

const STATE = join(tmpdir(), 'banzami-docs-doa-tutorial.json');

// ── the rubric: the tutorial's own stages, in its order ─────────────────────

export const RUBRIC = [
  'Sign in, create a workspace and a project',
  'Financial Setup — a Business applied for and reviewed',
  'Secret key with exactly the scopes the tutorial lists',
  'Install the SDK the tutorial names',
  'Readiness gate: getFinancialSetup before activating a campaign',
  'One account per campaign: createWalletAccount',
  'Register the webhook endpoint; its secret appears once',
  'A donation session bound to the campaign account',
  'The donor pays on pay.banzami.com; the server reads PAID',
  'The webhook, handled as the tutorial shows',
  'The donor receipt verifies publicly',
  'Settlement: gross from the balance, fee and net reconcile, idempotent',
  'Rotate credentials: webhook secret and key; the old key answers 401',
];

/**
 * What the published tutorial must teach for each step. Every pattern must be
 * found in BOTH languages. `never` lists things the page must not teach — the
 * three nonexistent SDK calls and the wrong payload field it once did.
 */
export const CONTRACT = {
  1: { needs: [/workspace/i, /projeto|project/i, /Consola|Console/] },
  2: { needs: [/configura[çc][ãa]o financeira|financial setup/i, /candidat|apply for/i, /c[óo]digo de consentimento|consent code/i] },
  3: {
    needs: [/identity:read/, /wallet_accounts:create/, /wallet_accounts:read/, /payment_sessions:write/, /payment_sessions:read/, /webhooks:write/, /webhooks:read/, /application_settlements:write/],
  },
  4: { needs: [/npm install @banzami\/sdk/] },
  5: { needs: [/getFinancialSetup\(\)/] },
  6: { needs: [/createWalletAccount\(/, /purpose:\s*'CAMPAIGN'/, /referenceId:/], never: [/walletAccounts\.create/] },
  7: { needs: [/BANZAMI_WEBHOOK_SECRET/, /uma vez|once/i] },
  8: { needs: [/createPaymentSession|sess[ãa]o|session/i, /pay\.banzami\.com\/pay\//] },
  9: { needs: [/pay\.banzami\.com/, /lendo a sess[ãa]o|reading the session|getPaymentSession|webhook/i] },
  10: {
    needs: [/req\.text\(\)/, /webhooks\.constructEvent\(/, /banza-signature/, /(?:evento|event)\.id/, /payment_session\.paid/, /\.data\.reference_id/],
    never: [/webhooks\.verify\(/, /\.data\.reference\b(?!_)/, /JSON\.parse\(raw\)\s*;?\s*\n[^\n]*constructEvent/],
  },
  11: { needs: [/\/v1\/public\/proofs\//, /BZM-/, /banzami\.com\/r\//] },
  12: {
    needs: [/createBusinessApplicationSettlement\(/, /sourceAccountId/, /beneficiaryBanzaName/, /idempotencyKey/, /feeDestinationBanzaName/, /gross_amount_minor/, /application_fee_minor/, /net_amount_minor/],
    never: [/applicationSettlements\.create/, /applicationFeeBps|application_fee_bps/],
  },
  13: { needs: [/rotateWebhookEndpointSecret/, /revog|revoke/i, /401/] },
};

/** Judge one step against both deployed languages. */
export function checkContract(n, pages) {
  const c = CONTRACT[n];
  const problems = [];
  for (const [lang, text] of Object.entries(pages)) {
    for (const re of c.needs) if (!re.test(text)) problems.push(`${lang} does not say ${re}`);
    for (const re of c.never ?? []) if (re.test(text)) problems.push(`${lang} teaches ${re}, which is wrong`);
  }
  return problems;
}

const J = journey(RUBRIC);
const mark = J.mark;

/** Page first, then the Sandbox. A step the page cannot teach fails before it is attempted. */
function pageSays(n, pages) {
  const problems = checkContract(n, pages);
  if (problems.length) {
    mark(n, 'FAIL', `the page does not tell the reader: ${problems.slice(0, 3).join('; ')}`);
    return false;
  }
  return true;
}

const saveState = (s) => writeFileSync(STATE, `${JSON.stringify({ ...s, steps: J.steps }, null, 2)}\n`);
const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null);

async function readTutorial() {
  return { PT: await readDeployedPage('/docs/doa'), EN: await readDeployedPage('/docs/en/doa') };
}

const sdkClient = (sdk, extra = '') => `import { BanzamiClient } from '${sdk}';\n`
  + `const c = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY, environment: 'sandbox'${extra} });\n`;

// ── prepare ──────────────────────────────────────────────────────────────────

async function prepare() {
  console.log(`DOA tutorial — prepare · ${DOCS}/docs/doa\n`);
  const pages = await readTutorial();
  const stamp = Date.now().toString(36);
  const identity = `e2e-docs-doa-${stamp}@banzami-e2e.test`;
  const state = { stamp, identity, created: {} };

  if (pageSays(1, pages)) {
    try {
      state.token = mintSession(identity);
      const call = consoleCaller(state.token);
      const ws = await call('/workspaces', 'POST', { name: `docs-doa-${stamp}` });
      const pr = ws.status === 201 ? await call(`/workspaces/${ws.body.id}/projects`, 'POST', { name: `docs-doa-${stamp}` }) : null;
      state.created.workspace = ws.body?.id;
      state.created.workspaceName = `docs-doa-${stamp}`;
      state.created.project = pr?.body?.id;
      state.created.projectName = `docs-doa-${stamp}`;
      pr?.status === 201 ? mark(1, 'PASS', `workspace ${ws.body.id}, project ${pr.body.id}`) : mark(1, 'FAIL', `workspace http ${ws.status}, project http ${pr?.status}`);
    } catch (e) {
      mark(1, 'FAIL', String(e.message).slice(0, 140));
    }
  }
  const call = state.token ? consoleCaller(state.token) : null;

  if (J.verdict(1) === 'PASS' && pageSays(2, pages)) {
    const app = await call(`/projects/${state.created.project}/financial-onboarding/applications`, 'POST', {
      desired_handle: `doatut${stamp}`,
      business_name: `Docs DOA Tutorial ${stamp}`,
      category: 'donations',
      email: identity, phone: '+244900000000', nif: `5${stamp.replace(/\D/g, '').padEnd(9, '1').slice(0, 9)}`,
      province: 'Luanda', municipality: 'Luanda', address: 'Rua de Teste, 2',
      legal_representative: 'Tutorial Reader', representative_role: 'Director',
      business_activity: 'Sandbox fixture for the public DOA reference tutorial (donation platform pattern)',
      terms_accepted: true, idempotency_key: `idem_docs_doa_${stamp}`,
    });
    if (app.status === 201) {
      state.created.application = app.body?.application_id;
      state.created.handle = `doatut${stamp}`;
      const due = (await call(`/projects/${state.created.project}/financial-setup`)).body?.onboarding?.application?.requirements?.currently_due ?? [];
      const up = await uploadDueDocuments(app.body.application_id, due, 'Banzami public DOA tutorial');
      const still = ((await call(`/projects/${state.created.project}/financial-setup`)).body?.onboarding?.application?.requirements?.currently_due ?? []).filter((x) => x.kind === 'document');
      up.failed.length || still.length
        ? mark(2, 'FAIL', `documents could not be supplied: ${[...up.failed, ...still.map((x) => `${x.code} still due`)].join('; ')}`)
        : mark(2, 'PENDING', `application ${app.body.application_id} (@doatut${stamp}) submitted with ${up.done.join(', ')} — awaiting operator review`);
    } else {
      mark(2, 'FAIL', `the application was refused: http ${app.status} ${JSON.stringify(app.body)?.slice(0, 120)}`);
    }
  }

  // Step 3 — the scopes are READ FROM THE PAGE, not written here, so a page that
  // lists the wrong set produces a key that cannot do the tutorial.
  if (J.verdict(1) === 'PASS' && pageSays(3, pages)) {
    // Every scope-shaped token on the page — so an extra scope the page asks
    // for is granted, and a missing one is missing. Both languages must agree.
    const scopeSet = (t) => [...new Set(t.match(/\b[a-z_]+:(?:read|write|create)\b/g) ?? [])].sort();
    const scopes = scopeSet(pages.PT);
    if (scopeSet(pages.EN).join() !== scopes.join()) {
      mark(3, 'FAIL', `the two languages list different scopes: PT ${scopes.join(',')} · EN ${scopeSet(pages.EN).join(',')}`);
      saveState(state);
      return finish(state, 'prepare');
    }
    const key = await call(`/projects/${state.created.project}/keys`, 'POST', { kind: 'SECRET', name: `docs-doa-${stamp}`, scopes });
    const secret = key.body?.secret ?? key.body?.key?.secret;
    state.created.keyId = key.body?.key?.id ?? key.body?.id;
    state.secret = secret;
    state.scopes = scopes;
    secret ? mark(3, 'PASS', `${scopes.length} scopes, read from the page: ${scopes.join(', ')}`) : mark(3, 'FAIL', `http ${key.status} ${JSON.stringify(key.body)?.slice(0, 100)}`);
  }

  if (pageSays(4, pages)) {
    const dir = mkdtempSync(join(tmpdir(), 'bz-docs-doa-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'doa-tutorial-reader', private: true, type: 'module' }, null, 2));
    try {
      execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund', '@banzami/sdk'], { cwd: dir, stdio: 'pipe', timeout: 300000 });
      const version = JSON.parse(readFileSync(join(dir, 'node_modules/@banzami/sdk/package.json'), 'utf8')).version;
      state.readerDir = dir;
      state.sdk = { name: '@banzami/sdk', version };
      // Every SDK method the tutorial names must exist in what was installed.
      const named = [...new Set(Object.values(pages).join('\n').match(/\b(create\w+|get\w+|rotate\w+|constructEvent)\(/g)?.map((m) => m.slice(0, -1)) ?? [])];
      const exists = runInReaderDir(dir, `${sdkClient('@banzami/sdk')}const names = ${JSON.stringify(named)};\n`
        + `console.log(JSON.stringify(names.map((n) => [n, typeof c[n] === 'function' || typeof c.webhooks?.[n] === 'function'])));\n`, { BANZAMI_API_KEY: 'bz_test_sk_placeholder_for_introspection' });
      const missing = exists.filter(([, ok]) => !ok).map(([n]) => n).filter((n) => !/^(getTime|getItem|get)$/.test(n));
      missing.length
        ? mark(4, 'FAIL', `the page names SDK methods @banzami/sdk@${version} does not have: ${missing.join(', ')}`)
        : mark(4, 'PASS', `@banzami/sdk@${version} from the registry; all ${named.length} methods the page names exist`);
    } catch (e) {
      mark(4, 'FAIL', String(e.stderr ?? e.message).slice(0, 160));
    }
  }

  saveState(state);
  return finish(state, 'prepare');
}

// ── complete ─────────────────────────────────────────────────────────────────

async function complete() {
  const state = loadState();
  if (!state) { console.error(`no prepared run at ${STATE} — run "prepare" first`); process.exit(2); }
  J.restore(state.steps);
  console.log(`DOA tutorial — complete · ${state.identity}\n`);
  const pages = await readTutorial();
  const call = consoleCaller(state.token);
  const sdk = state.sdk?.name ?? '@banzami/sdk';
  const env = { BANZAMI_API_KEY: state.secret };
  const read = (source, extraEnv = {}) => runInReaderDir(state.readerDir, source, { ...env, ...extraEnv });

  // 2, re-asked through the Console the reader has.
  const fs = await call(`/projects/${state.created.project}/financial-setup`);
  // READY or SEALED are the Console's only receiving states (developer-api financial_setup.go).
  const ready = fs.status === 200 && ['READY', 'SEALED'].includes(fs.body?.state);
  ready ? mark(2, 'PASS', `financial setup ${fs.body.state}`) : mark(2, 'FAIL', `not ready: ${fs.body?.state ?? fs.status}`);

  // 5 — the readiness gate the tutorial asks for, through the SDK.
  if (pageSays(5, pages)) {
    try {
      const r = read(`${sdkClient(sdk)}console.log(JSON.stringify(await c.getFinancialSetup()));\n`);
      const canReceive = ['READY', 'SEALED'].includes(r?.financial_setup?.state) && r?.wallet?.ready === true;
      state.settlementReadiness = { ready: r?.settlement?.ready, blockers: (r?.settlement?.blockers ?? []).map((b) => b.code ?? b), fee_required: r?.fee_destination?.required };
      canReceive
        ? mark(5, 'PASS', `getFinancialSetup() → ${r.financial_setup.state}, wallet ready; settlement ${r.settlement?.ready ? 'ready' : `blocked by ${state.settlementReadiness.blockers.join(', ')}`}`)
        : mark(5, 'FAIL', `getFinancialSetup() → ${JSON.stringify({ fs: r?.financial_setup, wallet: r?.wallet }).slice(0, 140)}`);
    } catch (e) { mark(5, 'FAIL', String(e.stderr ?? e.message).slice(0, 140)); }
  }

  const campaignId = `camp_${state.stamp}`;
  if (J.verdict(5) === 'PASS' && pageSays(6, pages)) {
    try {
      const acc = read(`${sdkClient(sdk)}const a = await c.createWalletAccount({ purpose: 'CAMPAIGN', referenceType: 'CAMPANHA', referenceId: '${campaignId}', label: 'Campanha do tutorial' });\nconsole.log(JSON.stringify(a));\n`);
      state.created.account = acc?.id;
      acc?.id && acc.purpose === 'CAMPAIGN' && acc.reference_id === campaignId
        ? mark(6, 'PASS', `account ${acc.id}, CAMPAIGN, reference_id returned unchanged`)
        : mark(6, 'FAIL', JSON.stringify(acc).slice(0, 140));
    } catch (e) { mark(6, 'FAIL', String(e.stderr ?? e.message).slice(0, 140)); }
  } else if (J.verdict(6) === 'NOT_RUN') mark(6, 'NOT_RUN', 'blocked by readiness');

  const cap = `doa${state.stamp}${Math.random().toString(36).slice(2, 10)}`;
  if (J.verdict(5) === 'PASS' && pageSays(7, pages)) {
    try {
      sinkConfigure(cap);
      const ep = read(`${sdkClient(sdk)}const ep = await c.createWebhookEndpoint({ url: 'https://sandbox-webhook.banzami.com/receive/${cap}', events: ['payment_session.paid', 'application_settlement.completed'] });\n`
        + `const again = (await c.listWebhookEndpoints?.())?.data?.find?.((e) => e.id === ep.id);\n`
        + `console.log(JSON.stringify({ id: ep.id, secret: ep.secret, secretOnRead: again ? Boolean(again.secret) : null }));\n`);
      state.created.endpoint = ep.id;
      state.webhookSecret = ep.secret;
      ep.secret && ep.secretOnRead !== true
        ? mark(7, 'PASS', `endpoint ${ep.id}; secret returned on registration${ep.secretOnRead === false ? ', absent on a later read' : ''}`)
        : mark(7, 'FAIL', `secret on registration: ${Boolean(ep.secret)}, on read: ${ep.secretOnRead}`);
    } catch (e) { mark(7, 'FAIL', String(e.stderr ?? e.message).slice(0, 140)); }
  }

  const AMOUNT = 250000;
  let session = null;
  if (state.created.account && pageSays(8, pages)) {
    try {
      session = read(`${sdkClient(sdk)}const s = await c.createPaymentSession({ walletAccountId: '${state.created.account}', purpose: 'DONATION', referenceType: 'DOACAO', referenceId: 'doacao_${state.stamp}', amountMinor: ${AMOUNT}, currency: 'AOA', description: 'Doação do tutorial' });\n`
        + `console.log(JSON.stringify({ ...s, link: c.paymentSessionInterface(s, 'PAYMENT_LINK')?.value ?? null }));\n`);
      state.created.session = session?.session_id;
      session?.wallet_account_id === state.created.account && /^https:\/\/pay\.banzami\.com\/pay\//.test(session.link ?? '')
        ? mark(8, 'PASS', `session ${session.session_id} credits the campaign account; link on pay.banzami.com`)
        : mark(8, 'FAIL', JSON.stringify({ wa: session?.wallet_account_id, link: session?.link }).slice(0, 140));
    } catch (e) { mark(8, 'FAIL', String(e.stderr ?? e.message).slice(0, 140)); }
  } else if (J.verdict(8) === 'NOT_RUN') mark(8, 'NOT_RUN', 'no campaign account');

  let proofRef = null;
  if (J.verdict(8) === 'PASS' && pageSays(9, pages)) {
    const slug = session.link.split('/').filter(Boolean).pop();
    const hosted = await fetch(`https://pay.banzami.com/pay/${slug}`);
    const donor = `doatutdonor${state.stamp}`;
    const reg = await fetch(`${CONSUMER}/v1/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: donor, display_name: 'Tutorial donor', pin: String(100000 + Math.floor(Math.random() * 899999)) }) });
    const payer = await reg.json().catch(() => null);
    state.created.donor = donor;
    const pay = await fetch(`${CONSUMER}/v1/payment-links/${slug}/pay`, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${payer?.token}`, 'Idempotency-Key': `idem_doa_tut_pay_${state.stamp}` },
      body: JSON.stringify({ amount_minor: AMOUNT }) });
    const paid = await pay.json().catch(() => null);
    proofRef = paid?.receipt?.proof_reference ?? paid?.receipt?.ProofReference ?? null;
    const after = read(`${sdkClient(sdk)}console.log(JSON.stringify(await c.getPaymentSession('${session.session_id}')));\n`);
    hosted.status === 200 && pay.ok && after?.status === 'PAID'
      ? mark(9, 'PASS', `hosted page 200; donor paid (http ${pay.status}); getPaymentSession → PAID`)
      : mark(9, 'FAIL', `hosted ${hosted.status}; pay ${pay.status} ${JSON.stringify(paid)?.slice(0, 80)}; session ${after?.status}`);
  } else if (J.verdict(9) === 'NOT_RUN') mark(9, 'NOT_RUN', 'no session to pay');

  // 10 — the handler as the page writes it: raw body, constructEvent, dedupe by
  // event id, the donation found by reference_id; a tampered body refused.
  if (J.verdict(9) === 'PASS' && state.webhookSecret && pageSays(10, pages)) {
    let delivery = null;
    for (let i = 0; i < 20 && !delivery; i += 1) {
      delivery = (sinkRequests(cap).requests ?? []).find((r) => /payment_session\.paid/.test(r.raw_body));
      if (!delivery) await new Promise((r) => setTimeout(r, 3000));
    }
    if (!delivery) mark(10, 'FAIL', 'no payment_session.paid delivery reached the endpoint within 60s');
    else {
      try {
        const v = read(`${sdkClient(sdk, ', webhookSecret: process.env.WH_SECRET')}`
          + `const raw = process.env.WH_RAW, sig = process.env.WH_SIG;\n`
          + `const seen = new Set(); let confirmed = [];\n`
          + `for (let i = 0; i < 2; i++) { const evento = c.webhooks.constructEvent(raw, sig); if (seen.has(evento.id)) continue; seen.add(evento.id);\n`
          + `  if (evento.type === 'payment_session.paid') confirmed.push(evento.data.reference_id); }\n`
          + `let tampered = false; try { c.webhooks.constructEvent(raw.replace('${AMOUNT}', '${AMOUNT + 1}'), sig); } catch { tampered = true; }\n`
          + `console.log(JSON.stringify({ confirmed, tampered }));\n`,
          { WH_SECRET: state.webhookSecret, WH_RAW: delivery.raw_body, WH_SIG: delivery.headers['banza-signature'] });
        v.confirmed.length === 1 && v.confirmed[0] === `doacao_${state.stamp}` && v.tampered
          ? mark(10, 'PASS', `verified; delivered twice → one confirmation of ${v.confirmed[0]}; tampered body refused`)
          : mark(10, 'FAIL', JSON.stringify(v));
      } catch (e) { mark(10, 'FAIL', String(e.stderr ?? e.message).slice(0, 140)); }
    }
  } else if (J.verdict(10) === 'NOT_RUN') mark(10, 'NOT_RUN', 'no payment to be notified about');

  if (J.verdict(9) === 'PASS' && pageSays(11, pages)) {
    if (!proofRef) mark(11, 'FAIL', 'the donor\'s payment returned no receipt reference');
    else {
      const pub = await fetch(`${GW}/v1/public/proofs/${proofRef}`);
      const body = await pub.json().catch(() => null);
      const altered = await fetch(`${GW}/v1/public/proofs/${proofRef.toLowerCase()}`);
      pub.status === 200 && body?.status === 'CONFIRMED' && Number(body.amount) === AMOUNT && altered.status === 404
        ? mark(11, 'PASS', `${proofRef.slice(0, 8)}… → 200 CONFIRMED ${AMOUNT}, no auth; altered reference → 404`)
        : mark(11, 'FAIL', `http ${pub.status} ${body?.status} ${body?.amount}; altered ${altered.status}`);
    }
  } else if (J.verdict(11) === 'NOT_RUN') mark(11, 'NOT_RUN', 'no receipt');

  // 12 — settlement exactly as the page writes it. The beneficiary is a separate
  // person; the fee destination is the reader's own business, as the page says.
  if (J.verdict(9) === 'PASS' && pageSays(12, pages)) {
    const beneficiary = `doatutbenef${state.stamp}`;
    await fetch(`${CONSUMER}/v1/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: beneficiary, display_name: 'Tutorial beneficiary', pin: String(100000 + Math.floor(Math.random() * 899999)) }) });
    state.created.beneficiary = beneficiary;
    try {
      const idem = `idem_liquidacao_${campaignId}`;
      const r = read(`${sdkClient(sdk)}`
        + `const before = await c.getWalletAccount('${state.created.account}');\n`
        + `const p = { sourceAccountId: '${state.created.account}', beneficiaryBanzaName: '${beneficiary}', feeDestinationBanzaName: '${state.created.handle}', referenceType: 'CAMPANHA', referenceId: '${campaignId}', idempotencyKey: '${idem}' };\n`
        + `let s, err; try { s = await c.createBusinessApplicationSettlement(p); } catch (e) { err = { status: e.status, code: e.code, message: e.message }; }\n`
        + `let replay = null; if (s) { replay = await c.createBusinessApplicationSettlement(p); }\n`
        + `const after = await c.getWalletAccount('${state.created.account}');\n`
        + `console.log(JSON.stringify({ gross_before: before.available_balance_minor, s, err, replayId: replay?.id, after: after.available_balance_minor }));\n`);
      if (r.err) mark(12, 'FAIL', `refused: ${r.err.status} ${r.err.code} ${String(r.err.message).slice(0, 80)}`);
      else {
        const s = r.s;
        const sums = -s.gross_amount_minor + s.application_fee_minor + s.net_amount_minor === 0;
        s.status === 'COMPLETED' && s.gross_amount_minor === r.gross_before && sums && r.replayId === s.id && r.after === 0
          ? mark(12, 'PASS', `gross ${s.gross_amount_minor} = balance; -${s.gross_amount_minor} + ${s.application_fee_minor} + ${s.net_amount_minor} = 0; replay → same ${s.id}; account 0`)
          : mark(12, 'FAIL', JSON.stringify(r).slice(0, 200));
      }
    } catch (e) { mark(12, 'FAIL', String(e.stderr ?? e.message).slice(0, 160)); }
  } else if (J.verdict(12) === 'NOT_RUN') mark(12, 'NOT_RUN', 'nothing to settle');

  // 13 — rotation, as the page orders it: new webhook secret; new key, verify,
  // then revoke the old one and see it refused.
  if (state.created.endpoint && pageSays(13, pages)) {
    try {
      const rot = read(`${sdkClient(sdk)}const r = await c.rotateWebhookEndpointSecret('${state.created.endpoint}');\nconsole.log(JSON.stringify({ changed: Boolean(r.secret) && r.secret !== process.env.OLD }));\n`, { OLD: state.webhookSecret });
      const nk = await call(`/projects/${state.created.project}/keys`, 'POST', { kind: 'SECRET', name: `docs-doa-${state.stamp}-rotated`, scopes: state.scopes });
      const newSecret = nk.body?.secret ?? nk.body?.key?.secret;
      const newWorks = newSecret ? (await fetch(`${GW}/v1/me`, { headers: { authorization: `Bearer ${newSecret}` } })).status === 200 : false;
      const rev = await call(`/keys/${state.created.keyId}`, 'DELETE');
      const oldStatus = (await fetch(`${GW}/v1/me`, { headers: { authorization: `Bearer ${state.secret}` } })).status;
      state.created.rotatedKeyId = nk.body?.key?.id ?? nk.body?.id;
      rot.changed && newWorks && oldStatus === 401
        ? mark(13, 'PASS', `webhook secret rotated; new key 200 on /v1/me; old key revoked (http ${rev.status}) → 401`)
        : mark(13, 'FAIL', `rotated=${rot.changed} newKey=${newWorks} revoke=${rev.status} old=${oldStatus}`);
    } catch (e) { mark(13, 'FAIL', String(e.stderr ?? e.message).slice(0, 140)); }
  }

  // Cleanup through the product: revoke keys, deactivate the endpoint, archive
  // the project and the workspace. Money already moved stays moved — ledger
  // evidence is immutable and is not residue.
  const cleanup = [];
  for (const k of [state.created.rotatedKeyId]) if (k) cleanup.push(`revoke key: ${(await call(`/keys/${k}`, 'DELETE')).status}`);
  if (state.created.endpoint) cleanup.push(`deactivate endpoint: ${(await call(`/projects/${state.created.project}/webhooks/endpoints/${state.created.endpoint}`, 'DELETE')).status}`);
  if (state.created.project) cleanup.push(`archive project: ${(await call(`/projects/${state.created.project}/archive`, 'POST', { name: state.created.projectName })).status}`);
  if (state.created.workspace) cleanup.push(`archive workspace: ${(await call(`/workspaces/${state.created.workspace}/archive`, 'POST', { name: state.created.workspaceName })).status}`);
  state.cleanup = cleanup;

  saveState(state);
  return finish(state, 'complete');
}

// ── contract only ────────────────────────────────────────────────────────────

async function contractOnly() {
  console.log(`DOA tutorial — what the published page teaches · ${DOCS}/docs/doa\n`);
  const pages = await readTutorial();
  let bad = 0;
  for (let n = 1; n <= RUBRIC.length; n += 1) {
    const p = checkContract(n, pages);
    if (p.length) bad += 1;
    console.log(`  ${p.length ? '✗' : '✓'} [${String(n).padStart(2, '0')}] ${RUBRIC[n - 1]}${p.length ? ` — ${p.join('; ')}` : ''}`);
  }
  console.log(`\nDOA_DOC_TUTORIAL_CONTRACT=${bad === 0 ? 'PASS' : 'FAIL'} (${RUBRIC.length - bad}/${RUBRIC.length})`);
  process.exitCode = bad ? 1 : 0;
}

// ── summary, evidence, residue ───────────────────────────────────────────────

function measureResidue(state) {
  if (!state?.stamp) return { count: 0, detail: 'nothing was created' };
  try {
    // Everything this run made that can still act: Console objects, the donor
    // and beneficiary, and the Business. Ledger history is not residue — it is
    // immutable evidence of what happened, and stays.
    const count = sandboxCount(
      `SELECT (SELECT count(*) FROM developer.dev_workspaces WHERE name = 'docs-doa-${state.stamp}' AND status = 'ACTIVE')`
      + ` + (SELECT count(*) FROM developer.dev_projects WHERE name LIKE 'docs-doa-${state.stamp}%' AND status = 'ACTIVE')`
      + ` + (SELECT count(*) FROM developer.dev_api_keys k JOIN developer.dev_projects p ON p.id = k.project_id WHERE p.name LIKE 'docs-doa-${state.stamp}%' AND k.status = 'ACTIVE')`
      + ` + (SELECT count(*) FROM consumers WHERE handle IN ('doatutdonor${state.stamp}', 'doatutbenef${state.stamp}') AND status = 'ACTIVE')`
      + ` + (SELECT count(*) FROM merchants m JOIN handle_registry h ON h.owner_id = m.id AND h.owner_type = 'MERCHANT' WHERE h.handle = 'doatut${state.stamp}' AND m.status = 'ACTIVE')`);
    return { count, detail: 'active workspace, project, keys, donor, beneficiary and Business from this run' };
  } catch (e) {
    return { count: -1, detail: `could not measure: ${String(e.message).slice(0, 80)}` };
  }
}

/**
 * DOA_DOC_SPECIAL_CASES: does a harness reach for DOA's real tenant — its
 * handle, its Sandbox business, its Supabase projects? Comments may name them
 * in order to forbid them; code may not.
 */
const SPECIAL_CASE_PATTERN = /['"`]@?doa['"`]|Doa-Sandbox|doadoa\.app|disnhyxjhjmstmyrppng|acthheggrdbrckfemhyh/gi;
export function countSpecialCases(source) {
  const code = source.split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*\*)/.test(l))
    .filter((l) => !l.includes('SPECIAL_CASE_PATTERN =')) // the pattern is not a use of it
    .join('\n');
  return (code.match(SPECIAL_CASE_PATTERN) ?? []).length;
}
const specialCases = () => countSpecialCases(readFileSync(new URL(import.meta.url), 'utf8'));

function finish(state, phase) {
  const summary = J.assertConsistent();
  const residue = phase === 'complete' ? measureResidue(state) : null;
  if (phase === 'complete' && state?.readerDir) rmSync(state.readerDir, { recursive: true, force: true });
  const special = specialCases();

  const out = join(assuranceDir('docs-doa-tutorial'), `doa-tutorial-${phase}-${Date.now()}.json`);
  mkdirSync(dirname(out), { recursive: true });
  // No session token, key or webhook secret in the evidence.
  writeFileSync(out, `${JSON.stringify({ ran_at: new Date().toISOString(), phase, docs: DOCS, sdk: state?.sdk, steps: J.steps, summary, residue, cleanup: state?.cleanup, special_cases: special }, null, 2)}\n`);

  console.log('');
  for (const s of J.steps) console.log(`DOA_DOC_TUTORIAL_STEP_${String(s.n).padStart(2, '0')}=${s.verdict}`);
  console.log(`DOA_DOC_TUTORIAL_E2E=${summary.verdict} (${summary.passed}/${summary.total})`);
  if (residue) console.log(`DOA_DOC_TUTORIAL_RESIDUE=${residue.count < 0 ? 'UNMEASURED' : residue.count}`);
  console.log(`DOA_DOC_SPECIAL_CASES=${special}`);
  console.log(`evidence: ${out}`);
  process.exitCode = summary.verdict === 'PASS' && (!residue || residue.count === 0) && special === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith('doa-tutorial-e2e.mjs')) {
  const phase = process.argv[2] ?? 'contract';
  if (phase === 'prepare') await prepare();
  else if (phase === 'complete') await complete();
  else if (phase === 'contract') await contractOnly();
  else { console.error('usage: doa-tutorial-e2e.mjs prepare | complete | contract'); process.exit(2); }
}
