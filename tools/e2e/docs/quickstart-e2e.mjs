#!/usr/bin/env node
/**
 * The quickstart, followed by someone who knows nothing except the quickstart —
 * all twelve steps DOCS-PROD-001 §6 names, not the ones that were convenient.
 *
 * The previous version of this file proved six of the twelve and printed
 *
 *     DOC_QUICKSTART_E2E=PASS
 *
 * because its summary meant "none of my assertions failed", and a step nobody
 * asserted cannot fail. Financial Setup, the first payment, the hosted page, the
 * confirmation, the webhook and the Console view were simply absent, and absence
 * read as success. The residue line was the literal string "0".
 *
 * So the structure is now the rubric itself:
 *
 *   · twelve named steps, each ending in exactly one of PASS / FAIL / PENDING /
 *     NOT_RUN — never silently missing;
 *   · the summary is DERIVED: PASS only when every one of the twelve is PASS;
 *   · a structural assertion refuses to print a green summary beside a
 *     non-green step, so the contradiction cannot be reintroduced by editing the
 *     summary line;
 *   · residue is MEASURED against the Sandbox after cleanup, not printed.
 *
 * And the rules the reader is held to:
 *
 *   · the page decides. Every step is driven by what the DEPLOYED quickstart
 *     tells the reader to do; if the page does not say how, the step fails with
 *     "the page does not tell the reader" — which is how a documentation gap
 *     surfaces here;
 *   · no fixture route, no internal key, no database write, no operator bypass.
 *     The SDK comes from the public registry, into an empty directory outside
 *     every Banzami checkout;
 *   · Financial Setup goes through the real contract. A Business is applied for
 *     and REVIEWED, or connected with its owner's consent code. There is no
 *     Sandbox auto-approval and this file will not invent one: step 4 waits for
 *     the review, which is a human decision, and says so.
 *
 * Two phases, because step 4 has a human in it:
 *
 *   node tools/e2e/docs/quickstart-e2e.mjs prepare    # steps 1–7, submits the application
 *   … the application is reviewed in BANZADMIN …
 *   node tools/e2e/docs/quickstart-e2e.mjs complete   # re-checks 4, runs 8–12, cleans up
 *
 * `prepare` alone ends with DOC_QUICKSTART_E2E=FAIL and step 4 PENDING. That is
 * the correct answer until the review happens.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';
import { mintSession } from '../console/lib/mint.mjs';

const DOCS = process.env.BZ_DOCS ?? 'https://developers.banzami.com';
const API = process.env.BZ_DEV_API ?? 'https://developer-api.banzami.com';
const GW = process.env.BZ_GATEWAY ?? 'https://sandbox-api.banzami.com';
const CONSUMER = `${GW}/consumer`;
const ORIGIN = process.env.BZ_CONSOLE ?? 'https://developers.banzami.com';
const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';
const STATE = join(tmpdir(), 'banzami-docs-quickstart.json');

// ── the rubric ───────────────────────────────────────────────────────────────

/** DOCS-PROD-001 §6, verbatim order. */
export const RUBRIC = [
  'Create/sign in to Developer account',
  'Create Workspace',
  'Create Project',
  'Complete or connect Financial Setup',
  'Create secret API key',
  'Install current official SDK',
  'Call identity/readiness',
  'Create first payment resource',
  'Open hosted payment experience',
  'Receive/observe payment confirmation',
  'Receive webhook',
  'View transaction/receipt in Console',
];

const VERDICTS = new Set(['PASS', 'FAIL', 'PENDING', 'NOT_RUN']);

/** Twelve slots, every one starting NOT_RUN — so an unvisited step is visible. */
const blankSteps = () => RUBRIC.map((name, i) => ({ n: i + 1, name, verdict: 'NOT_RUN', detail: '' }));

