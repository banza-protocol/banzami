#!/usr/bin/env node
// Proof references are exact identifiers — against the deployed public surfaces.
//
// Given ONE real, canonical proof reference, asks the public verification API
// (sandbox-api.banzami.com/v1/public/proofs/<x>) and the public page
// (banzami.com/r/<x>) about the reference and about altered spellings of it:
// the letter O for the digit 0, I for 1, lower case, look-alike Unicode, other
// dashes, whitespace and invisible characters, percent-encoding tricks, broken
// structure. Only the exact reference may verify. Also checks that no alias is
// redirected to the canonical page and that the order of requests cannot make
// an alias share a cached verified answer.
//
// Read-only: lookups only. The reference is a bearer capability, so it is read
// from PROOF_REF and printed masked (first and last group) — never whole.
//
//   PROOF_REF=BZM-…  node tools/e2e/security/proof-reference-canonicality.mjs
//
// Exit 0 only when the canonical reference verifies on both surfaces, an unknown
// well-formed reference is not found, and no alias verifies anywhere.

const C = process.env.PROOF_REF || '';
const SECURE_V1 = /^BZM(?:-[0-9A-HJKMNP-TV-Z]{4}){6}$/;
if (!SECURE_V1.test(C)) {
  console.error('PROOF_REF must be one canonical SECURE_V1 reference whose last symbol is 0 or 1');
  process.exit(2);
}
const API = process.env.API_BASE || 'https://sandbox-api.banzami.com';
const WEB = process.env.WEB_BASE || 'https://banzami.com';
const mask = (s) => s.replace(/BZM-([^-]{4})-.*-([^-]{4})$/, 'BZM-$1-…-$2');

const head = C.slice(0, -1);
const last = C.slice(-1);
const lookalike = last === '0' ? 'O' : last === '1' ? 'I' : 'O';
const enc = encodeURIComponent;
// name → path segment exactly as sent on the wire.
const aliases = {
  [`letter ${lookalike} for ${last}`]: head + lookalike,
  'L for 1': head + 'L',
  'lower case': C.toLowerCase(),
  'Bzm prefix': 'Bzm' + C.slice(3),
  'Greek omicron': enc(head + '\u039F'),
  'Cyrillic O': enc(head + '\u041E'),
  'fullwidth 0': enc(head + '\uFF10'),
  'math bold 0': enc(head + '\u{1D7CE}'),
  'en dash': enc(C.replace(/-/g, '\u2013')),
  'em dash': enc(C.replace(/-/g, '\u2014')),
  'non-breaking hyphen': enc(C.replace(/-/g, '\u2011')),
  'minus sign': enc(C.replace(/-/g, '\u2212')),
  'underscore': C.replace(/-/g, '_'),
  'no hyphens': C.replace(/-/g, ''),
  'trailing space': C + '%20',
  'leading space': '%20' + C,
  'tab': C + '%09',
  'newline': C + '%0A',
  'NBSP': C + '%C2%A0',
  'zero-width space': C + '%E2%80%8B',
  'ZWNJ': C + '%E2%80%8C',
  'ZWJ': C + '%E2%80%8D',
  'BOM': '%EF%BB%BF' + C,
  'encoded letter O': head + '%4F',
  'double-encoded': head + '%25' + (0x30 + Number(last === '1')).toString(16),
  '23 symbols': C.slice(0, -1),
  '25 symbols': C + '0',
  'seven groups': C + '-0000',
  'duplicate prefix': 'BZM-' + C,
};

async function api(seg) {
  const r = await fetch(`${API}/v1/public/proofs/${seg}`, { redirect: 'manual', cache: 'no-store' });
  const body = await r.text();
  let j = null;
  try { j = JSON.parse(body); } catch { /* not JSON */ }
  return { status: r.status, verified: r.status === 200 && j?.exists === true, loc: r.headers.get('location') };
}
async function page(seg) {
  const r = await fetch(`${WEB}/r/${seg}`, { redirect: 'manual', cache: 'no-store' });
  const body = await r.text();
  return {
    status: r.status,
    verified: /Pagamento verificado|Transfer\u00EAncia verificada/.test(body),
    loc: r.headers.get('location'),
    cache: r.headers.get('cf-cache-status') || '',
  };
}

let fail = 0;
const bad = (msg) => { fail++; console.log(`  FAIL ${msg}`); };

console.log(`reference ${mask(C)} — API ${API}, page ${WEB}/r/`);

const ca = await api(C), cp = await page(C);
console.log(`canonical                API ${ca.status} ${ca.verified ? 'VERIFIED' : 'not verified'} | /r/ ${cp.status} ${cp.verified ? 'VERIFIED' : 'not verified'}`);
if (!ca.verified || !cp.verified) bad('the canonical reference must verify on both surfaces');

// An unknown, well-formed reference: definitive not-found, not an outage.
const unknown = 'BZM-' + Array.from({ length: 6 }, () => 'ZZZZ').join('-');
const ua = await api(unknown);
console.log(`unknown well-formed      API ${ua.status} ${ua.verified ? 'VERIFIED' : 'not verified'}`);
if (ua.status !== 404) bad('an unknown well-formed reference must be 404 NOT_FOUND');

let aliasVerified = 0, redirects = 0;
for (const [name, seg] of Object.entries(aliases)) {
  const a = await api(seg), p = await page(seg);
  const line = `${name.padEnd(24)} API ${a.status} ${a.verified ? 'VERIFIED' : 'not verified'} | /r/ ${p.status}${p.loc ? ' → redirect' : ''} ${p.verified ? 'VERIFIED' : 'not verified'}`;
  console.log(line);
  if (a.verified || p.verified) { aliasVerified++; bad(`${name}: an altered reference verified`); }
  if (a.status !== 404) bad(`${name}: API must answer the non-disclosing 404, got ${a.status}`);
  if (a.loc || p.loc || (p.status >= 300 && p.status < 400)) { redirects++; bad(`${name}: redirected`); }
}

// Cache independence: alias first then canonical, and the reverse.
const alias = aliases[`letter ${lookalike} for ${last}`];
const order1 = [await page(alias), await page(C)];
const order2 = [await page(C), await page(alias)];
const cacheOk = !order1[0].verified && order1[1].verified && order2[0].verified && !order2[1].verified;
console.log(`cache order              alias→canonical ${order1.map((x) => (x.verified ? 'V' : '-')).join('')} | canonical→alias ${order2.map((x) => (x.verified ? 'V' : '-')).join('')}`);
if (!cacheOk) bad('request order changed a verdict (cache alias collision)');

console.log('');
console.log(`AMBIGUOUS_REFERENCE_ALIAS_ACCEPTANCE=${aliasVerified}`);
console.log(`PROOF_ALIAS_REDIRECTS=${redirects}`);
console.log(`PROOF_CACHE_ALIAS_COLLISION=${cacheOk ? 'PASS' : 'FAIL'}`);
console.log(`PROOF_REFERENCE_CANONICALITY_E2E: ${fail === 0 ? 'PASS' : `FAIL (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
