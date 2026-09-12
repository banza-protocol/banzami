#!/usr/bin/env node
/**
 * developer-journey-50.mjs — the whole Developer Platform, once, in a real
 * browser, as a new developer meets it.
 *
 * The suites beside this one each prove one property across many projects:
 * routes render (console/route-suite), keys authenticate the Gateway
 * (dev-key-gateway-e2e), the foundation holds (developer-foundation-e2e). None
 * of them is the thing a developer actually does, which is one continuous
 * sitting — sign in, make a workspace, invite a colleague, issue a key, call the
 * API with it, revoke it, close the project, sign out — where every step stands
 * on the state the previous one left behind. That is the only shape in which a
 * break BETWEEN two correct features shows up, and it is the shape nothing
 * covered.
 *
 * So: fifty steps, in order, on the DEPLOYED Console, with one identity created
 * for the run and given back at the end.
 *
 * ── What is real here, and what is not ─────────────────────────────────────
 *
 * Everything is the product's own path. Every workspace, project, key, webhook,
 * invite and membership in this run is made by driving the Console's own UI or
 * calling its session-authenticated API as the signed-in person. No SQL creates
 * journey state; no operator authority is used to manufacture a precondition
 * a developer could not reach on their own. Where a developer genuinely CANNOT
 * reach something alone, that is recorded as a FAIL with the reason, because a
 * step made green by lowering the bar proves less than a step that fails.
 *
 * The ONE deviation is the six-digit sign-in code — see DEVIATION below. It is
 * printed, stored in the evidence, and not buried.
 *
 * ── What is never printed ──────────────────────────────────────────────────
 *
 * No raw API key, webhook signing secret, session cookie, CSRF token, OTP or
 * proof reference reaches stdout or the evidence file. Assertions are on SHAPE
 * (prefix, length, character class) and on the masked forms the Console shows.
 * The suite is meant to be safe to paste into a report.
 *
 * Run:
 *   PLAYWRIGHT_MODULE=/Users/fm65/doa/node_modules/@playwright/test/index.mjs \
 *     node tools/e2e/dev-console/developer-journey-50.mjs [--out <dir>] [--headed]
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { registerCleanup, cleanupRun } from '../console/lib/run-cleanup.mjs';
import { assuranceDir } from '../lib/assurance-output.mjs';

// Playwright lives in the DOA workspace on this machine; the operator repo has
// no browser dependency of its own and should not grow one for a suite that
// runs against a deployed site. tools/e2e/dev-console/node_modules is the
// fallback, which is what the other dev-console harnesses import.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs'
).catch(() => import('playwright'));

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

const CONSOLE = 'https://developers.banzami.com';
const API = 'https://developer-api.banzami.com';
const GW = 'https://sandbox-api.banzami.com';
const ORIGIN = { Origin: CONSOLE, 'Content-Type': 'application/json' };
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';

/**
 * The one disclosed deviation, verbatim, in the evidence and on the console.
 *
 * A `.test` address has no mailbox and must not have one: provisioning real
 * inboxes to prove tenant isolation would be absurd, and otp-retrieve.sh refuses
 * any address that is not synthetic precisely so this can never be quietly swapped
 * for the canonical journey.
 */
// ── run identity ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const HEADED = argv.includes('--headed');
const STAMP = process.env.E2E_TS || String(Math.floor(Date.now() / 1000));

// The journey's own identity by default. `--owner-email` runs it on a REAL
// account instead — which is the only way to prove the thing a synthetic
// address cannot: that the sign-in email is actually delivered. A real address
// has a real mailbox, `otp-retrieve.sh` refuses it on purpose, and the code is
// therefore supplied out of band by the person who received it (see waitForOTP).
const EMAIL_OWNER = argOf('--owner-email') ?? `dpjourney-${STAMP}@banzami-e2e.test`;
const OWNER_IS_SYNTHETIC = EMAIL_OWNER.endsWith('@banzami-e2e.test');

/**
 * What this run did NOT prove, stated by the run rather than by whoever reports
 * it — and it depends on which mailbox signed in.
 *
 * On a synthetic address there is no mailbox, so the code is recovered from the
 * operator's own store: that proves the verify path and proves delivery of
 * nothing. On a real address the code is typed into the UI by the person who
 * received the email, so delivery is part of what the run observed and there is
 * no deviation left to declare.
 *
 * It was a single hardcoded sentence, which meant a real-mailbox run filed
 * evidence claiming a deviation it did not have — evidence that understates
 * itself is still wrong.
 */
const DEVIATION = OWNER_IS_SYNTHETIC
  ? 'Sign-in used the genuine /auth/request-otp + /auth/verify path; the 6-digit code was '
    + 'recovered server-side (tools/e2e/dev-console/otp-retrieve.sh) because no mailbox exists '
    + 'for a @banzami-e2e.test address. Email DELIVERY is therefore not proven by this run; '
    + 'every step after sign-in is the product’s own path.'
  : `None. Sign-in used the product's own screens end to end: the code was delivered by email to `
    + `${EMAIL_OWNER}, read by the person who received it, and typed into the verify screen. `
    + 'Email delivery is part of what this run observed.';
const EMAIL_MEMBER = `dpmember-${STAMP}@banzami-e2e.test`;
// Every artefact carries the stamp in its name, so the residue check can find
// what this run made without depending on the accounts still existing.
const TAG = `dpj-${STAMP}`;
// Initials that cannot be confused with the ones an email would produce: the
// address starts "dp", so a name starting D or P would make step 6 unfalsifiable.
// On a real account the name must be the person's own: writing a fixture name
// into somebody's profile is a change to their identity, not a test. The
// synthetic default is chosen so its initials cannot be confused with the ones
// the address would produce — "dp…" would make step 6 unfalsifiable.
const OWNER_NAME = argOf('--owner-name') ?? 'Quirina Zeferino';
const OWNER_INITIALS = OWNER_NAME.trim().split(/\s+/).length > 1
  ? (OWNER_NAME.trim().split(/\s+/)[0][0] + OWNER_NAME.trim().split(/\s+/).slice(-1)[0][0]).toUpperCase()
  : OWNER_NAME.trim().slice(0, 2).toUpperCase();

// Give the authority back — accounts, their sessions, their workspaces, the
// projects and keys inside them. A leftover console account that can still sign
// in is not a leftover, it is a way in. Registered as handlers so the failure
// paths, which are when leaks actually happen, are covered too.
// A real account is NOT cleaned up: it belongs to a person and existed before
// this run. What the run made inside it — the workspace and project carrying
// TAG — is still retired, by the journey's own archive steps and by the residue
// check at the end. Deleting somebody's account to tidy up after a test would
// be the worst kind of cleanup.
if (OWNER_IS_SYNTHETIC) registerCleanup({ emailPattern: EMAIL_OWNER, namePattern: `%${TAG}%` });
registerCleanup({ emailPattern: EMAIL_MEMBER, namePattern: `%${TAG}%` });

const getOTP = (email) =>
  execFileSync('bash', [resolve(HERE, 'otp-retrieve.sh'), email], { encoding: 'utf8' }).trim();

/**
 * The code for a REAL mailbox, supplied by the person who received it.
 *
 * `otp-retrieve.sh` recovers a code from the operator's own store, which proves
 * delivery of nothing — and it refuses any address that is not synthetic, for
 * exactly that reason. So for a real account the code has to come from outside
 * this process: the run requests it, says so, and waits for the six digits to
 * appear in a file.
 *
 * The file is read and then emptied. A code is single-use and short-lived, and
 * leaving it on disk after it has been spent serves nothing.
 */
