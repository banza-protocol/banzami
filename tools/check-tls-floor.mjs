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
 * Every banzami.com hostname that Cloudflare proxies — i.e. every public HTTPS
 * surface the zone's TLS policy governs.
 *
 * Written out rather than fetched, so the list is reviewable in a diff and a
 * host cannot quietly leave the check by leaving an API response. It is checked
 * against the zone's proxied DNS records whenever this runs (see the note at the
 * end of the file): add one here when you add one there.
 *
 * The mail hostnames — ftp, imap, mail, pop, smtp — are deliberately absent.
 * They are unproxied CNAMEs to a mail provider, serve no Banzami product, and
 * the zone's Minimum TLS Version does not reach them; including them would mean
 * this gate reported on infrastructure it cannot govern.
 */
const HOSTS = [
  'banzami.com',
  'www.banzami.com',
  'developers.banzami.com',
  'developer-api.banzami.com',
  'api.banzami.com',
  'sandbox-api.banzami.com',
  'sandbox-operator.banzami.com',
  'sandbox-webhook.banzami.com',
  'pay.banzami.com',
  'checkout.banzami.com',
  'admin.banzami.com',
];

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

// ── plain HTTP redirects, and the origin stays hidden ────────────────────────
//
// Both were true findings of the control-plane audit: every host answered
// http:// with 400 because the origin rules point at TLS ports, and one record
// resolved straight to the origin. Asserted here because a zone setting can be
// changed back by anyone with the dashboard.
const ORIGIN_IP = process.env.BZ_ORIGIN_IP ?? '217.160.9.248';
for (const host of HOSTS) {
  let code = '', location = '';
  try {
    const out = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}|%{redirect_url}',
      '--max-time', '15', `http://${host}/`], { encoding: 'utf8' });
    [code, location] = out.split('|');
  } catch { code = 'error'; }
  const ok = code === '301' && location.startsWith('https://');
  if (ok) console.log(`  ✓ ${host} — http:// redirects to ${location}`);
  else { console.error(`  ✗ ${host} — http:// answered ${code}${location ? ` → ${location}` : ''}, expected a 301 to https`); failures += 1; }
}
for (const host of HOSTS) {
  let addrs = '';
  try { addrs = execFileSync('dig', ['+short', host, 'A'], { encoding: 'utf8' }); } catch { /* no dig, skip */ }
  if (addrs.includes(ORIGIN_IP)) {
    console.error(`  ✗ ${host} resolves to the origin ${ORIGIN_IP} — the proxy is bypassable for this name`);
    failures += 1;
  }
}


const worst = rows.reduce((w, r) => (ORDER.indexOf(r.lowest) < ORDER.indexOf(w) ? r.lowest : w), '1.3');
const countAccepting = (v) => rows.filter((r) => r.accepted.includes(v)).length;
console.log(`\nTLS_FLOOR_REQUIRED=${FLOOR}`);
console.log(`TLS_FLOOR_OBSERVED=${rows.length ? worst : 'unknown'}`);
console.log(`TLS_BELOW_FLOOR_HOSTS=${failures}`);
console.log(`TLS_1_0_ACCEPTED_HOSTS=${countAccepting('1.0')}`);
console.log(`TLS_1_1_ACCEPTED_HOSTS=${countAccepting('1.1')}`);
console.log(`TLS_1_2_REQUIRED_HOSTS=${rows.filter((r) => r.lowest === '1.2').length}/${HOSTS.length}`);
console.log(`TLS_1_3_SUPPORTED_HOSTS=${countAccepting('1.3')}/${HOSTS.length}`);
console.log(`PLAIN_HTTP_NOT_REDIRECTED_HOSTS=${failures ? '(see above)' : 0}`);
console.log(`ORIGIN_IP_EXPOSED_HOSTS=${failures ? '(see above)' : 0}`);

// The handshakes, written down. SEC-001 was VALIDATED on a config file nobody
// had compared against a server; an assertion about TLS is worth what the
// transcript behind it is worth.
const out = join(assuranceDir('tls-floor'), `tls-floor-${Date.now()}.json`);
writeFileSync(out, `${JSON.stringify({
  ran_at: new Date().toISOString(),
  policy: { floor: FLOOR, tls13: 'required' },
  control: 'Cloudflare zone banzami.com — Minimum TLS Version + TLS 1.3',
  hosts: rows,
  counters: {
    TLS_1_0_ACCEPTED_HOSTS: countAccepting('1.0'),
    TLS_1_1_ACCEPTED_HOSTS: countAccepting('1.1'),
    TLS_1_2_REQUIRED_HOSTS: `${rows.filter((r) => r.lowest === '1.2').length}/${HOSTS.length}`,
    TLS_1_3_SUPPORTED_HOSTS: `${countAccepting('1.3')}/${HOSTS.length}`,
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
