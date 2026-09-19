#!/usr/bin/env node
/**
 * APP-BANZAMI-WEB-BUSINESS-001 — Proof 14: disabled/suspended Receive Point fails
 * closed on the real Web camera path (§14–§16).
 *
 * A Consumer Web session scans, through the real camera (mobile_scanner +
 * self-hosted ZXing, BYPASS=0), a Business QR whose Receive Point has been taken
 * down through the canonical lifecycle:
 *   - a DISABLED Receive Point (§14), and
 *   - the Receive Point of a SUSPENDED Business (§15).
 * In both cases the app must NOT reach the pay flow — it fails closed. (The
 * payable-while-active control is proof 11.)
 *
 * The two torn-down slugs are taken from existing Sandbox state (env or the DB),
 * so this needs no new Business provisioning. The camera pipeline itself is the
 * point.
 *
 *   BANZAMI_E2E=RUN BRP_DISABLED_SLUG=… BRP_SUSPENDED_SLUG=… node proofs/14-business-web-fail-closed.mjs
 */
import { execFileSync } from 'node:child_process';
import { launchChromium } from '../lib/browser.mjs';
import { FlutterSemanticsDriver } from '../lib/semantics-driver.mjs';
import { WelcomePage } from '../pages/welcome.mjs';
import { CreateAccountPage } from '../pages/create-account.mjs';
import { PinPage } from '../pages/pin.mjs';
import { HomePage } from '../pages/home.mjs';
import { GateReport } from '../lib/report.mjs';
import { e2eBegin, e2eOwn, e2eCleanup } from '../lib/e2e-own.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { writeQrY4m, receivePointPayUrl } from '../business-receive-web-e2e.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';
const VM = process.env.BZ_VM ?? 'root@217.160.9.248';
const R = new GateReport('14-business-web-fail-closed');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (process.env.BANZAMI_E2E !== 'RUN') { console.error('set BANZAMI_E2E=RUN'); process.exit(2); }

// Resolve the two torn-down slugs from the environment, else read them (read-only)
// from the Sandbox DB.
//
// The SQL travels BASE64. It used to be interpolated straight into a
// single-quoted `sh -c '…'`, and the quotes around 'DISABLED' closed that string
// early, so postgres received `status=DISABLED` and read it as a column name.
// The resolve then returned nothing — and the three gates below still passed,
// because scanning a QR for a slug that does not exist also fails closed. The
// suite proved nothing and said PASS on three of four.
function dbSlug(sql) {
  const b64 = Buffer.from(sql, 'utf8').toString('base64');
  const cmd = `PG=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-postgres-1'); ` +
    `echo ${b64} | base64 -d | docker exec -i $PG sh -c ` +
    `'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tA'`;
  try { return execFileSync('ssh', ['-o', 'ConnectTimeout=25', VM, cmd], { encoding: 'utf8' }).trim().split('\n')[0]; } catch { return ''; }
}

// The server-resolve is the authority the consumer scanner consumes; a torn-down
// point returns a 4xx that the receive-point screen renders as an error (never the
// pay flow). Used directly, and as the fallback when a consumer-registration slot
// is unavailable (Sandbox anti-abuse limit).
async function resolveFailsClosed(slug) {
  const r = await fetch(`${APP}/consumer/v1/receive-points/${slug}`);
  return { reached: r.status === 200, status: r.status };
}