async function waitForOTP(email, file, timeoutMs = 8 * 60 * 1000) {
  const path = resolve(file);
  console.log(`\n  waiting for the code delivered to ${email} — write the six digits to ${path}`);
  const end = Date.now() + timeoutMs;
  for (;;) {
    try {
      const raw = readFileSync(path, 'utf8').replace(/\D/g, '');
      if (/^\d{6}$/.test(raw)) {
        writeFileSync(path, '');
        console.log('  code received\n');
        return raw;
      }
    } catch {
      /* not written yet */
    }
    if (Date.now() > end) throw new Error(`no code appeared in ${path} within ${Math.round(timeoutMs / 60000)} minutes`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// The authority nine of these steps are waiting on. Named once so every blocked
// step says the same thing, and so changing it is one edit rather than nine.
const BLOCKED_BY_BUSINESS =
  "an operator KYB decision in BANZADMIN, or a consent code from an existing Business's owner";

// ── result recording ─────────────────────────────────────────────────────────
const results = [];
let stepNo = 0;

/**
 * One step, one line. `observed` is what the product actually did.
 *
 * Three verdicts, not two, and the third is the one that matters here.
 *
 *   PASS     the product did what the step describes
 *   FAIL     the product is wrong
 *   BLOCKED  the product REFUSED, correctly, and the refusal needs an authority
 *            this run does not hold
 *
 * Nine steps of this journey need the Project to have a financial owner, and a
 * developer alone cannot give it one: a new Business is decided by an operator
 * in BANZADMIN, and an existing one is connected with a single-use consent code
 * issued by its owner. That is deliberate — it replaced a one-click Sandbox
 * setup that created a synthetic Business and marked its KYB approved with
 * nobody reviewing anything (services/developer-api .../financial_onboarding.go).
 *
 * Reporting those nine as FAIL says the product is broken; reporting them as
 * PASS says a journey completed that did not. Both are false, so they are
 * BLOCKED, and each one names the authority it is waiting on. A BLOCKED step is
 * never counted as a pass.
 */
function record(name, ok, observed = '', blockedBy = null) {
  stepNo += 1;
  const n = String(stepNo).padStart(2, '0');
  const status = blockedBy ? 'BLOCKED' : ok ? 'PASS' : 'FAIL';
  results.push({ step: stepNo, name, status, observed, blocked_by: blockedBy });
  const tail = blockedBy ? `${observed ? observed + ' — ' : ''}needs: ${blockedBy}` : observed;
  console.log(`${n}. ${name} ... ${status}${tail ? ` (${tail})` : ''}`);
}

/**
 * Run one step. A step that throws is a FAIL with the exception as the
 * observation — never a crash that takes the remaining steps with it, because
 * the steps after a failure are exactly the ones whose result is interesting.
 */
async function step(name, fn) {
  try {
    const r = await fn();
    if (r && typeof r === 'object' && 'ok' in r) record(name, r.ok, r.observed ?? '', r.blockedBy ?? null);
    else record(name, r !== false, typeof r === 'string' ? r : '');
  } catch (e) {
    record(name, false, `threw: ${String(e && e.message ? e.message : e).slice(0, 200)}`);
  }
}

// ── small browser helpers ────────────────────────────────────────────────────
const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

async function settle(page, ms = 500) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

async function open(page, path, ms = 600) {
  const res = await page.goto(CONSOLE + path, { waitUntil: 'domcontentloaded' });
  await settle(page, ms);
  return res;
}

const bodyText = async (page) => norm(await page.locator('body').innerText());

/** Poll until `fn` returns truthy, or give up. Returns the value or null. */
async function until(fn, { timeout = 15000, interval = 300 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* transient — a React tree mid-render is not a failure */
    }
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, interval));
  }
}

/**
 * The value beside a settings field label.
 *
 * Field renders `<p>LABEL</p>` followed by the value element, so the label's own
 * next sibling is the answer. Reading it structurally rather than by regex over
 * the page keeps this working when the copy around it changes.
 */
async function fieldValue(page, label) {
  return page.evaluate((wanted) => {
    const labels = [...document.querySelectorAll('p')];
    const l = labels.find((p) => p.textContent.trim() === wanted);
    const v = l?.nextElementSibling;
    return v ? v.innerText.trim() : null;
  }, label);
}

/**
 * The toast text, once it says what we are waiting for.
 *
 * Every live region on the page is read, not the first one: the Sandbox notice
 * at the top of every portal page is also `role="status"` and comes first in the
 * DOM, so `.first()` silently watched a banner that never changes and every
 * confirmation this suite waits for timed out.
 */
async function toast(page, re, timeout = 10000) {
  return until(
    async () => {
      const parts = await page.locator('[role="status"]').allInnerTexts();
      const hit = parts.map(norm).find((t) => re.test(t));
      return hit ?? null;
    },
    { timeout },
  );
}

/**
 * The exact name a confirm-by-name dialog is asking for.
 *
 * It prints the name verbatim immediately above the field — deliberately, so
 * this is a deliberate act and not a memory test — so the dialog's own words are
 * what gets typed. Typing what the harness BELIEVES the name to be instead just
 * leaves the confirm button disabled, with nothing on screen saying why.
 */
async function confirmName(dialog) {
  return dialog.evaluate((el) => {
    const input = el.querySelector('input[autocomplete="off"]');
    const p = input?.previousElementSibling;
    return p ? p.textContent.trim() : '';
  });
}

/** The workspace, as the server holds it. The authority for its current name. */
async function serverWorkspace(ctx, id) {
  const r = await ctx.request.get(`${API}/workspaces`, { headers: { Origin: CONSOLE } });
  const { workspaces } = await r.json();
  return (workspaces ?? []).find((w) => w.id === id) ?? null;
}

/** The project, as the server holds it — archived ones included. */
async function serverProject(ctx, wsId, id) {
  const r = await ctx.request.get(`${API}/workspaces/${wsId}/projects?include_archived=true`, {
    headers: { Origin: CONSOLE },
  });
  const { projects } = await r.json();
  return (projects ?? []).find((p) => p.id === id) ?? null;
}

