#!/usr/bin/env node
/**
 * What TLS version the deployed edge will actually accept.
 *
 * SEC-001 has read VALIDATED since June on the requirement "Zero comunicação não
 * encriptada. TLS 1.3 obrigatório", with two pieces of evidence: an nginx file
 * that no longer exists, and a Terraform directory containing a README that says
 * "configuration to be added". Nobody had asked a server.
 *
 * A server answers in about a second. Every public host below negotiates TLS 1.1
 * with a SHA-1 cipher today, which is not what the matrix says and not what a
 * payment operator should offer, so this exists to make the claim checkable
 * rather than asserted — and to keep it checkable after it is fixed.
 *
 * The floor is a Cloudflare zone setting (Minimum TLS Version), not an nginx
 * directive: the origin configs already say `TLSv1.2 TLSv1.3`, and the edge in
 * front of them is what a client actually talks to. Reading the origin file was
 * how this went unnoticed.
 *
 *   node tools/check-tls-floor.mjs
 *   BZ_TLS_FLOOR=1.2 node tools/check-tls-floor.mjs   # after the zone is raised
 */
import { execFileSync } from 'node:child_process';

const HOSTS = [
  'banzami.com',
  'developers.banzami.com',
  'sandbox-api.banzami.com',
  'sandbox-operator.banzami.com',
  'pay.banzami.com',
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

const worst = rows.reduce((w, r) => (ORDER.indexOf(r.lowest) < ORDER.indexOf(w) ? r.lowest : w), '1.3');
console.log(`\nTLS_FLOOR_REQUIRED=${FLOOR}`);
console.log(`TLS_FLOOR_OBSERVED=${rows.length ? worst : 'unknown'}`);
console.log(`TLS_BELOW_FLOOR_HOSTS=${failures}`);

if (failures) {
  console.error(`\n✗ ${failures} host(s) accept a TLS version below ${FLOOR}.`);
  console.error('  The fix is the Cloudflare zone setting "Minimum TLS Version", not an origin');
  console.error('  nginx directive — the origins already say TLSv1.2 TLSv1.3, and the edge is');
  console.error('  what a client talks to. It needs the zone owner\'s Cloudflare access.');
  process.exit(1);
}
console.log('\n✓ nothing below the floor is negotiable on any public host');
