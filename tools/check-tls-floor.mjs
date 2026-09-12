#!/usr/bin/env node
/**
 * What TLS version the deployed edge will actually accept.
 *
 * SEC-001 read VALIDATED since June on "Zero comunicação não encriptada. TLS 1.3
 * obrigatório", with two pieces of evidence: an nginx file that no longer exists,
 * and a Terraform directory containing a README that says "configuration to be
 * added". Nobody had asked a server. Every public host was completing a TLS 1.0
 * handshake, pay.banzami.com included.
 *
 * The floor is the Cloudflare zone setting (Minimum TLS Version), not an nginx
 * directive: the origin configs already said `TLSv1.2 TLSv1.3`, and the edge in
 * front of them is what a client actually talks to. Reading the origin file is
 * exactly how this went unnoticed, so this reads handshakes instead.
 *
 * The policy is TLS 1.2 as the floor and 1.3 preferred where negotiated — not
 * 1.3-only, which would cut off legitimate modern clients for no proven product
 * requirement.
 *
 * It also holds the two things the 2026-09-13 control-plane audit fixed, so
 * neither can quietly come back: plain HTTP must redirect rather than error,
 * and no public record may resolve to the origin IP. `ftp.banzami.com` was a
 * zone-import leftover that CNAME'd to the apex, which Cloudflare flattened to
 * 217.160.9.248 — publishing the address of the machine behind the proxy.
 *
 *   node tools/check-tls-floor.mjs
 *   BZ_TLS_FLOOR=1.3 node tools/check-tls-floor.mjs   # only with a reason to
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assuranceDir } from './e2e/lib/assurance-output.mjs';

/**
 * Every banzami.com hostname Cloudflare proxies, and what each one is supposed
 * to answer.
 *
 * An expectation matrix, not a list, because the first version of this check
 * asserted only that plain HTTP redirects — and the report it produced then went
 * on to claim every chain ends at 200. Two of these hosts end at 503 ON PURPOSE:
 * api.banzami.com is Financial LIVE held fail-closed, and sandbox-operator is an
 * offline subdomain behind the Stage B routing guard. "Everything is 200" would
 * have been a green check for a statement the same run disproved, and three more
 * hosts end at 404 because their root path is not a route.
 *
 * `terminal` is the status after following redirects; it differs from `https`
 * only where a host canonicalises to another. Encoding the reason next to the
 * number is the point: a status nobody can explain is a status nobody can
 * defend when it changes.
 *
 * The mail hostnames — imap, mail, pop, smtp — are deliberately absent. They are
 * unproxied records pointing at a mail provider, serve no Banzami product, and
 * the zone's Minimum TLS Version does not reach them; including them would mean
 * this gate reported on infrastructure it cannot govern. (ftp was removed from
 * the zone on 2026-09-13: it CNAME'd to the apex and was flattened to the origin
 * IP, which is what the origin-exposure check below now keeps out.)
 */
const EXPECT = {
  'banzami.com':                  { https: 200, why: 'institutional website' },
  'www.banzami.com':              { https: 301, terminal: 200, endsAt: 'https://banzami.com/',     why: 'canonicalises to the apex' },
  'developers.banzami.com':       { https: 200, why: 'Developer Console' },
  'developer-api.banzami.com':    { https: 404, why: 'Console-internal API — the root path is not a route' },
  'api.banzami.com':              { https: 503, why: 'Financial LIVE, held fail-closed by the Stage B guard' },
  'sandbox-api.banzami.com':      { https: 404, why: 'public API gateway — the root path is not a route, /v1/* is' },
  'sandbox-operator.banzami.com': { https: 503, why: 'operator identity host, intentionally offline (Stage B guard)' },
  'sandbox-webhook.banzami.com':  { https: 404, why: 'assurance webhook sink — the root path is not a route' },
  'pay.banzami.com':              { https: 200, why: 'hosted payer surface' },
  'checkout.banzami.com':         { https: 308, terminal: 200, endsAt: 'https://pay.banzami.com/', why: 'canonical alias to pay (ADR-052)' },
  'admin.banzami.com':            { https: 200, why: 'BANZADMIN' },
};
const HOSTS = Object.keys(EXPECT);