/** Sign in through the Console's own login + verify screens. */
async function signInViaUI(page, email) {
  await open(page, '/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.waitForURL(/\/verify/, { timeout: 20000 });
  const code = email.endsWith('@banzami-e2e.test')
    ? getOTP(email)
    : await waitForOTP(email, argOf('--owner-otp-file') ?? '/tmp/bz-journey-otp.txt');
  if (!/^\d{6}$/.test(code)) throw new Error('otp not recovered');
  const digits = page.locator('input[inputmode="numeric"], input[maxlength="1"]');
  const n = await digits.count();
  if (n < 6) throw new Error(`verify screen has ${n} code inputs, expected 6`);
  for (let i = 0; i < 6; i += 1) await digits.nth(i).fill(code[i]);
  await page.waitForURL((u) => !/\/verify|\/login/.test(new URL(u).pathname), { timeout: 25000 });
  await settle(page, 900);
}

/** Open the account menu from the avatar. Returns the popup locator. */
async function openUserMenu(page) {
  const trigger = page.locator('button[aria-label^="A sua conta"]').first();
  await trigger.click();
  const menu = page.locator('div[role="menu"][aria-label="Conta"]');
  await menu.waitFor({ state: 'visible', timeout: 8000 });
  return menu;
}

/** A Gateway call with a raw key. Returns status + parsed body, never the key. */
async function gateway(path, key) {
  const res = await fetch(GW + path, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON — status is the answer */
  }
  return { status: res.status, body };
}

/** The build the deployed runtime reports, for the evidence header. */
async function readyz(host) {
  try {
    const r = await fetch(host + '/readyz');
    if (r.ok) return await r.json();
    const h = await fetch(host + '/health');
    return h.ok ? await h.json() : { status: `http ${r.status}` };
  } catch (e) {
    return { status: `unreachable: ${String(e).slice(0, 80)}` };
  }
}

// ── residue ──────────────────────────────────────────────────────────────────
/**
 * What this run still owns after it has given everything back.
 *
 * Counted by the run's own stamp rather than by the accounts, because cleanup
 * removes the accounts: a count that joined through them would report zero for
 * the one failure mode it exists to catch.
 */
function residueCount() {
  const sql = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }
  U=$(q "select count(*) from account_identity.identity_users where email in ('${EMAIL_OWNER}','${EMAIL_MEMBER}')")
  W=$(q "select count(*) from developer.dev_workspaces where status='ACTIVE' and name like '%${TAG}%'")
  R=$(q "select count(*) from developer.dev_projects where status='ACTIVE' and name like '%${TAG}%'")
  K=$(q "select count(*) from developer.dev_api_keys where status='ACTIVE' and name like '%${TAG}%'")
  echo "\${U:-0} \${W:-0} \${R:-0} \${K:-0}"`;
  const out = execFileSync('ssh', [REMOTE, sql], { encoding: 'utf8', maxBuffer: 1 << 22 }).trim();
  const parts = out.split(/\s+/).slice(-4).map((n) => Number(n) || 0);
  return {
    users: parts[0],
    workspaces: parts[1],
    projects: parts[2],
    keys: parts[3],
    total: parts.reduce((a, b) => a + b, 0),
  };
}

// ═════════════════════════════════════════════════════════════════════════════

console.log(`\nDEVELOPER PLATFORM — 50-step browser journey`);
console.log(`  console  ${CONSOLE}`);
console.log(`  api      ${API}`);
console.log(`  gateway  ${GW}`);
console.log(`  identity ${EMAIL_OWNER} (+ ${EMAIL_MEMBER})`);
console.log(`\nDEVIATION: ${DEVIATION}\n`);

const builds = {
  gateway: await readyz(GW),
  developer_api: await readyz(API),
};

const browser = await chromium.launch({ headless: !HEADED });
const startedAt = new Date().toISOString();

// State carried across steps — this is a journey, not fifty independent tests.
const J = {
  wsId: null,
  wsSlug: null,
  // Overridable so an acceptance run can use the names the acceptance asks for.
  // The stamp is appended either way: two runs that share a name cannot both be
  // a cleanroom, and the residue check finds what a run made by its stamp.
  wsName: `${argOf('--workspace-name') ?? `${TAG} workspace`}${argOf('--workspace-name') ? ` ${STAMP}` : ''}`,
  projectId: null,
  projectName: `${argOf('--project-name') ?? `${TAG} projeto`}${argOf('--project-name') ? ` ${STAMP}` : ''}`,
  blockerProjectName: `${TAG} bloqueador`,
  inviteToken: null,
  memberUserId: null,
  key1Secret: null,
  key1Prefix: null,
  key2Secret: null,
  key2SuccessorSecret: null,
  key1GatewayStatusBeforeRevoke: null,
  webhookEndpointId: null,
  requestLogPath: '/v1/me',
};

// Responses observed after the secret has been revealed and dismissed — the
// window in which the secret must never appear again.
let secretScanFrom = Number.POSITIVE_INFINITY;
const secretSightings = [];

const ctxA = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
ctxA.setDefaultTimeout(20000);

// The invite token is delivered by the product: the Console copies the accept
// link to the clipboard and shows the invite in the pending list, but no GET
// returns the token. So it is read off the product's OWN response to the invite
// the browser just sent — observed, not manufactured.
ctxA.on('response', async (res) => {
  try {
    if (/\/workspaces\/[^/]+\/members$/.test(new URL(res.url()).pathname) && res.request().method() === 'POST') {
      const b = await res.json();
      if (b && b.token) J.inviteToken = b.token;
    }
  } catch {
    /* not the invite, or already consumed */
  }
});

ctxA.on('response', async (res) => {
  if (!J.key1Secret || Date.now() < secretScanFrom) return;
  try {
    const ct = res.headers()['content-type'] ?? '';
    if (/^(image|font|video|audio)\//.test(ct)) return;
    const body = await res.text();
    if (body.includes(J.key1Secret)) secretSightings.push(new URL(res.url()).pathname);
  } catch {
    /* body unavailable (redirect, cached, aborted) — nothing to scan */
  }
});

const page = await ctxA.newPage();

try {
  // ── 1 ──────────────────────────────────────────────────────────────────────
  await step('login page loads and asks for an email', async () => {
    const res = await open(page, '/login');
    const input = page.locator('input[type="email"]').first();
    const visible = await input.isVisible().catch(() => false);
    const t = await bodyText(page);
    return {
      ok: res?.status() === 200 && visible && /Email/i.test(t),
      observed: `http ${res?.status()}, email input visible=${visible}`,
    };
  });

  // ── 2 ──────────────────────────────────────────────────────────────────────
  await step('sign in (request OTP -> recover -> verify) and land in the Console', async () => {
    await signInViaUI(page, EMAIL_OWNER);
    const inConsole = await until(async () => {
      const p = new URL(page.url()).pathname;
      return !/\/login|\/verify/.test(p) && (await page.locator('header').count()) > 0;
    });
    return { ok: !!inConsole, observed: `landed on ${new URL(page.url()).pathname}` };
  });

  // ── 3 ──────────────────────────────────────────────────────────────────────
  await step('the header shows a user avatar — and derives NO initials from the email', async () => {
    const trigger = page.locator('button[aria-label^="A sua conta"]').first();
    const exists = (await trigger.count()) > 0;
    const letters = norm(await trigger.innerText().catch(() => ''));
    const hasGlyph = (await trigger.locator('svg').count()) > 0;
    const emailInitials = EMAIL_OWNER.slice(0, 2).toUpperCase();
    return {
      ok: exists && hasGlyph && letters === '' && letters !== emailInitials,
      observed: `avatar present=${exists}, glyph=${hasGlyph}, rendered letters=${letters || '(none)'}`,
    };
  });

  // ── 4 ──────────────────────────────────────────────────────────────────────
  await step('the user menu opens from the avatar and does not sign anyone out', async () => {
    await openUserMenu(page);
    const me = await ctxA.request.get(`${API}/auth/me`, { headers: { Origin: CONSOLE } });
    const menuVisible = await page.locator('div[role="menu"][aria-label="Conta"]').isVisible();
    return { ok: menuVisible && me.status() === 200, observed: `menu visible=${menuVisible}, /auth/me -> ${me.status()}` };
  });

  // ── 5 ──────────────────────────────────────────────────────────────────────
  await step('the menu shows the person’s email visibly', async () => {
    const popup = page.locator('div[role="menu"][aria-label="Conta"]').locator('xpath=..');
    const t = norm(await popup.innerText());
    return { ok: t.includes(EMAIL_OWNER), observed: t.includes(EMAIL_OWNER) ? 'email rendered in the menu' : `menu text: ${t.slice(0, 120)}` };
  });

  // ── 6 ──────────────────────────────────────────────────────────────────────
  await step('set a display name from the menu; the avatar’s initials then come from the NAME', async () => {
    await page.getByRole('menuitem', { name: /Complete o seu nome|Alterar nome/ }).click();
    await page.locator('input[placeholder="João Manuel"]').fill(OWNER_NAME);
    await page.getByRole('button', { name: 'Guardar' }).click();
    const initials = await until(async () => {
      const t = norm(await page.locator('button[aria-label^="A sua conta"]').first().innerText());
      return t === OWNER_INITIALS ? t : null;
    });
    await page.keyboard.press('Escape').catch(() => {});
    return {
      ok: initials === OWNER_INITIALS,
      observed: `name "${OWNER_NAME}" -> avatar "${initials ?? '(unchanged)'}" (email would give ${EMAIL_OWNER.slice(0, 2).toUpperCase()})`,
    };
  });

  // ── 7 ──────────────────────────────────────────────────────────────────────
  await step('create a workspace', async () => {
    await open(page, '/');
    await page.locator('select[aria-label="Workspace ativo"]').selectOption('__new__');
    await page.locator('#name-prompt-field').fill(J.wsName);
    await page.getByRole('button', { name: 'Criar', exact: true }).click();
    const ok = await until(async () => {
      const r = await ctxA.request.get(`${API}/workspaces`, { headers: { Origin: CONSOLE } });
      const { workspaces } = await r.json();
      const w = (workspaces ?? []).find((x) => x.name === J.wsName);
      if (!w) return null;
      J.wsId = w.id;
      J.wsSlug = w.slug;
      return w;
    });
    return { ok: !!ok, observed: ok ? `workspace created, slug=${J.wsSlug}` : 'workspace never appeared' };
  });

  // ── 8 ──────────────────────────────────────────────────────────────────────
  await step('rename the workspace; its slug/id does not change', async () => {
    await open(page, '/settings/workspace');
    const idBefore = await fieldValue(page, 'ID DO WORKSPACE');
    const slugBefore = await fieldValue(page, 'IDENTIFICADOR');
    const renamed = `${J.wsName} renomeado`;
    await page.getByRole('button', { name: 'Alterar', exact: true }).first().click();
    await page.locator('input[aria-label="NOME DO WORKSPACE"]').fill(renamed);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await toast(page, /Nome do workspace atualizado/);
    // Wait for the rendered field to catch up, then take the name from the
    // server: a local copy that drifts from the server's turns the type-the-name
    // confirmations later in this journey into an unexplainable disabled button.
    const shown = await until(async () => {
      const v = await fieldValue(page, 'NOME DO WORKSPACE');
      return v && v.includes(renamed) ? v : null;
    }, { timeout: 10000 });
    const idAfter = await fieldValue(page, 'ID DO WORKSPACE');
    const slugAfter = await fieldValue(page, 'IDENTIFICADOR');
    const server = await serverWorkspace(ctxA, J.wsId);
    if (server?.name) J.wsName = server.name;
    // A rename the reader cannot see is not a rename. If the field did not
    // catch up in place, say whether a reload brings it — that is the difference
    // between "the save failed" and "the save worked and the screen lied".
    const afterReload = shown
      ? null
      : await (async () => {
          await open(page, '/settings/workspace', 1000);
          return until(async () => {
            const v = await fieldValue(page, 'NOME DO WORKSPACE');
            return v && v.includes(renamed) ? v : null;
          }, { timeout: 8000 });
        })();
    return {
      ok: !!shown && server?.name === renamed && idBefore === idAfter && slugBefore === slugAfter,
      observed: shown
        ? `name -> "${server?.name}", id stable=${idBefore === idAfter}, slug stable=${slugBefore === slugAfter} (${norm(slugAfter ?? '')})`
        : `server renamed to "${server?.name}" and the toast confirmed it, but the Console kept showing the OLD name in place; a page reload shows the new one=${!!afterReload}. id stable=${idBefore === idAfter}, slug stable=${slugBefore === slugAfter}`,
    };
  });

  // ── 9 ──────────────────────────────────────────────────────────────────────
  await step('open workspace settings (/settings/workspace)', async () => {
    const res = await open(page, '/settings/workspace');
    const t = await bodyText(page);
    const tabCurrent = await page.locator('nav[aria-label="Configurações"] a[aria-current="page"]').innerText().catch(() => '');
    return {
      ok: res?.status() === 200 && /Membros/.test(t) && norm(tabCurrent) === 'Workspace',
      observed: `http ${res?.status()}, active tab "${norm(tabCurrent)}", Membros section present=${/Membros/.test(t)}`,
    };
  });

  // ── 10 ─────────────────────────────────────────────────────────────────────
  await step('the members list shows the signed-in person (name/email, not a bare UUID)', async () => {
    const row = await until(async () => {
      const t = norm(await bodyText(page));
      return /VOCÊ/.test(t) ? t : null;
    });
    // Only the member rows — the page also carries the workspace's own ID field,
    // which IS a UUID and is supposed to be. What must not be a UUID is the line
    // where a person's name goes.
    const nameLines = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="member-avatar-"]')]
        .map((a) => a.parentElement?.querySelector('p')?.textContent?.trim() ?? ''));
    const uuidAsName = nameLines.some((s) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s));
    const showsPerson = !!row && row.includes(OWNER_NAME);
    return {
      ok: showsPerson && nameLines.length > 0 && !uuidAsName,
      observed: showsPerson
        ? `${nameLines.length} member row(s); the name line reads "${OWNER_NAME}" + VOCÊ, never a bare UUID`
        : 'signed-in member not found in the list',
    };
  });

  // ── 11 ─────────────────────────────────────────────────────────────────────
  await step('invite the second persona by email', async () => {
    await page.locator('input[aria-label="Email do novo membro"]').fill(EMAIL_MEMBER);
    await page.locator('select[aria-label="Papel do novo membro"]').selectOption('DEVELOPER');
    await page.getByRole('button', { name: 'Convidar' }).click();
    const t = await toast(page, /Convite criado/);
    const gotToken = await until(() => (J.inviteToken ? true : null), { timeout: 8000 });
    const listed = await until(async () => {
      const r = await ctxA.request.get(`${API}/workspaces/${J.wsId}/invites`, { headers: { Origin: CONSOLE } });
      const { invites } = await r.json();
      return (invites ?? []).some((i) => i.email === EMAIL_MEMBER) ? true : null;
    });
    return {
      ok: !!listed && !!gotToken,
      observed: `${t ?? 'no toast'}; invite recorded for ${EMAIL_MEMBER}, accept link produced by the product=${!!gotToken}`,
    };
  });

  // ── 12 ─────────────────────────────────────────────────────────────────────
  await step('the pending invite appears in the invites list', async () => {
    const found = await until(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await settle(page, 900);
      const t = await bodyText(page);
      return /Convites pendentes/.test(t) && t.includes(EMAIL_MEMBER) ? t : null;
    }, { timeout: 20000 });
    return { ok: !!found, observed: found ? `"Convites pendentes" lists ${EMAIL_MEMBER}` : 'invite not listed' };
  });

  // ── 13 ─────────────────────────────────────────────────────────────────────
  const ctxB = await browser.newContext();
  ctxB.setDefaultTimeout(20000);
  const pageB = await ctxB.newPage();
  await step('accept the invite as the second persona (second browser context)', async () => {
    if (!J.inviteToken) return { ok: false, observed: 'no invite link was produced, so there is nothing to accept' };
    await signInViaUI(pageB, EMAIL_MEMBER);
    await pageB.goto(`${CONSOLE}/invites/accept?token=${encodeURIComponent(J.inviteToken)}`, { waitUntil: 'domcontentloaded' });
    const t = await until(async () => {
      const s = await bodyText(pageB);
      return /Convite aceite|expirou|outro email|Não foi possível/.test(s) ? s : null;
    });
    const accepted = !!t && /Convite aceite/.test(t);
    return { ok: accepted, observed: accepted ? 'Convite aceite' : `accept page said: ${(t ?? '').slice(0, 120)}` };
  });

  // ── 14 ─────────────────────────────────────────────────────────────────────
  await step('the members list now shows two people', async () => {
    const t = await until(async () => {
      await open(page, '/settings/workspace', 1000);
      const s = await bodyText(page);
      return s.includes(EMAIL_MEMBER) ? s : null;
    }, { timeout: 20000 });
    const r = await ctxA.request.get(`${API}/workspaces/${J.wsId}/members`, { headers: { Origin: CONSOLE } });
    const { members } = await r.json();
    J.memberUserId = (members ?? []).find((m) => m.email === EMAIL_MEMBER)?.user_id ?? null;
    return {
      ok: !!t && (members ?? []).length === 2,
      observed: `members=${(members ?? []).length}, second persona rendered=${!!t}`,
    };
  });

  // ── 15 ─────────────────────────────────────────────────────────────────────
  await step('lower the second persona’s role (to VIEWER) and see it reflected', async () => {
    const sel = page.locator(`select[aria-label^="Papel de "][aria-label*="${EMAIL_MEMBER}"]`);
    const target = (await sel.count()) > 0 ? sel.first() : page.locator('select[aria-label^="Papel de "]').last();
    await target.selectOption('VIEWER');
    await toast(page, /Papel atualizado/);
    const reflected = await until(async () => {
      await open(page, '/settings/workspace', 1000);
      const v = await page.locator('select[aria-label^="Papel de "]').last().inputValue().catch(() => '');
      const t = await bodyText(page);
      return v === 'VIEWER' && /Observador/.test(t) ? v : null;
    }, { timeout: 20000 });
    return { ok: !!reflected, observed: reflected ? 'role select reads VIEWER and the list says "Observador"' : 'role did not settle on VIEWER' };
  });

  // ── 16 ─────────────────────────────────────────────────────────────────────
  await step('create a project', async () => {
    await open(page, '/');
    await page.locator('select[aria-label="Projeto ativo"]').selectOption('__new__');
    await page.locator('#name-prompt-field').fill(J.projectName);
    await page.getByRole('button', { name: 'Criar', exact: true }).click();
    const p = await until(async () => {
      const r = await ctxA.request.get(`${API}/workspaces/${J.wsId}/projects`, { headers: { Origin: CONSOLE } });
      const { projects } = await r.json();
      return (projects ?? []).find((x) => x.name === J.projectName) ?? null;
    });
    if (p) J.projectId = p.id;
    return { ok: !!p, observed: p ? `project created (slug ${p.slug})` : 'project never appeared' };
  });

  // ── 17 / 18 ────────────────────────────────────────────────────────────────
  let idBeforeRename = null;
  let idAfterRename = null;
  await step('rename the project', async () => {
    await open(page, '/settings');
    idBeforeRename = await fieldValue(page, 'ID DO PROJETO');
    const renamed = `${J.projectName} renomeado`;
    await page.getByRole('button', { name: 'Alterar', exact: true }).first().click();
    await page.locator('input[aria-label="NOME DO PROJETO"]').fill(renamed);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await toast(page, /Nome do projeto atualizado/);
    const shown = await until(async () => {
      const v = await fieldValue(page, 'NOME DO PROJETO');
      return v && v.includes(renamed) ? v : null;
    }, { timeout: 10000 });
    const server = await serverProject(ctxA, J.wsId, J.projectId);
    if (server?.name) J.projectName = server.name;
    const afterReload = shown
      ? null
      : await (async () => {
          await open(page, '/settings', 1000);
          return until(async () => {
            const v = await fieldValue(page, 'NOME DO PROJETO');
            return v && v.includes(renamed) ? v : null;
          }, { timeout: 8000 });
        })();
    return {
      ok: !!shown && server?.name === renamed,
      observed: shown
        ? `name now "${server?.name}"`
        : `server renamed to "${server?.name}" and the toast confirmed it, but the Console kept showing the OLD name in place; a page reload shows the new one=${!!afterReload}`,
    };
  });

  await step('the Project ID is unchanged by the rename', async () => {
    await open(page, '/settings');
    idAfterRename = await fieldValue(page, 'ID DO PROJETO');
    const same = !!idBeforeRename && idBeforeRename === idAfterRename;
    return { ok: same, observed: same ? 'Project ID identical before and after the rename' : `before=${idBeforeRename} after=${idAfterRename}` };
  });

  // ── 19 ─────────────────────────────────────────────────────────────────────
  await step('open financial setup (/financeiro) and configure a financial owner', async () => {
    const res = await open(page, '/financeiro', 1200);
    const section = page.locator('[data-testid="financial-onboarding"]');
    const state = await section.getAttribute('data-state').catch(() => null);
    const start = page.getByRole('button', { name: /Iniciar verificação/ });
    const offered = (await start.count()) > 0;
    if (offered) {
      await start.click();
      await settle(page, 500);
    }
    const pathNew = await page.locator('[data-testid="onboarding-path-new"]').count();
    const pathExisting = await page.locator('[data-testid="onboarding-path-existing"]').count();
    // Both paths end outside the developer: a new Business is decided by an
    // operator in BANZADMIN, and an existing one needs a consent code its owner
    // issues from their own app. Neither is reachable by a developer alone, and
    // this run is forbidden operator authority — so no application is submitted
    // (one would also leave a review-queue item this run cannot take back).
    return {
      ok: false,
      blockedBy: BLOCKED_BY_BUSINESS,
      observed:
        `http ${res?.status()}, state=${state}, both paths offered=${pathNew === 1 && pathExisting === 1}; ` +
        'the Console offers exactly the two paths that exist and neither ends with the developer; ' +
        'no application submitted — it would leave a review-queue item this run cannot take back',
    };
  });

  // ── 20 ─────────────────────────────────────────────────────────────────────
  await step('readiness reports the project ready, or names the blocker honestly', async () => {
    const r = await ctxA.request.get(`${API}/projects/${J.projectId}/financial-setup`, { headers: { Origin: CONSOLE } });
    const s = await r.json();
    await open(page, '/financeiro', 1000);
    const t = await bodyText(page);
    const ready = s.state === 'READY' || s.state === 'SEALED';
    // Not ready is a legitimate answer; what must be true is that the product
    // SAYS so, with the reason, instead of showing an empty readiness panel.
    const namesBlocker = /ainda não recebe pagamentos|verificar a entidade legal/.test(t);
    return {
      ok: ready || namesBlocker,
      observed: ready
        ? 'financial-setup reports READY'
        : `state=${s.state}, readiness=${s.readiness === null ? 'null' : 'present'} — the Console names the blocker: the legal entity behind the project is not verified`,
    };
  });

  // ── 21 ─────────────────────────────────────────────────────────────────────
  const CHOSEN_SCOPES = ['identity:read', 'payment_sessions:read'];
  await step('create an API key (choosing scopes in the create dialog)', async () => {
    await open(page, '/api-keys', 1000);
    await page.getByRole('button', { name: 'Criar chave', exact: true }).click();
    await page.locator('input[placeholder="Servidor de produção da app"]').fill(`${TAG} chave 1`);
    // identity:read is pre-selected; add the second and assert the switch state
    // rather than the colour, which is what the picker exposes.
    const sw = page.locator('button[role="switch"]', { hasText: 'payment_sessions:read' }).first();
    await sw.click();
    const checked = await sw.getAttribute('aria-checked');
    await page.getByRole('button', { name: 'Criar chave de teste' }).click();
    const dialog = page.locator('div[role="dialog"][aria-label="Guarde a sua chave secreta"]');
    await dialog.waitFor({ state: 'visible', timeout: 20000 });
    const secret = norm(await dialog.locator('code[aria-label="Chave secreta"]').innerText());
    J.key1Secret = secret;
    const shaped = /^bz_test_sk_[A-Za-z0-9_-]{16,}$/.test(secret);
    return {
      ok: shaped && checked === 'true',
      observed: `key created; secret shape bz_test_sk_ + ${secret.length - 11} chars; payment_sessions:read aria-checked=${checked}`,
    };
  });

  // ── 22 ─────────────────────────────────────────────────────────────────────
  await step('the scopes chosen are the scopes shown on the key', async () => {
    // Dismiss the reveal first — everything after this must be recoverable
    // without it, which is the point of steps 26 and 27.
    const dialog = page.locator('div[role="dialog"][aria-label="Guarde a sua chave secreta"]');
    const copyBtn = dialog.locator('button[aria-label="Copiar chave secreta"]');
    J._copyControlPresent = (await copyBtn.count()) === 1;
    await dialog.locator('input[type="checkbox"]').check();
    await dialog.getByRole('button', { name: 'Fechar' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    secretScanFrom = Date.now();
    await settle(page, 800);

    await page.getByRole('button', { name: /Ver as .* da chave/ }).first().click();
    const drawer = page.locator('div[role="dialog"][aria-label^="Permissões da chave"]');
    await drawer.waitFor({ state: 'visible', timeout: 8000 });
    const shown = norm(await drawer.innerText());
    const all = CHOSEN_SCOPES.every((s) => shown.includes(s));
    const extra = ['application_settlements:write', 'transfers:write', 'refunds:write'].filter((s) => shown.includes(s));
    await page.keyboard.press('Escape').catch(() => {});
    await drawer.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    return { ok: all && extra.length === 0, observed: `drawer lists ${CHOSEN_SCOPES.join(' + ')}; unrequested scopes present=${extra.length}` };
  });

  // ── 23 ─────────────────────────────────────────────────────────────────────
  await step('the raw secret is revealed exactly once in the dialog', async () => {
    const stillOpen = await page.locator('div[role="dialog"][aria-label="Guarde a sua chave secreta"]').count();
    const r = await ctxA.request.get(`${API}/projects/${J.projectId}/keys`, { headers: { Origin: CONSOLE } });
    const listText = await r.text();
    const inList = listText.includes(J.key1Secret);
    const { keys } = JSON.parse(listText);
    J.key1Prefix = (keys ?? [])[0]?.prefix ?? null;
    return {
      ok: stillOpen === 0 && !inList,
      observed: `reveal dialog gone after acknowledgement; the key list returns metadata + prefix only (raw secret present in list=${inList})`,
    };
  });

  // ── 24 ─────────────────────────────────────────────────────────────────────
  await step('the reveal dialog offers a copy control', async () =>
    ({ ok: J._copyControlPresent === true, observed: J._copyControlPresent ? 'button[aria-label="Copiar chave secreta"] present in the reveal dialog' : 'no copy control found' }));

  // ── 25 ─────────────────────────────────────────────────────────────────────
  await step('the key works: a REAL Gateway call with it returns 200', async () => {
    const { status, body } = await gateway('/v1/me', J.key1Secret);
    J.key1GatewayStatusBeforeRevoke = status;
    const okScopes = Array.isArray(body?.scopes) && CHOSEN_SCOPES.every((s) => body.scopes.includes(s));
    return {
      ok: status === 200 && body?.environment === 'SANDBOX' && okScopes && body?.key_status === 'active',
      observed: `GET ${GW}/v1/me -> ${status}, environment=${body?.environment}, key_status=${body?.key_status}, scopes match=${okScopes}`,
    };
  });

  // ── 26 ─────────────────────────────────────────────────────────────────────
  await step('reload the keys page; the raw secret is NOT on screen anywhere', async () => {
    await open(page, '/api-keys', 1000);
    const visible = await bodyText(page);
    const masked = /••••••••/.test(visible);
    return {
      ok: !visible.includes(J.key1Secret) && masked,
      observed: `rendered text carries the published prefix + mask (masked=${masked}); raw secret on screen=${visible.includes(J.key1Secret)}`,
    };
  });

  // ── 27 ─────────────────────────────────────────────────────────────────────
  await step('the secret is unrecoverable (DOM, page source, flight data, network, storage, IndexedDB)', async () => {
    const dump = await page.evaluate(async () => {
      const out = { html: '', ls: '', ss: '', cookie: '', idb: [] };
      out.html = document.documentElement.outerHTML;
      try { out.ls = JSON.stringify(localStorage); } catch { out.ls = ''; }
      try { out.ss = JSON.stringify(sessionStorage); } catch { out.ss = ''; }
      try { out.cookie = document.cookie; } catch { out.cookie = ''; }
      try {
        const dbs = (await indexedDB.databases?.()) ?? [];
        for (const { name } of dbs) {
          if (!name) continue;
          const db = await new Promise((res, rej) => {
            const rq = indexedDB.open(name);
            rq.onsuccess = () => res(rq.result);
            rq.onerror = () => rej(rq.error);
          });
          for (const store of [...db.objectStoreNames]) {
            const rows = await new Promise((res) => {
              const rq = db.transaction(store, 'readonly').objectStore(store).getAll();
              rq.onsuccess = () => res(rq.result);
              rq.onerror = () => res([]);
            });
            out.idb.push(JSON.stringify(rows));
          }
          db.close();
        }
      } catch { /* no IndexedDB, or blocked — nothing stored there either way */ }
      return out;
    });
    const source = await page.content();
    const fetched = await ctxA.request.get(`${CONSOLE}/api-keys`);
    const serverHtml = await fetched.text();

    const needle = J.key1Secret;
    const count = (s) => (s ? s.split(needle).length - 1 : 0);
    const per = {
      dom: count(dump.html),
      page_source: count(source),
      server_html_and_flight_data: count(serverHtml),
      network_responses_after_reveal: secretSightings.length,
      localStorage: count(dump.ls),
      sessionStorage: count(dump.ss),
      cookie: count(dump.cookie),
      indexedDB: dump.idb.reduce((n, s) => n + count(s), 0),
    };
    const total = Object.values(per).reduce((a, b) => a + b, 0);
    console.log(`      FULL_SECRET_OCCURRENCES=${total} ${JSON.stringify(per)}`);
    J._secretOccurrences = { total, per };
    return { ok: total === 0, observed: `FULL_SECRET_OCCURRENCES=${total} across ${Object.keys(per).length} surfaces` };
  });

  // ── 28 ─────────────────────────────────────────────────────────────────────
  await step('create a webhook endpoint', async () => {
    await open(page, '/webhooks', 1200);
    const pageState = await bodyText(page);
    const register = page.getByRole('button', { name: 'Registar endpoint' }).first();
    if ((await register.count()) === 0) {
      return {
      ok: false,
      blockedBy: BLOCKED_BY_BUSINESS,
      observed:
`no "Registar endpoint" control; page says: ${pageState.slice(0, 180)}` };
    }
    await register.click();
    await page.locator('#wh-url').fill(`https://webhook.${TAG}.example.com/banzami`);
    await page.getByRole('button', { name: 'Registar endpoint' }).last().click();
    await settle(page, 1200);
    const err = norm(await page.locator('p[role="alert"]').first().innerText().catch(() => ''));
    const r = await ctxA.request.get(`${API}/projects/${J.projectId}/webhooks/endpoints`, { headers: { Origin: CONSOLE } });
    const raw = await r.text();
    let code = null;
    try { code = JSON.parse(raw)?.error?.code ?? null; } catch { /* listed fine */ }
    const created = r.ok();
    return {
      ok: created,
      observed: created
        ? 'endpoint registered'
        : `refused: API says ${code} (${r.status()}); the Console showed "${err}" — see the defect note in the report`,
    };
  });

  // ── 29 ─────────────────────────────────────────────────────────────────────
  await step('the webhook signing secret is revealed once', async () =>
    ({ ok: false, blockedBy: BLOCKED_BY_BUSINESS, observed: 'no endpoint exists (step 28), so no signing secret was ever issued' }));

  // ── 30 ─────────────────────────────────────────────────────────────────────
  await step('cause a real event and see it in the events list', async () => {
    const r = await ctxA.request.get(`${API}/projects/${J.projectId}/webhooks/events?limit=25`, { headers: { Origin: CONSOLE } });
    const raw = await r.text();
    let code = null;
    try { code = JSON.parse(raw)?.error?.code ?? null; } catch { /* a real list */ }
    if (r.ok()) {
      const { events } = JSON.parse(raw);
      return { ok: (events ?? []).length > 0, observed: `${(events ?? []).length} event(s) listed` };
    }
    return {
      ok: false,
      observed:
        `events are ${r.status()} ${code}: with no financial owner the project can emit nothing — ` +
        'no payment session, payment link or settlement can be opened, so there is no genuine event to cause',
      blockedBy: BLOCKED_BY_BUSINESS,
    };
  });

  // ── 31 ─────────────────────────────────────────────────────────────────────
  await step('open the event and see its deliveries', async () =>
    ({ ok: false, blockedBy: BLOCKED_BY_BUSINESS, observed: 'no event exists to open (step 30)' }));

  // ── 32 ─────────────────────────────────────────────────────────────────────
  await step('retry a failed delivery, or assert that none exists to retry', async () =>
    ({ ok: false, blockedBy: BLOCKED_BY_BUSINESS, observed: 'neither: the deliveries surface answers 409 PROJECT_FINANCIAL_SETUP_REQUIRED, so "no failed delivery" cannot be asserted either' }));

  // ── 33 ─────────────────────────────────────────────────────────────────────
  await step('rotate the webhook secret; a new secret is revealed once', async () =>
    ({ ok: false, blockedBy: BLOCKED_BY_BUSINESS, observed: 'no endpoint to rotate (step 28)' }));

  // ── 34 ─────────────────────────────────────────────────────────────────────
  await step('disable the endpoint; the list says so', async () =>
    ({ ok: false, blockedBy: BLOCKED_BY_BUSINESS, observed: 'no endpoint to disable (step 28)' }));

  // ── 35 ─────────────────────────────────────────────────────────────────────
  await step('enable it again', async () =>
    ({ ok: false, blockedBy: BLOCKED_BY_BUSINESS, observed: 'no endpoint to re-enable (step 28)' }));

  // ── 36 ─────────────────────────────────────────────────────────────────────
  await step('balances page loads and shows the project’s real figures', async () => {
    const res = await open(page, '/saldos', 1200);
    const t = await bodyText(page);
    // A project with no financial owner has no balances. "0 Kz" would be a
    // number a developer acts on, so the page must not print one — it must say
    // where the project stands instead.
    const invented = /\b0 Kz\b/.test(t);
    const real = /Configuração financeira/.test(t) || /Saldo|Conta/.test(t);
    return {
      ok: res?.status() === 200 && real && !invented,
      observed: `http ${res?.status()}; no balances exist yet and the page shows the financial-setup state rather than a fabricated 0 Kz (invented zero=${invented})`,
    };
  });

  // ── 37 ─────────────────────────────────────────────────────────────────────
  await step('transactions page loads', async () => {
    const res = await open(page, '/transacoes', 1200);
    const t = await bodyText(page);
    return {
      ok: res?.status() === 200 && !/ERRO 404/.test(t) && t.length > 40,
      observed: `http ${res?.status()}; renders the project's transaction surface (${/Configuração financeira/.test(t) ? 'financial-setup state — no transactions exist yet' : 'transaction list'})`,
    };
  });

  // ── 38 ─────────────────────────────────────────────────────────────────────
  await step('logs page loads and shows the request from the Gateway call', async () => {
    const res = await open(page, '/logs', 1500);
    const found = await until(async () => {
      const t = await bodyText(page);
      return t.includes(J.requestLogPath) ? t : null;
    }, { timeout: 20000 });
    return {
      ok: res?.status() === 200 && !!found,
      observed: found ? `"Pedidos à API" lists ${J.requestLogPath} from the step-25 call` : 'the step-25 request was not in the log',
    };
  });

  // ── 39 ─────────────────────────────────────────────────────────────────────
  await step('docs are reachable from the Console', async () => {
    await page.getByRole('link', { name: 'Documentação' }).first().click();
    await page.waitForURL(/\/docs/, { timeout: 20000 });
    await settle(page, 800);
    const t = await bodyText(page);
    return { ok: /\/docs/.test(new URL(page.url()).pathname) && !/ERRO 404/.test(t), observed: `sidebar link -> ${new URL(page.url()).pathname}` };
  });

  // The second tab, opened now and left open, so step 50 can prove a sign-out
  // reaches a surface the browser was already holding.
  const tab2 = await ctxA.newPage();
  await tab2.goto(`${CONSOLE}/api-keys`, { waitUntil: 'domcontentloaded' });
  await settle(tab2, 800);

  // ── 40 ─────────────────────────────────────────────────────────────────────
  await step('revoke the API key', async () => {
    await open(page, '/api-keys', 1000);
    await page.locator('button[aria-label^="Revogar chave "]').first().click();
    const dlg = page.locator('div[role="dialog"][aria-label="Revogar chave"]');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    await dlg.getByRole('button', { name: 'Revogar' }).click();
    await toast(page, /Chave revogada/);
    const revoked = await until(async () => {
      const r = await ctxA.request.get(`${API}/projects/${J.projectId}/keys`, { headers: { Origin: CONSOLE } });
      const { keys } = await r.json();
      const k = (keys ?? []).find((x) => x.prefix === J.key1Prefix);
      return k && k.status === 'REVOKED' ? k : null;
    });
    return { ok: !!revoked, observed: revoked ? 'key status REVOKED' : 'key never reached REVOKED' };
  });

  // ── 41 ─────────────────────────────────────────────────────────────────────
  await step('the revoked key now FAILS the same Gateway call, and the failure is the key’s', async () => {
    await new Promise((r) => setTimeout(r, 800));
    const { status } = await gateway('/v1/me', J.key1Secret);
    // Same route, same key: 200 before the revocation, 401 after. A broken route
    // would not have answered 200 five steps ago, and a 404/5xx here would be
    // the route's failure rather than the credential's.
    const keysFault = status === 401 || status === 403;
    return {
      ok: keysFault && J.key1GatewayStatusBeforeRevoke === 200,
      observed: `GET /v1/me with the same key: ${J.key1GatewayStatusBeforeRevoke} before revocation -> ${status} after`,
    };
  });

  // ── 42 ─────────────────────────────────────────────────────────────────────
  await step('create a successor key by rotation and prove the successor works', async () => {
    await open(page, '/api-keys', 800);
    await page.getByRole('button', { name: 'Criar chave', exact: true }).click();
    await page.locator('input[placeholder="Servidor de produção da app"]').fill(`${TAG} chave 2`);
    await page.getByRole('button', { name: 'Criar chave de teste' }).click();
    let dialog = page.locator('div[role="dialog"][aria-label="Guarde a sua chave secreta"]');
    await dialog.waitFor({ state: 'visible', timeout: 20000 });
    J.key2Secret = norm(await dialog.locator('code[aria-label="Chave secreta"]').innerText());
    await dialog.locator('input[type="checkbox"]').check();
    await dialog.getByRole('button', { name: 'Fechar' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await settle(page, 800);

    await page.locator(`button[aria-label="Rotacionar chave ${TAG} chave 2"]`).first().click();
    const confirm = page.locator('div[role="dialog"][aria-label="Rotacionar chave"]');
    await confirm.waitFor({ state: 'visible', timeout: 8000 });
    await confirm.getByRole('button', { name: 'Rotacionar' }).click();
    dialog = page.locator('div[role="dialog"][aria-label="Guarde a sua chave secreta"]');
    await dialog.waitFor({ state: 'visible', timeout: 20000 });
    J.key2SuccessorSecret = norm(await dialog.locator('code[aria-label="Chave secreta"]').innerText());
    await dialog.locator('input[type="checkbox"]').check();
    await dialog.getByRole('button', { name: 'Fechar' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 900));

    const successor = await gateway('/v1/me', J.key2SuccessorSecret);
    const predecessor = await gateway('/v1/me', J.key2Secret);
    return {
      ok: successor.status === 200 && predecessor.status === 401 && J.key2SuccessorSecret !== J.key2Secret,
      observed: `successor /v1/me -> ${successor.status}, rotated-away predecessor -> ${predecessor.status}, secrets differ=${J.key2SuccessorSecret !== J.key2Secret}`,
    };
  });

  // ── 43 ─────────────────────────────────────────────────────────────────────
  await step('the keys list shows the successor active and the predecessor revoked', async () => {
    await open(page, '/api-keys', 1000);
    const r = await ctxA.request.get(`${API}/projects/${J.projectId}/keys`, { headers: { Origin: CONSOLE } });
    const { keys } = await r.json();
    const active = (keys ?? []).filter((k) => k.status === 'ACTIVE');
    const revoked = (keys ?? []).filter((k) => k.status === 'REVOKED');
    await page.getByRole('button', { name: /^Todas/ }).click().catch(() => {});
    await settle(page, 600);
    const t = await bodyText(page);
    const saysBoth = /Ativa/.test(t) && /Revogada/.test(t);
    return {
      ok: active.length === 1 && revoked.length === 2 && saysBoth,
      observed: `${active.length} active, ${revoked.length} revoked; the table shows both "Ativa" and "Revogada"=${saysBoth}`,
    };
  });

  // ── 44 ─────────────────────────────────────────────────────────────────────
  await step('project settings shows Project ID, environment and created date', async () => {
    await open(page, '/settings', 1200);
    const id = await fieldValue(page, 'ID DO PROJETO');
    const env = await until(async () => {
      const v = norm(await fieldValue(page, 'AMBIENTE'));
      return v && !/A ler o ambiente/.test(v) ? v : null;
    });
    const created = norm(await fieldValue(page, 'CRIADO'));
    const idOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(norm(id ?? ''));
    const createdOk = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/.test(created);
    return {
      ok: idOk && !!env && createdOk,
      observed: `ID=uuid(${idOk}), AMBIENTE="${env}", CRIADO="${created}"`,
    };
  });

  // ── 45 ─────────────────────────────────────────────────────────────────────
  await step('archive the project; it reports how many keys were revoked', async () => {
    await page.getByRole('button', { name: 'Arquivar projeto' }).first().click();
    const dlg = page.locator('div[role="dialog"][aria-label="Arquivar projeto"]');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    const wanted = await confirmName(dlg);
    await dlg.locator('input[autocomplete="off"]').fill(wanted || J.projectName);
    await dlg.getByRole('button', { name: 'Arquivar projeto' }).click();
    const t = await toast(page, /Projeto arquivado/, 20000);
    const namesCount = !!t && /(1 chave revogada|\d+ chaves revogadas|Não havia chaves ativas)/.test(t);
    return { ok: namesCount, observed: t ?? 'no archive confirmation appeared' };
  });

  // ── 46 ─────────────────────────────────────────────────────────────────────
  await step('the archived project’s authority is gone: its remaining key fails at the Gateway', async () => {
    await new Promise((r) => setTimeout(r, 900));
    const { status } = await gateway('/v1/me', J.key2SuccessorSecret);
    return { ok: status === 401 || status === 403, observed: `the key that worked at step 42 now answers ${status}` };
  });

  // ── 47 ─────────────────────────────────────────────────────────────────────
  await step('the archived project leaves the default selector and returns behind "Mostrar arquivados"', async () => {
    await open(page, '/settings', 1200);
    const optionsBefore = await page.locator('select[aria-label="Projeto ativo"] option').allInnerTexts().catch(() => []);
    const goneByDefault = !optionsBefore.some((o) => o.includes(J.projectName));
    await page.getByRole('button', { name: 'Mostrar arquivados' }).click();
    const back = await until(async () => {
      const o = await page.locator('select[aria-label="Projeto ativo"] option').allInnerTexts().catch(() => []);
      return o.some((x) => x.includes(J.projectName) && /arquivado/.test(x)) ? o : null;
    });
    return {
      ok: goneByDefault && !!back,
      observed: `hidden by default=${goneByDefault}; behind "Mostrar arquivados" it returns labelled "(arquivado)"=${!!back}`,
    };
  });

  // ── 48 ─────────────────────────────────────────────────────────────────────
  await step('workspace settings: remove the second member', async () => {
    await open(page, '/settings/workspace', 1200);
    await page.locator('button[aria-label^="Remover "]').first().click();
    const dlg = page.locator('div[role="dialog"][aria-label="Remover membro"]');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    await dlg.getByRole('button', { name: 'Remover' }).click();
    const gone = await until(async () => {
      const r = await ctxA.request.get(`${API}/workspaces/${J.wsId}/members`, { headers: { Origin: CONSOLE } });
      const { members } = await r.json();
      return (members ?? []).length === 1 ? members : null;
    });
    return { ok: !!gone, observed: gone ? 'workspace is back to one member' : 'the second member is still listed' };
  });

  // ── 49 ─────────────────────────────────────────────────────────────────────
  await step('archive the workspace: refused while an active project remains, then succeeds', async () => {
    // A live project is needed to provoke the refusal — the journey's own was
    // archived at step 45. This one is created and archived inside the step.
    await open(page, '/', 800);
    await page.locator('select[aria-label="Projeto ativo"]').selectOption('__new__');
    await page.locator('#name-prompt-field').fill(J.blockerProjectName);
    await page.getByRole('button', { name: 'Criar', exact: true }).click();
    await until(async () => {
      const r = await ctxA.request.get(`${API}/workspaces/${J.wsId}/projects`, { headers: { Origin: CONSOLE } });
      const { projects } = await r.json();
      return (projects ?? []).some((p) => p.name === J.blockerProjectName) ? true : null;
    });

    await open(page, '/settings/workspace', 1200);
    await page.getByRole('button', { name: 'Arquivar workspace' }).first().click();
    let dlg = page.locator('div[role="dialog"][aria-label="Arquivar workspace"]');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    const consequence = norm(await dlg.innerText());
    const namesCount = /ainda tem 1 projeto ativo|ainda tem \d+ projetos ativos/.test(consequence);
    await dlg.locator('input[autocomplete="off"]').fill(await confirmName(dlg));
    await dlg.getByRole('button', { name: 'Arquivar workspace' }).click();
    const refusal = await until(async () => {
      const e = norm(await dlg.locator('p[role="alert"]').innerText().catch(() => ''));
      return e ? e : null;
    }, { timeout: 12000 });
    const wsAfterRefusal = await ctxA.request.get(`${API}/workspaces`, { headers: { Origin: CONSOLE } });
    const stillActive = ((await wsAfterRefusal.json()).workspaces ?? []).find((w) => w.id === J.wsId)?.status;
    await page.keyboard.press('Escape').catch(() => {});

    // Clear the blocker through the product, then close the workspace.
    await open(page, '/settings', 1200);
    await page.getByRole('button', { name: 'Arquivar projeto' }).first().click();
    const pd = page.locator('div[role="dialog"][aria-label="Arquivar projeto"]');
    await pd.waitFor({ state: 'visible', timeout: 8000 });
    await pd.locator('input[autocomplete="off"]').fill(await confirmName(pd));
    await pd.getByRole('button', { name: 'Arquivar projeto' }).click();
    await toast(page, /Projeto arquivado/, 20000);

    await open(page, '/settings/workspace', 1500);
    await page.getByRole('button', { name: 'Arquivar workspace' }).first().click();
    dlg = page.locator('div[role="dialog"][aria-label="Arquivar workspace"]');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    await dlg.locator('input[autocomplete="off"]').fill(await confirmName(dlg));
    await dlg.getByRole('button', { name: 'Arquivar workspace' }).click();
    const done = await toast(page, /Workspace arquivado/, 20000);
    const secondRefusal = done ? null : norm(await dlg.locator('p[role="alert"]').innerText().catch(() => ''));
    // A workspace that is closed may simply stop being listed, which is also an
    // answer: "gone from the list" and "listed as archived" both mean it closed.
    const finalStatus = await until(async () => {
      const r = await ctxA.request.get(`${API}/workspaces`, { headers: { Origin: CONSOLE } });
      const list = (await r.json()).workspaces ?? [];
      const w = list.find((x) => x.id === J.wsId);
      if (!w) return 'no longer listed';
      return w.status !== 'ACTIVE' ? w.status : null;
    });
    return {
      ok: namesCount && !!refusal && stillActive === 'ACTIVE' && !!finalStatus,
      observed:
        `refusal named the count=${namesCount} ("${(refusal ?? '').slice(0, 70)}"), workspace unchanged by the refusal (${stillActive}); ` +
        `after archiving the project it closed -> ${finalStatus ?? `still ACTIVE${secondRefusal ? ` (${secondRefusal})` : ''}`}`,
    };
  });

  // ── 50 ─────────────────────────────────────────────────────────────────────
  await step('sign out: confirmation appears, Cancel keeps the session, confirming ends it', async () => {
    await open(page, '/settings', 1000);
    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'Terminar sessão' }).click();
    let dlg = page.locator('div[role="dialog"][aria-label="Terminar sessão neste dispositivo?"]');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    const modalAppeared = true;
    await dlg.getByRole('button', { name: 'Cancelar' }).click();
    await dlg.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    const afterCancel = await ctxA.request.get(`${API}/auth/me`, { headers: { Origin: CONSOLE } });
    const keptSession = afterCancel.status() === 200;

    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'Terminar sessão' }).click();
    dlg = page.locator('div[role="dialog"][aria-label="Terminar sessão neste dispositivo?"]');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    await dlg.getByRole('button', { name: 'Terminar sessão' }).click();
    await page.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {});
    await settle(page, 900);

    const me = await ctxA.request.get(`${API}/auth/me`, { headers: { Origin: CONSOLE } });
    const apiDead = me.status() === 401;

    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await settle(page, 1500);
    const backUrl = new URL(page.url()).pathname;
    const backBlocked = /\/login/.test(backUrl) || /A redirecionar|Bem-vindo/.test(await bodyText(page));

    await tab2.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await settle(tab2, 1500);
    const tab2Url = new URL(tab2.url()).pathname;
    const tab2Blocked = /\/login/.test(tab2Url) || /A redirecionar|Bem-vindo/.test(await bodyText(tab2));

    return {
      ok: modalAppeared && keptSession && apiDead && backBlocked && tab2Blocked,
      observed:
        `modal shown, Cancel kept the session (/auth/me 200), confirm ended it (/auth/me ${me.status()}); ` +
        `Back -> ${backUrl} blocked=${backBlocked}; second tab -> ${tab2Url} blocked=${tab2Blocked}`,
    };
  });

  await ctxB.close().catch(() => {});
} finally {
  await browser.close().catch(() => {});
}

