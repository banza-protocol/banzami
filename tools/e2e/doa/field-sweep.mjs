#!/usr/bin/env node
/**
 * Every field DOA shows a signed-in person, and what it actually says.
 *
 * The public sweep covers what a stranger sees. Almost nothing a creator or an
 * operator sees is public, so the surfaces where the product spends most of its
 * words had never been read by anything. This signs in through the product's own
 * login — a real code, emailed and typed — and then reads each page field by
 * field rather than asking whether the page loaded.
 *
 * What it looks for is the residue that survives a passing page:
 *
 *   a label with nothing under it        — a field the product decided to show
 *                                          and then had nothing to put in
 *   undefined / null / NaN / Invalid Date — a value that failed to render and
 *                                          said so to the reader
 *   a bare UUID or a raw enum             — the database's vocabulary reaching
 *                                          a person who did not ask for it
 *   an unnamed control                    — nothing a screen reader can announce
 *   a disabled control with no reason     — a dead end with no explanation
 *
 * Sessions are real: an account is created, the login code is read back from the
 * sending account's own record of what it sent, and the six digits are typed
 * into the verify screen. Nothing reads or writes otp_verifications.
 *
 *   node tools/e2e/doa/field-sweep.mjs --campaign <slug>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { assuranceDir } from '../lib/assurance-output.mjs';

const DOA = process.env.DOA_REPO ?? '/Users/fm65/doa';
const { chromium } = await import(`${DOA}/node_modules/@playwright/test/index.mjs`);
const { supabaseKeys } = await import(`${DOA}/scripts/e2e/supabase-refs.mjs`);
const { admin } = await import(`${DOA}/scripts/e2e/admin-session.mjs`);

const argv = process.argv.slice(2);
const slug = argv.includes('--campaign') ? argv[argv.indexOf('--campaign') + 1] : null;

const keys = supabaseKeys();
const svc = admin(keys.url, keys.secret);

let fails = 0;
const rows = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { fails += 1; console.error(`  ✗ ${m}`); };

const resend = (...args) => JSON.parse(
  execFileSync('npx', ['--yes', 'resend-cli@2.19.0', ...args, '--json'],
    { encoding: 'utf8', maxBuffer: 1 << 24, cwd: DOA }));

/** The code the product emailed, read from the sending account — never the DB. */
async function codeSentTo(address, notBefore) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    for (const e of (resend('emails', 'list', '--limit', '25').data ?? [])
      .filter((x) => (x.to ?? []).includes(address) && new Date(x.created_at ?? 0).getTime() >= notBefore - 60000)) {
      const full = resend('emails', 'get', e.id);
      const code = /(\d{6})/.exec(full.subject ?? '')?.[1] ?? /(\d{6})/.exec(full.text ?? '')?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

/** Sign in on `origin` as a freshly created account of `role`, the real way. */
async function signIn(browser, origin, role) {
  const email = `e2e-fields-${Date.now().toString(36)}@doadoa.app`;
  const { data, error } = await svc.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  await svc.from('profiles').upsert({ id: data.user.id, role }, { onConflict: 'id' });

  const ctx = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const started = Date.now();
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('input[type=email], #email, input[name=email]').first().fill(email);
  await page.locator('button[type=submit]:visible').first().click();
  await page.waitForTimeout(5000);

  const code = await codeSentTo(email, started);
  if (!code) throw new Error(`no login code reached the sending account for ${email}`);
  const boxes = page.locator('input[aria-label^="Dígito"]');
  await boxes.first().waitFor({ state: 'visible', timeout: 30000 });
  for (let i = 0; i < 6; i += 1) await boxes.nth(i).fill(code[i]);
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 40000 });
  await page.waitForTimeout(2000);

  if (new URL(page.url()).pathname.endsWith('/login')) throw new Error('still on /login after the code');
  return { ctx, page, email, userId: data.user.id };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENUM = /^[A-Z][A-Z0-9]{2,}(_[A-Z0-9]+)+$/;
const BROKEN = /^(undefined|null|NaN|Invalid Date|\[object Object\]|NaN Kz|undefined Kz)$/i;
const ENGLISH = ['Owner', 'Secret', 'Delete', 'Archived', 'Settings', 'Dashboard',
                 'Sign in', 'Sign out', 'Log in', 'Log out', 'Submit', 'Retry', 'Loading'];