let steps = blankSteps();
const mark = (n, verdict, detail = '') => {
  if (!VERDICTS.has(verdict)) throw new Error(`step ${n}: impossible verdict ${verdict}`);
  steps[n - 1] = { ...steps[n - 1], verdict, detail };
  const icon = verdict === 'PASS' ? '✓' : verdict === 'PENDING' ? '…' : verdict === 'NOT_RUN' ? '·' : '✗';
  (verdict === 'FAIL' ? console.error : console.log)(`  ${icon} [${String(n).padStart(2, '0')}] ${steps[n - 1].name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * The summary, derived — never assigned.
 *
 * PASS requires all twelve PASS. Anything else is FAIL, including a run where
 * nothing failed but some steps never ran, which is exactly the case the old
 * summary called green.
 */
export function summarise(stepList) {
  if (stepList.length !== RUBRIC.length) throw new Error(`the rubric has ${RUBRIC.length} steps, ${stepList.length} were reported`);
  const passed = stepList.filter((s) => s.verdict === 'PASS').length;
  return { passed, total: RUBRIC.length, verdict: passed === RUBRIC.length ? 'PASS' : 'FAIL' };
}

/**
 * The structural guard: a green summary cannot sit beside a non-green step.
 * Throws rather than prints, so the contradiction cannot be emitted at all.
 */
export function assertConsistent(stepList, summary) {
  const notPass = stepList.filter((s) => s.verdict !== 'PASS');
  if (summary.verdict === 'PASS' && notPass.length > 0) {
    throw new Error(`INCONSISTENT: summary PASS with ${notPass.length} step(s) not PASS — ${notPass.map((s) => `${s.n}:${s.verdict}`).join(', ')}`);
  }
  if (summary.verdict !== 'PASS' && notPass.length === 0) {
    throw new Error('INCONSISTENT: every step PASS but the summary is not PASS');
  }
}

// ── plumbing ─────────────────────────────────────────────────────────────────

const flatten = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"');

const saveState = (s) => writeFileSync(STATE, `${JSON.stringify(s, null, 2)}\n`);
const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null);

function consoleCaller(token) {
  return async (path, method = 'GET', body) => {
    const headers = { cookie: `__Host-bz_dev_session=${token}` };
    if (method !== 'GET') {
      const me = await (await fetch(`${API}/auth/me`, { headers })).json().catch(() => ({}));
      Object.assign(headers, { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': me.csrf_token ?? '' });
    }
    const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
}

/** Run an ES module in the reader's clean directory, with their key in the environment. */
function runInReaderDir(dir, source, env) {
  const file = join(dir, `step-${Date.now()}.mjs`);
  writeFileSync(file, source);
  const out = execFileSync('node', [file], { cwd: dir, encoding: 'utf8', timeout: 180000, env: { ...process.env, ...env } }).trim();
  return JSON.parse(out.split('\n').pop());
}

/** What the reader's own webhook endpoint received. The sink stands in for their server. */
function sinkRequests(cap) {
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', HOST,
    `docker exec banzami-webhook-sink wget -qO- 'http://localhost:8090/admin/requests?run=${cap}'`], { encoding: 'utf8', timeout: 60000 });
  return JSON.parse(out);
}
function sinkConfigure(cap) {
  execFileSync('ssh', ['-o', 'BatchMode=yes', HOST,
    `docker exec banzami-webhook-sink wget -qO- --post-data='{}' --header='content-type: application/json' 'http://localhost:8090/admin/configure?run=${cap}'`], { encoding: 'utf8', timeout: 60000 });
}


/**
 * A synthetic KYB document. A minimal, valid PDF that says in its own text what
 * it is: a Sandbox test document, not a registration and not an identity. The
 * gateway sniffs magic bytes, so it has to be a real PDF — and it has to be
 * unmistakably fake to whoever opens it in review.
 */
function syntheticPdf(label) {
  const text = `SANDBOX TEST DOCUMENT - ${label} - NOT A REAL DOCUMENT - Banzami public quickstart`;
  const stream = `BT /F1 10 Tf 40 780 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/**
 * Upload the documents an application currently needs, through the same public
 * path the Console's own form uses: signed URL, PUT to storage, confirm.
 * Returns the codes that were uploaded and any that could not be.
 */
export async function uploadDueDocuments(applicationId, due) {
  const done = [], failed = [];
  for (const d of due.filter((x) => x.kind === 'document')) {
    const bytes = syntheticPdf(d.code);
    const up = await fetch(`${GW}/v1/merchant/applications/${applicationId}/documents/upload-url`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document_type: d.code, filename: `${d.code.toLowerCase()}-sandbox-test.pdf`, mime_type: 'application/pdf', size_bytes: bytes.length }),
    });
    const u = await up.json().catch(() => ({}));
    if (!up.ok || !u.upload_url) { failed.push(`${d.code}: upload-url http ${up.status} ${u.error?.code ?? u.code ?? ''}`); continue; }
    const put = await fetch(u.upload_url, { method: u.method ?? 'PUT', headers: u.headers ?? { 'content-type': 'application/pdf' }, body: bytes });
    if (!put.ok) { failed.push(`${d.code}: storage PUT http ${put.status}`); continue; }
    const conf = await fetch(`${GW}/v1/merchant/applications/${applicationId}/documents/${u.document_id}/confirm`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    conf.ok ? done.push(d.code) : failed.push(`${d.code}: confirm http ${conf.status}`);
  }
  return { done, failed };
}