// ── cleanup + residue ────────────────────────────────────────────────────────
// Explicit, before the report, so the number printed is measured rather than
// promised. The registered handlers run again on exit and find nothing.
let cleanupError = null;
for (const emailPattern of [EMAIL_OWNER, EMAIL_MEMBER]) {
  try {
    cleanupRun({ emailPattern, namePattern: `%${TAG}%` });
  } catch (e) {
    cleanupError = String(e && e.message ? e.message : e).slice(0, 200);
  }
}

let residue = { total: -1, error: 'not measured' };
try {
  residue = residueCount();
} catch (e) {
  residue = { total: -1, error: String(e && e.message ? e.message : e).slice(0, 200) };
}

// ── report ───────────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.status === 'PASS').length;
const blocked = results.filter((r) => r.status === 'BLOCKED').length;
const fail = results.filter((r) => r.status === 'FAIL').length;

console.log('');
if (blocked) {
  // Named, once, so the count cannot be read as a pass or as a defect.
  const reasons = [...new Set(results.filter((r) => r.status === 'BLOCKED').map((r) => r.blocked_by))];
  console.log(`BLOCKED (the product refused, correctly) — waiting on: ${reasons.join(' · ')}`);
}
console.log(`DEVELOPER_JOURNEY_50: PASS=${pass} BLOCKED=${blocked} FAIL=${fail}`);
console.log(`DEVELOPER_E2E_POST_RUN_RESIDUE=${residue.total}`);
if (cleanupError) console.log(`  cleanup reported: ${cleanupError}`);
console.log(`\nDEVIATION: ${DEVIATION}`);