/** Read the labelled fields and controls of the current page. */
const readFields = (page) => page.evaluate(() => {
  const text = (el) => (el?.innerText ?? '').trim().replace(/\s+/g, ' ');
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const fields = [];

  // Definition lists — the shape every detail surface here uses.
  for (const dl of document.querySelectorAll('dl')) {
    const kids = [...dl.children];
    for (let i = 0; i < kids.length; i += 1) {
      if (kids[i].tagName !== 'DT') continue;
      const dd = kids[i + 1]?.tagName === 'DD' ? kids[i + 1] : null;
      if (dd && visible(dd)) fields.push({ kind: 'value', label: text(kids[i]), value: text(dd) });
    }
  }
  // Tables — the shape every list surface here uses. Reading only <dl> pairs
  // meant a list page yielded zero fields and then reported "every labelled
  // field has a value (0 read)", which is a pass that examined nothing.
  for (const table of document.querySelectorAll('table')) {
    const heads = [...table.querySelectorAll('thead th')].map(text);
    for (const tr of table.querySelectorAll('tbody tr')) {
      if (!visible(tr)) continue;
      [...tr.children].forEach((td, i) => {
        fields.push({ kind: 'cell', label: heads[i] ?? `coluna ${i + 1}`, value: text(td) });
      });
    }
  }
  // Form fields — label comes from the accessibility name.
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (!visible(el)) continue;
    const id = el.getAttribute('id');
    const labelled = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    fields.push({
      kind: 'input',
      label: el.getAttribute('aria-label') || text(labelled) || el.getAttribute('placeholder') || '',
      value: el.getAttribute('type') === 'password' ? '(hidden)' : String(el.value ?? ''),
      type: el.getAttribute('type') || el.tagName.toLowerCase(),
      disabled: el.disabled === true,
    });
  }
  // Controls — name and whether a disabled one explains itself.
  const controls = [...document.querySelectorAll('a[href], button, [role="button"]')]
    .filter(visible)
    .map((el) => ({
      name: (el.getAttribute('aria-label') || text(el) || el.getAttribute('title') || '').slice(0, 80),
      disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
      reason: el.getAttribute('title') || el.getAttribute('aria-describedby') ? 'yes' : '',
      href: el.getAttribute('href') ?? '',
    }));
  // Most of this product's surfaces are cards and lists, not definition lists or
  // tables, so pairing labels with values reaches only the detail screens. What
  // is true of every surface is the text a reader ends up looking at, so the
  // rendered values are read directly: a value that failed to render says so on
  // screen, whatever markup it failed inside.
  const values = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent ?? '').trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || !visible(el)) continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    values.push(t.replace(/\s+/g, ' '));
  }

  return { fields, controls, values, body: document.body.innerText.replace(/\s+/g, ' ') };
});

