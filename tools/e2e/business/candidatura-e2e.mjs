#!/usr/bin/env node
/**
 * The public Business application, driven through the real deployed page.
 *
 *   node tools/e2e/business/candidatura-e2e.mjs [--out <dir>]
 *
 * What a person does, in a real browser against banzami.com and the Sandbox
 * API: open the form, get refused for the wrong things (missing fields, a bad
 * email, phone or NIF, a reserved @handle, a file of the wrong type or size,
 * no terms), be told a handle already belongs to a Business, then fill it in
 * properly, attach the Sandbox's generated test documents ("Gerar documentos
 * sandbox" — marked SANDBOX TEST DOCUMENT - NOT A LEGAL DOCUMENT), submit —
 * twice, fast, as a double click — and land on one application under review.
 * A mobile run repeats the happy path at an iPhone viewport.
 *
 * Then the server is checked directly for the refusals a browser cannot
 * provoke: validation without the form, a handle a Business owns, a claim on
 * a handle nobody uses, and a file whose bytes are not what it says.
 *
 * Synthetic identities only. Screenshots and a JSON report go to --out.
 * Nothing here needs a credential.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PW = process.env.PLAYWRIGHT_MODULE
  ?? join(import.meta.dirname, '../dev-console/node_modules/playwright');
const { chromium, devices } = require(PW);

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const SITE = arg('--site', 'https://banzami.com');
const API = arg('--api', 'https://sandbox-api.banzami.com');
const EXISTING_HANDLE = arg('--existing-handle', 'doa'); // any handle a Business Account uses
const OUT = arg('--out', join(process.cwd(), `evidence/assurance/business/candidatura-${Date.now()}`));
mkdirSync(OUT, { recursive: true });

const steps = [];
const rec = (name, ok, detail = {}) => {
  steps.push({ step: name, ok: Boolean(ok), ...detail });
  console.log(`  ${ok ? '\x1b[0;32m✓\x1b[0m' : '\x1b[0;31m✗\x1b[0m'} ${name}${detail.note ? ` — ${detail.note}` : ''}`);
  return ok;
};
const stamp = Date.now().toString(36);

const field = (page, label) =>
  page.locator('div.scroll-mt-24', { has: page.locator('label', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }) })
    .locator('input, select, textarea').first();

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
}

async function fillBusiness(page, handle) {
  await field(page, 'Nome do negócio').fill(`Loja E2E ${stamp}`);
  await field(page, '@negócio desejado').fill(handle);
  await page.getByText('Disponível', { exact: true }).waitFor({ timeout: 15000 });
  await field(page, 'Categoria do negócio').selectOption({ index: 1 });
  await field(page, 'Telefone').fill('923456789');
  await field(page, 'Email').fill(`e2e.${stamp}@exemplo.co.ao`);
  // The Sandbox's own test data for the remaining sections — the page's
  // "Usar dados de teste" buttons, as a tester uses them.
  const fills = page.getByRole('button', { name: 'Usar dados de teste' });
  for (let i = 1; i < await fills.count(); i++) await fills.nth(i).click();
}

async function journey(browser, { name, viewport, validations }) {
  const context = await browser.newContext(viewport);
  const page = await context.newPage();
  const posts = [];
  page.on('response', async (r) => {
    if (r.request().method() === 'POST' && /\/v1\/merchant\/applications$/.test(new URL(r.url()).pathname)) {
      posts.push({ status: r.status(), body: await r.json().catch(() => null) });
    }
  });
  const handle = `e2e_${name}_${stamp}`.slice(0, 30);
  await page.goto(`${SITE}/comerciantes/candidatura`, { waitUntil: 'networkidle' });
  await shot(page, `${name}-01-form`);

  if (validations) {
    await page.getByRole('button', { name: 'Continuar' }).click();
    const invalid = await page.locator('[data-invalid="true"]').count();
    rec(`${name}: required fields are enforced`, invalid >= 8, { note: `${invalid} fields flagged` });

    await field(page, '@negócio desejado').fill('admin');
    await page.getByText(/reservado/i).first().waitFor({ timeout: 15000 });
    rec(`${name}: a reserved @handle is refused`, true);

    await field(page, '@negócio desejado').fill(EXISTING_HANDLE);
    const existing = await page.getByText(`@${EXISTING_HANDLE} já é uma Business Account no Banzami`, { exact: false })
      .waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    rec(`${name}: a handle a Business owns offers regularisation, not reuse`, existing);
    await shot(page, `${name}-02-existing-business`);

    await field(page, 'Email').fill('não-é-email');
    await field(page, 'Telefone').fill('12');
    await field(page, 'NIF da Empresa').fill('12');
    await page.getByRole('button', { name: 'Continuar' }).click();
    rec(`${name}: an invalid email is refused`, await page.getByText('Email inválido.').count() > 0);
    rec(`${name}: an invalid Angolan phone is refused`, await page.getByText(/Telefone inválido/).count() > 0);
    const nifErr = await field(page, 'NIF da Empresa').locator('xpath=ancestor::div[contains(@class,"scroll-mt-24")]').getAttribute('data-invalid');
    rec(`${name}: an invalid NIF is refused`, nifErr === 'true');
  }

  await fillBusiness(page, handle);
  await field(page, 'NIF da Empresa').fill('5001234567');

  // Documents are on the first step, with the terms.
  const inputs = page.locator('input[type="file"]');
  await inputs.first().waitFor({ state: 'attached', timeout: 15000 });
  if (validations) {
    await inputs.nth(0).setInputFiles({ name: 'registo.txt', mimeType: 'text/plain', buffer: Buffer.from('not a document') });
    rec(`${name}: a file of the wrong type is refused`, await page.getByText(/Formato inválido/).count() > 0);
    await inputs.nth(0).setInputFiles({ name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(6 * 1024 * 1024)]) });
    rec(`${name}: an oversized file is refused`, await page.getByText(/demasiado grande/).count() > 0);
  }
  await page.getByRole('button', { name: 'Gerar documentos sandbox' }).click();
  if (validations) {
    await page.getByRole('button', { name: 'Continuar' }).click();
    rec(`${name}: terms must be accepted`,
      await page.getByText('Tem de aceitar os termos e condições.').count() > 0
        && await page.getByRole('heading', { name: 'Confirme os seus documentos' }).count() === 0);
  }
  await page.getByRole('checkbox', { name: 'Aceito os termos e condições' }).click();
  await shot(page, `${name}-03-details-complete`);
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 2 — the documents, confirmed.
  await page.getByRole('heading', { name: 'Confirme os seus documentos' }).waitFor({ timeout: 15000 });
  await shot(page, `${name}-04-documents`);
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 3 — review and submit.
  const submit = page.getByRole('button', { name: 'Submeter candidatura' });
  await submit.waitFor({ timeout: 15000 });
  await shot(page, `${name}-05-review`);
  await submit.dblclick();
  const sent = await page.getByRole('heading', { name: 'Candidatura enviada' }).waitFor({ timeout: 30000 })
    .then(() => true).catch(() => false);
  if (!sent) {
    await shot(page, `${name}-06-not-submitted`);
    rec(`${name}: the application is submitted`, false, { note: JSON.stringify(posts).slice(0, 400) });
    await context.close();
    return { handle };
  }
  const reference = (await page.getByTestId('application-reference').textContent().catch(() => '')) ?? '';
  await page.waitForTimeout(1200); // the smooth scroll to the panel
  const onScreen = await page.getByRole('heading', { name: 'Candidatura enviada' }).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });
  rec(`${name}: the confirmation is on screen, not a scroll away`, onScreen);
  // Uploads run after the application exists; give them their moment.
  await page.waitForTimeout(6000);
  await shot(page, `${name}-06-submitted`);

  const ids = [...new Set(posts.filter((p) => p.status < 300).map((p) => p.body?.application_id).filter(Boolean))];
  rec(`${name}: a double-clicked submission is ONE application`, ids.length === 1,
    { note: `${posts.length} POST(s), ${ids.length} application id(s)`, application_id: ids[0] });
  rec(`${name}: the applicant sees a reference`, /Referência da candidatura/.test(reference), { note: reference.trim() });

  // The form uploads one document after another once the application exists,
  // showing each one's progress under the reference. Read the server's list
  // until the required ones are there (or 30 s pass), not at the first frame.
  let docs = [];
  const uploadedNow = () => docs.filter((d) => d.status === 'UPLOADED').map((d) => d.document_type).sort();
  for (let i = 0; ids[0] && i < 30; i++) {
    const r = await fetch(`${API}/v1/merchant/applications/${ids[0]}/documents`);
    docs = (await r.json().catch(() => ({}))).data ?? [];
    const u = uploadedNow();
    if (u.includes('BUSINESS_REGISTRATION') && u.includes('REPRESENTATIVE_ID')) break;
    if (await page.getByText('O envio de documentos ainda não está disponível').count() > 0) break;
    await page.waitForTimeout(1000);
  }
  const uploaded = uploadedNow();
  const storageOff = await page.getByText('O envio de documentos ainda não está disponível').count() > 0;
  if (storageOff) {
    // The Gateway has no KYB storage: the applicant must be told the documents
    // were NOT sent — never shown a success for an upload that did not happen.
    rec(`${name}: with no document storage, the applicant is told the documents were not sent`, uploaded.length === 0);
  }
  rec(`${name}: the required documents arrived and passed the server's checks`,
    uploaded.includes('BUSINESS_REGISTRATION') && uploaded.includes('REPRESENTATIVE_ID'),
    { note: storageOff ? 'BLOCKED — Sandbox KYB storage not configured (503 STORAGE_NOT_CONFIGURED)' : uploaded.join(', ') });
  await context.close();
  return { application_id: ids[0], handle };
}

// ── the server, without the form ───────────────────────────────────────────
async function post(path, body, headers = {}) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}

async function serverChecks() {
  const base = { business_name: 'API E2E', email: `api.${stamp}@exemplo.co.ao`, terms_accepted: true };
  let r = await post('/v1/merchant/applications', { ...base, desired_handle: `api_${stamp}`, terms_accepted: false });
  rec('server: terms are required without the form', r.status === 400, { note: `${r.status} ${r.json?.code}` });
  r = await post('/v1/merchant/applications', { ...base, desired_handle: 'A-B' });
  rec('server: an invalid handle is refused', r.status === 400 && r.json?.code === 'INVALID_HANDLE', { note: `${r.status} ${r.json?.code}` });
  r = await post('/v1/merchant/applications', { ...base, desired_handle: 'admin' });
  rec('server: a reserved handle is refused', r.status === 409 && r.json?.code === 'HANDLE_RESERVED', { note: `${r.status} ${r.json?.code}` });
  r = await post('/v1/merchant/applications', { ...base, desired_handle: EXISTING_HANDLE });
  rec('server: a Business-owned handle cannot be requested as new', r.status === 409 && r.json?.code === 'HANDLE_OWNED_BY_BUSINESS', { note: `${r.status} ${r.json?.code}` });
  r = await post('/v1/merchant/applications', { ...base, desired_handle: `nobody_${stamp}`, existing_business: true });
  rec('server: an existing-Business claim needs a Business to exist', r.status === 409 && r.json?.code === 'HANDLE_NOT_A_BUSINESS', { note: `${r.status} ${r.json?.code}` });

  // A real application to send a lying file to.
  const key = `api-${stamp}`;
  r = await post('/v1/merchant/applications', { ...base, desired_handle: `api_${stamp}` }, { 'Idempotency-Key': key });
  const again = await post('/v1/merchant/applications', { ...base, desired_handle: `api_${stamp}` }, { 'Idempotency-Key': key });
  rec('server: the same Idempotency-Key returns the same application',
    r.status === 201 && again.json?.application_id === r.json?.application_id, { note: `${r.status}/${again.status}` });
  const appId = r.json?.application_id;
  const bogus = await post(`/v1/merchant/applications/${appId}/documents/upload-url`,
    { document_type: 'BUSINESS_REGISTRATION', filename: 'x.exe', mime_type: 'application/x-msdownload', size_bytes: 10 });
  rec('server: an executable is refused before upload', bogus.status === 400, { note: `${bogus.status} ${bogus.json?.code}` });
  const up = await post(`/v1/merchant/applications/${appId}/documents/upload-url`,
    { document_type: 'BUSINESS_REGISTRATION', filename: 'registo.pdf', mime_type: 'application/pdf', size_bytes: 22 });
  if (up.status === 201 || up.status === 200) {
    const u = up.json;
    const put = await fetch(u.upload_url, { method: u.method ?? 'PUT', headers: u.headers ?? {}, body: 'MZ this is not a pdf!!' });
    const conf = await post(`/v1/merchant/applications/${appId}/documents/${u.document_id}/confirm`, {});
    rec('server: a file whose bytes are not the declared type is refused and discarded',
      put.ok && conf.status === 422 && conf.json?.code === 'CONTENT_MISMATCH', { note: `put ${put.status}, confirm ${conf.status} ${conf.json?.code}` });
  } else {
    rec('server: document storage accepts an upload request', false, { note: `${up.status} ${up.json?.code}` });
  }
  return { api_application_id: appId };
}

const browser = await chromium.launch();
console.log(`\n▸ public Business application — ${SITE}\n`);
const desktop = await journey(browser, { name: 'desktop', viewport: { viewport: { width: 1366, height: 900 } }, validations: true });
const mobile = await journey(browser, { name: 'mobile', viewport: devices['iPhone 13'], validations: false });
await browser.close();
console.log('\n▸ server-side refusals\n');
const server = await serverChecks();

const failed = steps.filter((s) => !s.ok);
const report = {
  schema: 'banzami-candidatura-e2e/v1', site: SITE, api: API, ran_at: new Date().toISOString(),
  desktop, mobile, ...server, steps, pass: steps.length - failed.length, fail: failed.length,
  verdict: failed.length ? 'FAIL' : 'PASS',
};
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n  ${report.verdict}  ${report.pass}/${steps.length}   ${OUT}\n`);
process.exit(failed.length ? 1 : 0);