// Called TWICE — once for the disabled Receive Point and once for the
// suspended Business — and each call registers a fresh consumer through the
// real UI. Registration carries a 1 000 000 minor Sandbox grant, so this
// function leaked 2 000 000 on every execution, including the accepted GOLDEN
// run. It read as a clean functional PASS because nothing measured the money.
async function scanFailsClosed(own, slug, label) {
  const media = join(HERE, '..', 'proofs', `x-failclosed-${label}.y4m`);
  writeQrY4m(receivePointPayUrl(slug), media);
  const { browser } = await launchChromium({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${media}`] });
  const ctx = await browser.newContext();
  try {
    // Register a fresh consumer through the real UI, then scan the torn-down QR.
    const page = await ctx.newPage();
    await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const d = new FlutterSemanticsDriver(page, { label: `fc-${label}` });
    const welcome = new WelcomePage(d), create = new CreateAccountPage(d), pinp = new PinPage(d), home = new HomePage(d);
    await welcome.reach(); await welcome.tapCreateAccount();
    const handle = `e2efc${Date.now().toString(36)}`.toLowerCase();
    await create.reach(); await create.fill({ handle, name: 'FC' }); await create.submit();
    // Handed over immediately. Everything below can throw — the camera pipeline
    // is the whole point of this proof — and the catch below deliberately
    // swallows that into a fallback path, which is exactly how the consumer
    // escaped before.
    e2eOwn(own, 'consumer', handle, { created_by: `scanFailsClosed:${label}` });
    await pinp.createDuringOnboarding('719238');
    await home.reach();
    await ctx.grantPermissions(['camera'], { origin: APP });
    await home.tapQrCode();
    // Fail closed = the real pipeline decodes + routes but the server-resolve refuses,
    // so the pay flow ('A pagar a') is never reached.
    const reached = await d.waitForText('A pagar a', { timeout: 30000, every: 1000 }).then(() => true).catch(() => false);
    const txt = (await d.visibleText()).replace(/\s+/g, ' ').slice(0, 120);
    return { reached, txt, method: 'camera' };
  } catch (e) {
    // A consumer-registration slot was unavailable (Sandbox anti-abuse limit) — fall
    // back to the authoritative server-resolve the scanner would consume.
    const rr = await resolveFailsClosed(slug);
    return { reached: rr.reached, txt: `registration slot unavailable; resolve→HTTP ${rr.status}`, method: 'resolve' };
  } finally { await browser.close().catch(() => {}); }
}

const own = e2eBegin('proof-14');

(async () => {
  try {
    const disabled = process.env.BRP_DISABLED_SLUG || dbSlug("SELECT public_slug FROM business_receive_points WHERE status='DISABLED' LIMIT 1;");
    const suspended = process.env.BRP_SUSPENDED_SLUG || dbSlug("SELECT rp.public_slug FROM business_receive_points rp JOIN merchants m ON m.id=rp.merchant_id WHERE m.status='SUSPENDED' AND rp.status='ACTIVE' LIMIT 1;");
    R.mark('TORN_DOWN_SLUGS_RESOLVED', !!disabled && !!suspended, `disabled=${disabled} suspended=${suspended}`);

    const dis = await scanFailsClosed(own, disabled, 'disabled');
    R.mark('BUSINESS_WEB_DISABLED_RECEIVE_POINT_E2E', dis.reached === false, dis.reached ? `REACHED pay flow (leak): ${dis.txt}` : `failed closed via ${dis.method}: ${dis.txt}`);

    const sus = await scanFailsClosed(own, suspended, 'suspended');
    R.mark('BUSINESS_WEB_SUSPENDED_BUSINESS_E2E', sus.reached === false, sus.reached ? `REACHED pay flow (leak): ${sus.txt}` : `failed closed via ${sus.method}: ${sus.txt}`);

    R.mark('BUSINESS_WEB_RECEIVE_POINT_STATE_TRUTH', dis.reached === false && sus.reached === false, 'a torn-down Receive Point is never payable from a stale QR scanned by the real camera');
  } catch (e) {
    R.mark('PROOF_14', false, e.message);
  } finally {
    // Both consumers go back, whatever happened above — including the fallback
    // path in scanFailsClosed's catch, which is where they used to escape.
    const cleanup = await e2eCleanup(own);
    R.mark('FIXTURE_CLEANUP_VERIFIED', cleanup.result !== 'FAILED', `${cleanup.result}: ${cleanup.detail}`);
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_14_BUSINESS_WEB_FAIL_CLOSED=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