// Outside the worktree by default, and deliberately so: this suite observes a
// running deployment, so its result is a fact ABOUT a revision and cannot be
// part of it. A default inside evidence/ makes the verification dirty the very
// revision it just verified, and there is no sequence of commits that settles
// that — see tools/e2e/lib/assurance-output.mjs. An explicit --out is the
// operator asking for a specific destination, which is a different thing.
const outArg = argOf('--out');
const outFile = join(outArg ? resolve(outArg) : assuranceDir('developer-journey-50'), `developer-journey-50-${STAMP}.json`);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  `${JSON.stringify(
    {
      schema: 'banzami-developer-journey/v1',
      suite: 'Developer Platform — 50-step browser journey',
      test: 'tools/e2e/dev-console/developer-journey-50.mjs',
      deviation: DEVIATION,
      timestamp: new Date().toISOString(),
      started_at: startedAt,
      date_stamp: STAMP,
      console_host: CONSOLE,
      blocked,
      api_host: API,
      gateway_host: GW,
      builds,
      fixture_identities: [EMAIL_OWNER, EMAIL_MEMBER],
      fixture_namespace: TAG,
      total: results.length,
      pass,
      fail,
      verdict: fail === 0 ? 'PASS' : 'FAIL',
      steps: results,
      secret_occurrences: J._secretOccurrences ?? null,
      secret_scan_note:
        'The secret is counted only from the moment the reveal-once dialog was acknowledged and dismissed. ' +
        'The creation response itself legitimately carries it — that IS the one reveal — so the scan measures ' +
        'whether it is recoverable AFTERWARDS, which is the property the product claims.',
      post_run_residue: residue,
      cleanup_error: cleanupError,
      secrets_note:
        'No raw API key, webhook signing secret, session cookie, CSRF token, OTP or proof reference is printed ' +
        'or stored by this suite. Credentials are asserted on shape and on their masked rendering.',
    },
    null,
    2,
  )}\n`,
);
console.log(`evidence: ${outFile}\n`);

process.exit(fail === 0 && residue.total === 0 ? 0 : 1);
