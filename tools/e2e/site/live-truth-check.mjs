#!/usr/bin/env node
/**
 * DOCS-TRUTH-PREMIUM-001 — rendered-truth check of the DEPLOYED public surfaces.
 *
 * Fetches the live rendered HTML of the canonical public pages and asserts the
 * product truth as SHIPPED (not as sourced): real-money operations unavailable, Sandbox
 * available, no /v2, no legacy /v1/business routes, no rail-free overclaim, no
 * stale persona, no "em desenvolvimento" native status. Complements the
 * source-level check-public-site-truth gate with a live-runtime assertion.
 *
 *   node tools/e2e/site/live-truth-check.mjs
 */
const PAGES = [
  'https://banzami.com/', 'https://banzami.com/produto', 'https://banzami.com/faq',
  'https://banzami.com/comerciantes', 'https://banzami.com/sobre', 'https://banzami.com/developers',
  'https://banzami.com/suporte', 'https://banzami.com/testes',
  'https://developers.banzami.com/docs', 'https://developers.banzami.com/docs/en',
];
// A negation anywhere in the span means real-money operations are correctly
// stated as NOT available: the fused prefixes (indisponível / unavailable) OR a
// separate negation word (não / not / sem) before "disponível".
const NEG = /indispon|unavailable|n[ãa]o|not|sem/;
// The real-money environment, by its public name (operações com dinheiro real /
// real-money operations) or the legacy internal term (defensive, must be gone).
const REALMONEY = /opera[cç][õo]es com dinheiro real|real-money operations|financial live/;

async function checkPage(url) {
  let html;
  try { html = (await (await fetch(url)).text()).toLowerCase(); } catch (e) { return [`FETCH_FAILED:${String(e.message).slice(0, 40)}`]; }
  const bad = [];

  // Real-money operations must never be asserted AVAILABLE. Scan every
  // "operações com dinheiro real … (disponíveis|available|…)" span; a span is a
  // violation only if it contains NO negation token (indisponível / não … disponível
  // / unavailable). Match the availability word only when NOT fused with in-/un-;
  // then reject the span if it carries any negation (covers "não estão disponíveis").
  const re = /(?:opera[cç][õo]es com dinheiro real|real-money operations|financial live)[^.<]{0,80}?(?<!in)(?<!un)(dispon[ií]ve(?:l|is)|available|enabled|operational|ao vivo|activ[oa])/g;
  let m;
  while ((m = re.exec(html))) { if (!NEG.test(m[0])) bad.push(`LIVE-AVAILABLE:"${m[0].slice(0, 60)}"`); }

  if (/licenciad|bna.?approv|autorizado pelo bna|regulated live operator|licensed psp/.test(html)) bad.push('LIVE-LICENSE');
  if (/rail-free|bypass\s*(the\s*)?(bank|emis|banco)|no banks needed/.test(html)) bad.push('RAIL-FREE');
  if (/joaosilva|joao_silva|@joao(?![a-z])/.test(html)) bad.push('STALE-PERSONA');
  if (/nome opcional|em desenvolvimento/.test(html)) bad.push('STALE-STATUS');
  if (/\bapi v2\b|\/v2\//.test(html)) bad.push('V2');
  if (/\/v1\/business\//.test(html)) bad.push('LEGACY-ROUTE');
  // Positive truths a public page about the product should carry.
  if (!/sandbox/.test(html)) bad.push('NO-SANDBOX-MENTION');
  if (REALMONEY.test(html) && !/indispon[ií]ve|unavailable|n[ãa]o\s+(\w+\s+){0,2}dispon/.test(html)) bad.push('LIVE-NOT-MARKED-UNAVAILABLE');
  // The internal term must not leak onto a public page.
  if (/financial live/.test(html)) bad.push('LEGACY-FINANCIAL-LIVE-TERM');
  return bad;
}

let fail = 0;
for (const u of PAGES) {
  const bad = await checkPage(u);
  if (bad.length) { console.error(`  ✗ ${u} -> ${bad.join(' ')}`); fail = 1; }
  else console.log(`  ✓ ${u}`);
}
console.log(`\nRUNTIME_DOCS_TRUTH_CONTRADICTIONS=${fail}`);
console.log(`LIVE_TRUTH_CHECK=${fail === 0 ? 'PASS' : 'FAIL'}`);
process.exitCode = fail;