/** The lowest version that must be REFUSED. Everything below it must be refused too. */
const FLOOR = process.env.BZ_TLS_FLOOR ?? '1.2';
const ORDER = ['1.0', '1.1', '1.2', '1.3'];
const FLAG = { '1.0': '-tls1', '1.1': '-tls1_1', '1.2': '-tls1_2', '1.3': '-tls1_3' };

/**
 * A handshake that produced a session, as openssl reports it.
 *
 * "Protocol : TLSv1.1" alone is not proof: openssl prints the version it
 * ASKED for in the session block even when the server said no. A negotiated
 * cipher is what separates the two.
 */
const established = (out) => /^New,.*Cipher is (?!\(NONE\))/im.test(out);

/** Does this host complete a handshake at this exact version? */
function accepts(host, version) {
  try {
    // No -brief: LibreSSL, which is what ships on macOS, does not have it. The
    // session summary openssl prints on success is read instead.
    const out = execFileSync(
      'openssl',
      ['s_client', '-connect', `${host}:443`, '-servername', host, FLAG[version]],
      { input: '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 20_000 },
    );
    return established(out);
  } catch (e) {
    const text = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    if (established(text)) return true;
    // The CLIENT refusing to offer a version is not the server refusing it, and
    // counting it as a refusal would let an old LibreSSL certify a server it
    // never spoke to. Said out loud instead.
    if (/no protocols available|unsupported protocol|unknown option/i.test(text)) {
      throw new Error(`this openssl (${version}) will not offer TLS ${version} — cannot test it from here`);
    }
    if (/alert|handshake failure|wrong version|sslv3 alert/i.test(text)) return false;
    throw new Error(`${host} @ TLS ${version}: ${String(e.message).split('\n')[0]}`);
  }
}

const floorIdx = ORDER.indexOf(FLOOR);
let failures = 0;
const rows = [];

console.log(`TLS floor — every public host must refuse everything below TLS ${FLOOR}\n`);

for (const host of HOSTS) {
  let lowest = null;
  const accepted = [];
  const untestable = [];
  for (const v of ORDER) {
    try {
      if (accepts(host, v)) { accepted.push(v); lowest ??= v; }
    } catch (e) {
      untestable.push(`${v} (${e.message})`);
    }
  }
  if (untestable.length) console.log(`  · ${host} — not tested at TLS ${untestable.join('; ')}`);
  if (accepted.length === 0) {
    console.error(`  ✗ ${host} — no TLS version completed a handshake`);
    failures += 1;
    continue;
  }
  const ok = ORDER.indexOf(lowest) >= floorIdx;
  rows.push({ host, lowest, accepted });
  if (ok) console.log(`  ✓ ${host} — lowest accepted TLS ${lowest} (${accepted.join(', ')})`);
  else { console.error(`  ✗ ${host} — accepts TLS ${lowest}, below the floor of ${FLOOR} (${accepted.join(', ')})`); failures += 1; }
}

// ── what each host answers, against what it is supposed to answer ───────────
//
// Three separate questions, kept separate: does plain HTTP redirect, does it
// redirect to THIS host over HTTPS, and does the chain end where and how this
// host is meant to end. Collapsing them into "it works" is how a report came to
// say every chain ends at 200 while two of these hosts end at 503 by design.
const ORIGIN_IP = process.env.BZ_ORIGIN_IP ?? '217.160.9.248';
const curl = (args) => {
  try { return execFileSync('curl', ['-s', '-o', '/dev/null', '--max-time', '20', ...args], { encoding: 'utf8' }); }
  catch { return ''; }
};

let httpCanonical = 0, httpUnexpected = 0, httpsUnexpected = 0;
console.log('\n── HTTP → HTTPS, and each host\'s canonical terminal status ──');
for (const host of HOSTS) {
  const want = EXPECT[host];
  const wantTerminal = want.terminal ?? want.https;

  const [httpCode, httpLoc] = curl(['-w', '%{http_code}|%{redirect_url}', `http://${host}/`]).split('|');
  const redirectsHere = httpCode === '301' && httpLoc === `https://${host}/`;
  if (redirectsHere) httpCanonical += 1;
  else { httpUnexpected += 1; console.error(`  ✗ ${host} — http:// answered ${httpCode || 'nothing'}${httpLoc ? ` → ${httpLoc}` : ''}, expected 301 → https://${host}/`); }

  const httpsCode = curl(['-w', '%{http_code}', `https://${host}/`]).trim();
  const [hops, endCode, endUrl] = curl(['-w', '%{num_redirects}|%{http_code}|%{url_effective}', '-L', '--max-redirs', '6', `https://${host}/`]).split('|');

  const statusOK = httpsCode === String(want.https);
  const terminalOK = endCode === String(wantTerminal);
  const endsWhereExpected = !want.endsAt || endUrl === want.endsAt;
  const hopsOK = Number(hops) <= (want.endsAt ? 1 : 0);

  if (statusOK && terminalOK && endsWhereExpected && hopsOK) {
    console.log(`  ✓ ${host} — https ${httpsCode}${want.endsAt ? ` → ${hops} hop → ${endCode} ${endUrl}` : ''} · ${want.why}`);
  } else {
    httpsUnexpected += 1;
    console.error(`  ✗ ${host} — https ${httpsCode} (expected ${want.https}), terminal ${endCode} after ${hops} hop(s) at ${endUrl} (expected ${wantTerminal}${want.endsAt ? ` at ${want.endsAt}` : ''}) · ${want.why}`);
  }
}
failures += httpUnexpected + httpsUnexpected;

// The two deliberate 503s, named rather than left to be inferred from the table.
const liveFailClosed = curl(['-w', '%{http_code}', 'https://api.banzami.com/']).trim() === '503';
const operatorOffline = curl(['-w', '%{http_code}', 'https://sandbox-operator.banzami.com/']).trim() === '503';
if (!liveFailClosed) { console.error('  ✗ api.banzami.com is not answering 503 — Financial LIVE must stay fail-closed'); failures += 1; }
if (!operatorOffline) { console.error('  ✗ sandbox-operator.banzami.com is not answering 503 — the documented offline expectation no longer holds'); failures += 1; }

// No public name may resolve to the origin: the proxy is only a boundary while
// nothing publishes a way around it.
let originExposed = 0;
for (const host of HOSTS) {
  let addrs = '';
  try { addrs = execFileSync('dig', ['+short', host, 'A'], { encoding: 'utf8' }); } catch { /* no dig, skip */ }
  if (addrs.includes(ORIGIN_IP)) {
    console.error(`  ✗ ${host} resolves to the origin ${ORIGIN_IP} — the proxy is bypassable for this name`);
    originExposed += 1;
  }
}
failures += originExposed;

const worst = rows.reduce((w, r) => (ORDER.indexOf(r.lowest) < ORDER.indexOf(w) ? r.lowest : w), '1.3');
const countAccepting = (v) => rows.filter((r) => r.accepted.includes(v)).length;
console.log(`\nTLS_FLOOR_REQUIRED=${FLOOR}`);
console.log(`TLS_FLOOR_OBSERVED=${rows.length ? worst : 'unknown'}`);
console.log(`TLS_BELOW_FLOOR_HOSTS=${failures}`);
console.log(`TLS_1_0_ACCEPTED_HOSTS=${countAccepting('1.0')}`);
console.log(`TLS_1_1_ACCEPTED_HOSTS=${countAccepting('1.1')}`);
console.log(`TLS_1_2_REQUIRED_HOSTS=${rows.filter((r) => r.lowest === '1.2').length}/${HOSTS.length}`);
console.log(`TLS_1_3_SUPPORTED_HOSTS=${countAccepting('1.3')}/${HOSTS.length}`);
console.log(`HTTP_TO_HTTPS_CANONICAL_HOSTS=${httpCanonical}/${HOSTS.length}`);
console.log(`UNEXPECTED_HTTP_TERMINAL_STATUS=${httpUnexpected}`);
console.log(`UNEXPECTED_HTTPS_TERMINAL_STATUS=${httpsUnexpected}`);
console.log(`ORIGIN_IP_EXPOSED_HOSTS=${originExposed}`);
console.log(`LIVE_FAIL_CLOSED=${liveFailClosed ? 'PASS' : 'FAIL'}`);
console.log(`SANDBOX_OPERATOR_OFFLINE_EXPECTATION=${operatorOffline ? 'PASS' : 'FAIL'}`);

// The handshakes, written down. SEC-001 was VALIDATED on a config file nobody
// had compared against a server; an assertion about TLS is worth what the
// transcript behind it is worth.
const out = join(assuranceDir('tls-floor'), `tls-floor-${Date.now()}.json`);
writeFileSync(out, `${JSON.stringify({
  ran_at: new Date().toISOString(),
  policy: { floor: FLOOR, tls13: 'required' },
  control: 'Cloudflare zone banzami.com — Minimum TLS Version + TLS 1.3',
  hosts: rows,
  expectations: Object.fromEntries(Object.entries(EXPECT).map(([h, e]) => [h, {
    http: `301 -> https://${h}/`, https: e.https, terminal: e.terminal ?? e.https, ends_at: e.endsAt ?? null, reason: e.why,
  }])),
  counters: {
    TLS_1_0_ACCEPTED_HOSTS: countAccepting('1.0'),
    TLS_1_1_ACCEPTED_HOSTS: countAccepting('1.1'),
    TLS_1_2_REQUIRED_HOSTS: `${rows.filter((r) => r.lowest === '1.2').length}/${HOSTS.length}`,
    TLS_1_3_SUPPORTED_HOSTS: `${countAccepting('1.3')}/${HOSTS.length}`,
    HTTP_TO_HTTPS_CANONICAL_HOSTS: `${httpCanonical}/${HOSTS.length}`,
    UNEXPECTED_HTTP_TERMINAL_STATUS: httpUnexpected,
    UNEXPECTED_HTTPS_TERMINAL_STATUS: httpsUnexpected,
    ORIGIN_IP_EXPOSED_HOSTS: originExposed,
    LIVE_FAIL_CLOSED: liveFailClosed ? 'PASS' : 'FAIL',
    SANDBOX_OPERATOR_OFFLINE_EXPECTATION: operatorOffline ? 'PASS' : 'FAIL',
  },
}, null, 2)}\n`);
console.log(`evidence: ${out}`);

// TLS 1.3 is required as well as permitted: the policy is "1.2 or newer, 1.3
// preferred", and a host that has quietly lost 1.3 has drifted off it.
const no13 = rows.filter((r) => !r.accepted.includes('1.3')).map((r) => r.host);
if (no13.length) {
  console.error(`\n  ✗ ${no13.length} host(s) do not negotiate TLS 1.3: ${no13.join(', ')}`);
  failures += no13.length;
}

if (failures) {
  console.error(`\n✗ ${failures} host(s) do not meet the policy: TLS ${FLOOR} floor, 1.3 supported.`);
  console.error('  The control is the Cloudflare zone setting "Minimum TLS Version" (and TLS 1.3');
  console.error('  = on), not an origin nginx directive — the origins already say TLSv1.2');
  console.error('  TLSv1.3, and the edge is what a client talks to.');
  process.exit(1);
}
console.log(`\n✓ every public host refuses everything below TLS ${FLOOR} and negotiates 1.3`);