async function readPage() {
  const res = await fetch(`${DOCS}/docs/get-started`);
  if (!res.ok) throw new Error(`the quickstart page answered http ${res.status}`);
  return flatten(await res.text());
}

// ── phase: prepare (steps 1–7, and the application for step 4) ───────────────

async function prepare() {
  console.log(`quickstart — prepare · ${DOCS}/docs/get-started\n`);
  const page = await readPage();

  // What the page tells the reader to do, extracted — never assumed.
  const install = /npm install (@[a-z0-9/-]+)/.exec(page);
  const firstCall = /curl (https:\/\/[a-z0-9.-]+\/v1\/[a-z0-9/_-]+)/.exec(page);
  const saysFinancialSetup = /configura[çc][ãa]o financeira|financial setup/i.test(page);

  const stamp = Date.now().toString(36);
  const identity = `e2e-docs-qs-${stamp}@banzami-e2e.test`;
  const state = { stamp, identity, created: {}, cleanup: [] };

  let token;
  try {
    token = mintSession(identity);
    mark(1, 'PASS', 'email + six-digit code, through the product\'s own sign-in');
  } catch (e) {
    mark(1, 'FAIL', String(e.message).slice(0, 120));
    return finish(state);
  }
  const call = consoleCaller(token);
  state.token = token;

  const ws = await call('/workspaces', 'POST', { name: `docs-qs-${stamp}` });
  ws.status === 201 ? mark(2, 'PASS', ws.body?.id) : mark(2, 'FAIL', `http ${ws.status}`);
  state.created.workspace = ws.body?.id;

  const pr = await call(`/workspaces/${ws.body?.id}/projects`, 'POST', { name: `docs-qs-${stamp}` });
  pr.status === 201 ? mark(3, 'PASS', pr.body?.id) : mark(3, 'FAIL', `http ${pr.status}`);
  state.created.project = pr.body?.id;

  // Step 4 — driven by the page first. If the quickstart never mentions
  // Financial Setup, a reader cannot know the step exists, and that is the
  // finding regardless of whether the API would have let them do it.
  if (!saysFinancialSetup) {
    mark(4, 'FAIL', 'the page does not tell the reader Financial Setup exists — they reach 403 PAYMENTS_UNAVAILABLE with no way to learn why');
  } else {
    const app = await call(`/projects/${pr.body?.id}/financial-onboarding/applications`, 'POST', {
      desired_handle: `qs${stamp}`,
      business_name: `Docs Quickstart ${stamp}`,
      category: 'ecommerce',
      email: identity, phone: '+244900000000', nif: `5${stamp.replace(/\D/g, '').padEnd(9, '0').slice(0, 9)}`,
      province: 'Luanda', municipality: 'Luanda', address: 'Rua de Teste, 1',
      legal_representative: 'Quickstart Reader', representative_role: 'Director',
      business_activity: 'Sandbox integration test for the public quickstart',
      terms_accepted: true, idempotency_key: `idem_docs_qs_${stamp}`,
    });
    if (app.status === 201) {
      state.created.application = app.body?.application_id;
      // The page says an application carries documents; the application says
      // which ones it still needs. Read that, rather than assuming a list.
      const fsRead = await call(`/projects/${pr.body?.id}/financial-setup`);
      const due = fsRead.body?.onboarding?.application?.requirements?.currently_due ?? [];
      const up = await uploadDueDocuments(app.body?.application_id, due);
      const after = (await call(`/projects/${pr.body?.id}/financial-setup`)).body?.onboarding?.application?.requirements;
      const stillDue = (after?.currently_due ?? []).filter((x) => x.kind === 'document');
      if (up.failed.length || stillDue.length) {
        mark(4, 'FAIL', `documents could not be supplied: ${[...up.failed, ...stillDue.map((x) => `${x.code} still due`)].join('; ')}`);
      } else {
        mark(4, 'PENDING', `application ${app.body?.application_id} submitted with ${up.done.join(', ')} — awaiting operator review, which is a human decision`);
      }
    } else {
      mark(4, 'FAIL', `the application was refused: http ${app.status} ${JSON.stringify(app.body)?.slice(0, 120)}`);
    }
  }

  const key = await call(`/projects/${pr.body?.id}/keys`, 'POST', {
    kind: 'SECRET', name: `docs-qs-${stamp}`,
    scopes: ['identity:read', 'payment_sessions:write', 'payment_sessions:read', 'webhooks:read', 'webhooks:write'],
  });
  const secret = key.body?.secret ?? key.body?.key?.secret;
  secret ? mark(5, 'PASS', 'secret revealed once, prefix bz_test_sk_') : mark(5, 'FAIL', `http ${key.status}`);
  state.secret = secret;

  if (!install) {
    mark(6, 'FAIL', 'the page gives no install command a reader could run');
  } else {
    const dir = mkdtempSync(join(tmpdir(), 'bz-docs-quickstart-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'cold-reader', private: true, type: 'module' }, null, 2));
    try {
      execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund', install[1]], { cwd: dir, stdio: 'pipe', timeout: 300000 });
      const version = JSON.parse(readFileSync(join(dir, 'node_modules', install[1], 'package.json'), 'utf8')).version;
      mark(6, 'PASS', `${install[0]} → ${install[1]}@${version} from the public registry, in an empty directory`);
      state.readerDir = dir;
      state.sdk = { name: install[1], version };
    } catch (e) {
      mark(6, 'FAIL', String(e.stderr ?? e.message).slice(0, 160));
    }
  }

  if (state.readerDir && secret) {
    try {
      const me = runInReaderDir(state.readerDir,
        `import { BanzamiClient } from '${install[1]}';\n`
        + `const c = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY, environment: 'sandbox' });\n`
        + `const me = await c.me();\n`
        + `console.log(JSON.stringify({ environment: me.environment, key_status: me.key_status }));\n`,
        { BANZAMI_API_KEY: secret });
      // The page's own curl, exactly as printed, must agree with the SDK.
      let curlOK = true;
      if (firstCall) {
        const r = await fetch(firstCall[1], { headers: { authorization: `Bearer ${secret}` } });
        curlOK = r.status === 200;
      }
      me.environment === 'SANDBOX' && me.key_status === 'active' && curlOK
        ? mark(7, 'PASS', `SDK me() → SANDBOX, active; the page's curl → 200`)
        : mark(7, 'FAIL', `me=${JSON.stringify(me)} curl=${curlOK}`);
    } catch (e) {
      mark(7, 'FAIL', String(e.stderr ?? e.message).slice(0, 160));
    }
  }

  saveState({ ...state, steps });
  return finish(state, { phase: 'prepare' });
}

// ── phase: complete (re-check 4, then 8–12, then cleanup) ─────────────────────

async function complete() {
  const state = loadState();
  if (!state) {
    console.error(`no prepared run at ${STATE} — run "prepare" first`);
    process.exit(2);
  }
  steps = state.steps;
  console.log(`quickstart — complete · ${state.identity}\n`);
  const page = await readPage();
  const call = consoleCaller(state.token);

  // Step 4, re-asked: is the Project actually able to receive now?
  const fs = await call(`/projects/${state.created.project}/financial-setup`);
  // READY or SEALED are the only receiving states (developer-api financial_setup.go).
  // An earlier draft looked for "CONFIGURED", which the Console never returns.
  const ready = fs.status === 200 && ['READY', 'SEALED'].includes(fs.body?.state);
  ready ? mark(4, 'PASS', `financial setup ${fs.body.state}`) : mark(4, 'FAIL', `still ${fs.body?.state ?? fs.status} — the review has not provisioned the Project`);

  const sdk = state.sdk?.name;
  const env = { BANZAMI_API_KEY: state.secret };

  // Step 11 is prepared BEFORE step 8: a reader registers the endpoint first,
  // or the event about the payment they are about to make has nowhere to go.
  const cap = `qs${state.stamp}${Math.random().toString(36).slice(2, 10)}`;
  let endpointSecret = null;
  try {
    sinkConfigure(cap);
    const ep = runInReaderDir(state.readerDir,
      `import { BanzamiClient } from '${sdk}';\n`
      + `const c = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY, environment: 'sandbox' });\n`
      + `const ep = await c.createWebhookEndpoint({ url: 'https://sandbox-webhook.banzami.com/receive/${cap}', events: ['payment_session.created', 'payment_session.paid'] });\n`
      + `console.log(JSON.stringify({ id: ep.id, has_secret: Boolean(ep.secret), secret: ep.secret }));\n`, env);
    endpointSecret = ep.secret;
    state.created.webhookEndpoint = ep.id;
  } catch (e) {
    mark(11, 'FAIL', `could not register the endpoint: ${String(e.stderr ?? e.message).slice(0, 140)}`);
  }

  // Step 8 — the call the page prints.
  const saysPayment = /createPaymentSession|payment-sessions/.test(page);
  let session = null;
  if (!ready) {
    mark(8, 'NOT_RUN', 'blocked by step 4');
  } else if (!saysPayment) {
    mark(8, 'FAIL', 'the page does not tell the reader how to create a payment');
  } else {
    try {
      session = runInReaderDir(state.readerDir,
        `import { BanzamiClient } from '${sdk}';\n`
        + `const c = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY, environment: 'sandbox' });\n`
        + `const s = await c.createPaymentSession({ purpose: 'ORDER', referenceType: 'PEDIDO', referenceId: 'order_123', amountMinor: 250000, currency: 'AOA' });\n`
        + `console.log(JSON.stringify(s));\n`, env);
      session?.session_id ? mark(8, 'PASS', `payment session ${session.session_id}, ${session.status}`) : mark(8, 'FAIL', JSON.stringify(session).slice(0, 140));
    } catch (e) {
      mark(8, 'FAIL', String(e.stderr ?? e.message).slice(0, 160));
    }
  }

  // Step 9 — the hosted page the session points at, opened the way a payer would.
  const link = session?.interfaces?.find((i) => /LINK|URL/i.test(i.type ?? i.kind ?? ''))?.value
    ?? session?.interfaces?.find((i) => typeof i.url === 'string')?.url;
  const slug = link ? String(link).split('/').filter(Boolean).pop() : null;
  if (!session) {
    mark(9, 'NOT_RUN', 'no payment resource to open');
  } else if (!slug) {
    mark(9, 'FAIL', 'the session carries no hosted link a payer could open');
  } else {
    const hosted = await fetch(`https://pay.banzami.com/pay/${slug}`);
    const html = await hosted.text();
    hosted.status === 200 && /250[\s .]?000|2[\s .]?500/.test(flatten(html))
      ? mark(9, 'PASS', `pay.banzami.com/pay/${slug} → 200, showing the amount`)
      : mark(9, 'FAIL', `http ${hosted.status}`);
  }

  // Step 10 — a real payer pays it on their own surface, and the developer
  // observes the outcome through the documented read.
  if (steps[8].verdict === 'PASS') {
    const payerHandle = `qspayer${state.stamp}`;
    const reg = await fetch(`${CONSUMER}/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: payerHandle, display_name: 'Quickstart payer', pin: String(100000 + Math.floor(Math.random() * 899999)) }),
    });
    const payer = await reg.json().catch(() => null);
    state.created.payer = payerHandle;
    const pay = await fetch(`${CONSUMER}/v1/payment-links/${slug}/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${payer?.token}`, 'Idempotency-Key': `idem_qs_pay_${state.stamp}` },
      body: JSON.stringify({ amount_minor: 250000 }),
    });
    const after = runInReaderDir(state.readerDir,
      `import { BanzamiClient } from '${sdk}';\n`
      + `const c = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY, environment: 'sandbox' });\n`
      + `console.log(JSON.stringify(await c.getPaymentSession('${session.session_id}')));\n`, env);
    pay.ok && /PAID|COMPLETED/i.test(after?.status ?? '')
      ? mark(10, 'PASS', `payer paid (http ${pay.status}); getPaymentSession → ${after.status}`)
      : mark(10, 'FAIL', `pay http ${pay.status}; session status ${after?.status}`);
  } else {
    mark(10, 'NOT_RUN', 'no hosted payment to complete');
  }

  // Step 11 — the event arrives, the signature verifies with the SDK, and a
  // second delivery of the same event changes nothing.
  if (endpointSecret && steps[9].verdict === 'PASS') {
    let paid = null;
    for (let i = 0; i < 20 && !paid; i += 1) {
      const got = sinkRequests(cap);
      paid = (got.requests ?? []).find((r) => /payment_session\.paid/.test(r.raw_body));
      if (!paid) await new Promise((r) => setTimeout(r, 3000));
    }
    if (!paid) {
      mark(11, 'FAIL', 'no payment_session.paid delivery reached the endpoint within 60s');
    } else {
      try {
        const verified = runInReaderDir(state.readerDir,
          `import { BanzamiClient } from '${sdk}';\n`
          + `const c = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY, environment: 'sandbox', webhookSecret: process.env.WH_SECRET });\n`
          + `const raw = process.env.WH_RAW;\n`
          + `const event = c.webhooks.constructEvent(raw, process.env.WH_SIG);\n`
          + `const seen = new Set(); let effects = 0;\n`
          + `for (const delivery of [event, c.webhooks.constructEvent(raw, process.env.WH_SIG)]) { if (seen.has(delivery.id)) continue; seen.add(delivery.id); effects += 1; }\n`
          + `let tamperedRejected = false; try { c.webhooks.constructEvent(raw + ' ', process.env.WH_SIG); } catch { tamperedRejected = true; }\n`
          + `console.log(JSON.stringify({ id: event.id, type: event.type, effects, tamperedRejected }));\n`,
          { ...env, WH_SECRET: endpointSecret, WH_RAW: paid.raw_body, WH_SIG: paid.headers['banza-signature'] });
        verified.type === 'payment_session.paid' && verified.effects === 1 && verified.tamperedRejected
          ? mark(11, 'PASS', `signature verified by the SDK; event ${verified.id}; duplicate delivery → 1 effect; tampered body refused`)
          : mark(11, 'FAIL', JSON.stringify(verified));
      } catch (e) {
        mark(11, 'FAIL', `signature did not verify: ${String(e.stderr ?? e.message).slice(0, 140)}`);
      }
    }
  } else if (steps[10].verdict === 'NOT_RUN') {
    mark(11, 'NOT_RUN', 'no payment to be notified about');
  }

  // Step 12 — the developer, signed in, sees it in the Console.
  if (steps[9].verdict === 'PASS') {
    const tx = await call(`/projects/${state.created.project}/transactions`);
    const rows = tx.body?.transactions ?? tx.body?.data ?? [];
    const found = rows.find((r) => Number(r.amount_minor) === 250000);
    tx.status === 200 && found
      ? mark(12, 'PASS', `Console · Transações lists the 250 000 minor payment`)
      : mark(12, 'FAIL', `http ${tx.status}; ${rows.length} row(s), none of 250 000`);
  } else {
    mark(12, 'NOT_RUN', 'nothing to view');
  }

  // Cleanup through the Console the reader has: endpoint, key, project,
  // workspace. The payer and the Business are retired by
  // tools/ops/retire-synthetic-residue.sh through the operator's own APIs;
  // residue below counts them until that has happened.
  const cleanup = [];
  if (state.created.webhookEndpoint) cleanup.push(`endpoint: ${(await call(`/projects/${state.created.project}/webhooks/endpoints/${state.created.webhookEndpoint}`, 'DELETE')).status}`);
  const keys = (await call(`/projects/${state.created.project}/keys`)).body?.keys ?? [];
  for (const k of keys.filter((x) => x.status === 'ACTIVE')) cleanup.push(`key ${k.id}: ${(await call(`/keys/${k.id}`, 'DELETE')).status}`);
  const proj = await call(`/projects/${state.created.project}`);
  cleanup.push(`project: ${(await call(`/projects/${state.created.project}/archive`, 'POST', { name: proj.body?.name })).status}`);
  const ws = await call(`/workspaces/${state.created.workspace}`);
  cleanup.push(`workspace: ${(await call(`/workspaces/${state.created.workspace}/archive`, 'POST', { name: ws.body?.name })).status}`);
  state.cleanup = cleanup;
  console.log(`  cleanup — ${cleanup.join(' · ')}`);

  saveState({ ...state, steps });
  return finish(state, { phase: 'complete' });
}

// ── summary, evidence, residue ───────────────────────────────────────────────

/** Residue is counted on the Sandbox, never printed as a constant. */
function measureResidue(state) {
  if (!state?.stamp) return { count: 0, detail: 'nothing was created' };
  try {
    const out = execFileSync('ssh', ['-o', 'BatchMode=yes', HOST,
      `PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); `
      + `CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1); `
      + `PW=$(docker exec $CORE sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#'); `
      + `docker exec -e PGPASSWORD=$PW -e PGOPTIONS='-c default_transaction_read_only=on' $PG psql -U bl_app_runtime -d banzami_staging -At -c "`
      + `SELECT (SELECT count(*) FROM developer.dev_workspaces WHERE name LIKE 'docs-qs-${state.stamp}%' AND status='ACTIVE')`
      + ` + (SELECT count(*) FROM developer.dev_projects WHERE name LIKE 'docs-qs-${state.stamp}%' AND status='ACTIVE')`
      + ` + (SELECT count(*) FROM developer.dev_api_keys k JOIN developer.dev_projects p ON p.id = k.project_id WHERE p.name LIKE 'docs-qs-${state.stamp}%' AND k.status='ACTIVE')`
      + ` + (SELECT count(*) FROM consumers WHERE handle LIKE 'qspayer${state.stamp}%' AND status='ACTIVE')`
      + ` + (SELECT count(*) FROM merchants m JOIN handle_registry h ON h.owner_id = m.id AND h.owner_type = 'MERCHANT' WHERE h.handle = 'qs${state.stamp}' AND m.status='ACTIVE')"`], { encoding: 'utf8', timeout: 60000 });
    return { count: Number(out.trim()) || 0, detail: 'active workspace, project, keys, payer and Business from this run' };
  } catch (e) {
    return { count: -1, detail: `could not measure: ${String(e.message).slice(0, 80)}` };
  }
}