async function sweepPage(page, origin, route, surface) {
  // A client-side redirect already in flight cancels the next goto, which
  // surfaced as "no response" on four consecutive pages and read like four
  // broken routes. Each navigation is given a settle first, and one retry.
  let res = null;
  for (let attempt = 0; attempt < 2 && !res; attempt += 1) {
    await page.waitForLoadState('networkidle').catch(() => {});
    res = await page.goto(origin + route, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
  }
  if (!res || res.status() >= 400) { bad(`${surface} ${route}: http ${res ? res.status() : 'no response'}`); return; }
  await page.waitForTimeout(700);

  // Report the page this landed on, not the one it asked for. A new creator
  // asking for /campaigns is sent to /onboarding, and attributing onboarding's
  // controls to /campaigns sent the first reading of this sweep looking for a
  // disabled button on a page that does not have one.
  const landed = new URL(page.url()).pathname;
  const where = landed === route ? route : `${route} → ${landed}`;

  const { fields, controls, values, body } = await readFields(page);

  const shown = (f) => f.kind === 'value' || f.kind === 'cell';
  const paired = fields.filter(shown);
  const broken = [
    ...paired.filter((f) => f.value === '' || BROKEN.test(f.value)),
    ...values.filter((v) => BROKEN.test(v) || /\b(undefined|NaN|Invalid Date|\[object Object\])\b/.test(v))
             .map((v) => ({ label: '(rendered)', value: v })),
  ];
  // A UUID an operator is meant to read — "Projeto (id)" on the integration card,
  // so it can be matched against the Banzami Console — is not residue. A UUID
  // that simply arrived on screen is. The difference is whether anything nearby
  // calls it an identifier.
  // The label does not have to end in "id" — "Conta da campanha (id da conta
  // Banzami)" announces it just as well — so this asks whether the words leading
  // up to the value contain one, not whether they end with one.
  const announced = (v) => {
    const at = body.indexOf(v);
    return at > 0 && /\b(id|ids|identificador|refer[eê]ncia|ref)\b/i.test(body.slice(Math.max(0, at - 60), at));
  };
  const rawId = [
    ...paired.filter((f) => UUID.test(f.value) && !/\b(id|identificador|refer[eê]ncia)\b/i.test(f.label)),
    ...values.filter((v) => UUID.test(v) && !announced(v)).map((v) => ({ label: '(rendered)', value: v })),
  ];
  const rawEnum = [
    ...paired.filter((f) => ENUM.test(f.value)),
    ...values.filter((v) => ENUM.test(v)).map((v) => ({ label: '(rendered)', value: v })),
  ];
  const unnamedInput = fields.filter((f) => f.kind === 'input' && f.label.trim() === '');
  const unnamedControl = controls.filter((c) => c.name.trim() === '');
  const mutelyDisabled = controls.filter((c) => c.disabled && !c.reason);
  const english = ENGLISH.filter((w) => new RegExp(`\\b${w}\\b`).test(body));

  const say = (list, good, badMsg) => list.length === 0 ? ok(`${surface} ${where}: ${good}`)
    : bad(`${surface} ${where}: ${badMsg} — ${list.map((x) => x.label ?? x.name ?? x).slice(0, 6).join(' | ')}`);

  const read = paired.length + values.length;
  // A page that yielded nothing to read has not been examined, and saying "every
  // field has a value (0 read)" about it is the kind of green this whole sweep
  // exists to stop producing.
  if (read === 0) bad(`${surface} ${where}: nothing rendered — no value, field or text to examine`);
  else say(broken, `every rendered value is a value (${paired.length} labelled, ${values.length} rendered)`,
           'a value that failed to render, on screen');
  say(rawId, 'no bare identifier on screen', 'a raw UUID reached the reader');
  say(rawEnum, 'no raw enum on screen', 'a database enum reached the reader');
  say(unnamedInput, `every input has a name (${fields.filter((f) => f.kind === 'input').length} read)`, 'an input with no accessible name');
  say(unnamedControl, `every control has a name (${controls.length} read)`, 'a control with no accessible name');
  say(mutelyDisabled, 'no control is disabled without saying why', 'a disabled control with no reason');
  say(english, 'no English platform vocabulary', 'English on a Portuguese surface');

  rows.push({ surface, route, landed, read, fields, values, controls: controls.length,
              broken: broken.length, rawId: rawId.length, rawEnum: rawEnum.length,
              unnamedInput: unnamedInput.length, unnamedControl: unnamedControl.length,
              mutelyDisabled: mutelyDisabled.length, english });
}

const browser = await chromium.launch();
const cleanup = [];
try {
  // ── creator (www) ─────────────────────────────────────────────────────────
  console.log('\n── creator · www.doadoa.app ──');
  const creator = await signIn(browser, 'https://www.doadoa.app', 'user');
  cleanup.push(creator.userId);
  const creatorRoutes = ['/campaigns', '/campaigns/new', ...(slug ? [`/c/${slug}`, `/c/${slug}/doar`] : [])];
  for (const r of creatorRoutes) await sweepPage(creator.page, 'https://www.doadoa.app', r, 'creator');
  await creator.ctx.close();

  // ── operator (admin) ──────────────────────────────────────────────────────
  console.log('\n── operator · admin.doadoa.app ──');
  const op = await signIn(browser, 'https://admin.doadoa.app', 'admin');
  cleanup.push(op.userId);
  for (const r of ['/', '/campaigns', '/donations', '/settlements', '/finance', '/beneficiaries', '/users', '/audit', '/settings']) {
    await sweepPage(op.page, 'https://admin.doadoa.app', r, 'operator');
  }
  // The [id] routes, with ids the operator surface itself links to.
  for (const [list, label] of [['/donations', 'donation'], ['/users', 'user'], ['/campaigns', 'campaign']]) {
    await op.page.goto('https://admin.doadoa.app' + list, { waitUntil: 'networkidle' });
    const href = await op.page.locator(`a[href^="${list}/"]`).first().getAttribute('href').catch(() => null);
    if (!href) { console.log(`  · ${label} detail — UNPROBED (the ${list} list is empty)`); continue; }
    await sweepPage(op.page, 'https://admin.doadoa.app', href, 'operator');
  }
  await op.ctx.close();
} catch (e) {
  bad(e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
  for (const id of cleanup) {
    await svc.from('profiles').delete().eq('id', id).then(() => {}, () => {});
    await svc.auth.admin.deleteUser(id).then(() => {}, () => {});
  }
  console.log(`\ncleaned up ${cleanup.length} controlled account(s)`);
}

const total = (k) => rows.reduce((a, r) => a + r[k], 0);
console.log(`\nDOA_FIELD_SWEEP: pages=${rows.length} fields=${rows.reduce((a, r) => a + r.fields.length, 0)} ` +
  `DEAD_PUBLIC_PRODUCT_FIELDS=${total('broken')} RAW_IDS=${total('rawId')} RAW_ENUMS=${total('rawEnum')} ` +
  `UNNAMED_INPUTS=${total('unnamedInput')} UNNAMED_CONTROLS=${total('unnamedControl')} ` +
  `UNEXPLAINED_DISABLED=${total('mutelyDisabled')}`);

const out = join(assuranceDir('doa-field-sweep'), `doa-field-sweep-${Date.now()}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ ran_at: new Date().toISOString(), campaign: slug, rows }, null, 2));
console.log(`evidence: ${out}`);
process.exit(fails ? 1 : 0);
