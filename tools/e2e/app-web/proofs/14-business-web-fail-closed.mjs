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
import { registerConsumer } from '../lib/consumer.mjs';
import { GateReport } from '../lib/report.mjs';
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
function dbSlug(sql) {
  const cmd = `PG=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-postgres-1'); docker exec $PG sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tA -c "${sql}"'`;
  try { return execFileSync('ssh', ['-o', 'ConnectTimeout=25', VM, cmd], { encoding: 'utf8' }).trim().split('\n')[0]; } catch { return ''; }
}

async function scanFailsClosed(slug, label) {
  const media = join(HERE, '..', 'proofs', `x-failclosed-${label}.y4m`);
  writeQrY4m(receivePointPayUrl(slug), media);
  const { browser } = await launchChromium({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${media}`] });
  try {
    // Single registration attempt — the BFF consumer-auth limit (12/10min/IP) must
    // be given a genuine quiet window to clear; retry storms only re-exhaust it.
    const cons = await registerConsumer(browser, { handle: `e2efc${label}${Date.now().toString(36)}`.toLowerCase(), name: 'E2E FC', pin: '719238', label: `fc-${label}` });
    await cons.context.grantPermissions(['camera'], { origin: APP });
    await cons.home.reach();
    await cons.home.tapQrCode();
    // Fail closed = the real pipeline decodes + routes but the server-resolve refuses,
    // so the pay flow ('A pagar a') is never reached.
    const reached = await cons.driver.waitForText('A pagar a', { timeout: 30000, every: 1000 }).then(() => true).catch(() => false);
    const txt = (await cons.driver.visibleText()).replace(/\s+/g, ' ').slice(0, 120);
    return { reached, txt };
  } finally { await browser.close().catch(() => {}); }
}

(async () => {
  try {
    const disabled = process.env.BRP_DISABLED_SLUG || dbSlug("SELECT public_slug FROM business_receive_points WHERE status='DISABLED' LIMIT 1;");
    const suspended = process.env.BRP_SUSPENDED_SLUG || dbSlug("SELECT rp.public_slug FROM business_receive_points rp JOIN merchants m ON m.id=rp.merchant_id WHERE m.status='SUSPENDED' AND rp.status='ACTIVE' LIMIT 1;");
    R.mark('TORN_DOWN_SLUGS_RESOLVED', !!disabled && !!suspended, `disabled=${disabled} suspended=${suspended}`);

    const dis = await scanFailsClosed(disabled, 'disabled');
    R.mark('BUSINESS_WEB_DISABLED_RECEIVE_POINT_E2E', dis.reached === false, dis.reached ? `REACHED pay flow (leak): ${dis.txt}` : `failed closed: ${dis.txt}`);

    const sus = await scanFailsClosed(suspended, 'suspended');
    R.mark('BUSINESS_WEB_SUSPENDED_BUSINESS_E2E', sus.reached === false, sus.reached ? `REACHED pay flow (leak): ${sus.txt}` : `failed closed: ${sus.txt}`);

    R.mark('BUSINESS_WEB_RECEIVE_POINT_STATE_TRUTH', dis.reached === false && sus.reached === false, 'a torn-down Receive Point is never payable from a stale QR scanned by the real camera');
  } catch (e) {
    R.mark('PROOF_14', false, e.message);
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_14_BUSINESS_WEB_FAIL_CLOSED=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