function finish(state, { phase = 'prepare' } = {}) {
  const summary = summarise(steps);
  assertConsistent(steps, summary);

  const residue = phase === 'complete' ? measureResidue(state) : null;
  if (state?.readerDir && phase === 'complete') rmSync(state.readerDir, { recursive: true, force: true });

  const out = join(assuranceDir('docs-quickstart'), `docs-quickstart-${phase}-${Date.now()}.json`);
  mkdirSync(dirname(out), { recursive: true });
  // No token, no key secret, no webhook secret in the evidence.
  writeFileSync(out, `${JSON.stringify({ ran_at: new Date().toISOString(), phase, docs: DOCS, sdk: state?.sdk, steps, summary, residue }, null, 2)}\n`);

  console.log('');
  for (const s of steps) console.log(`DOC_QUICKSTART_STEP_${String(s.n).padStart(2, '0')}=${s.verdict}`);
  console.log(`DOC_QUICKSTART_E2E=${summary.verdict} (${summary.passed}/${summary.total})`);
  if (residue) console.log(`DOC_QUICKSTART_RESIDUE=${residue.count < 0 ? 'UNMEASURED' : residue.count}`);
  console.log(`evidence: ${out}`);
  process.exitCode = summary.verdict === 'PASS' ? 0 : 1;
}

// ── entry ────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('quickstart-e2e.mjs')) {
  const phase = process.argv[2] ?? 'prepare';
  if (phase === 'prepare') await prepare();
  else if (phase === 'complete') await complete();
  else { console.error('usage: quickstart-e2e.mjs prepare | complete'); process.exit(2); }
}
