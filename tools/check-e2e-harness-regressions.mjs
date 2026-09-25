#!/usr/bin/env node
/**
 * check-e2e-harness-regressions — the harness defect CLASSES the first GOLDEN
 * run exposed, held shut.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * Every one of these was found because a gate was red. What makes them worth a
 * guard is that each had a sibling that was GREEN for the same reason — a slug
 * that resolved to nothing and "proved" a QR fails closed, a marker string the
 * product had renamed so nothing could ever leak it, a logout that never
 * happened so the session stayed valid. The red ones got fixed. The green ones
 * had to be found.
 *
 *   node tools/check-e2e-harness-regressions.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROOFS = join(repo, 'tools/e2e/app-web/proofs');
const LIB = join(repo, 'tools/e2e/app-web/lib');
const files = readdirSync(PROOFS).filter((n) => n.endsWith('.mjs'));
const read = (d, n) => readFileSync(join(d, n), 'utf8');

let failures = 0;
const check = (title, ok, detail = '') => {
  if (ok) return console.log(`  ✓ ${title}`);
  console.log(`  ✗ ${title}${detail ? `\n      ${detail}` : ''}`);
  failures++;
};

console.log('\nharness regressions — classes found by the first GOLDEN\n');

// ── SQL quoting: a quoted literal inside a single-quoted sh -c closes the
//    string early, and postgres reads status='X' as the identifier X. Proof 14
//    resolved nothing for weeks and still reported three green gates.
for (const f of files) {
  const src = read(PROOFS, f);
  for (const m of src.matchAll(/sh -c\s*\\?'[^\n]*psql[^\n]*-c\s*"([^"\n]*)"/g)) {
    check(`SQL quoting · ${f}`, !m[1].includes("'"),
      `a quoted SQL literal is interpolated into a single-quoted sh -c; send it base64 instead`);
  }
}
check('SQL quoting · no proof interpolates a quoted literal into sh -c',
  !files.some((f) => /sh -c\s*\\?'[^\n]*psql[^\n]*-c\s*"[^"\n]*'/.test(read(PROOFS, f))));

// ── One canonical Business sign-in. Six proofs each carried their own copy and
//    five were left behind when the product added a Welcome screen.
const signin = read(LIB, 'business-signin.mjs');
check('sign-in · one shared definition exists',
  /export async function businessWebSignIn/.test(signin));
const stale = files.filter((f) => /fillFieldBySemantics\('O seu @banza'/.test(read(PROOFS, f)));
check('sign-in · no proof drives the retired one-screen login', stale.length === 0,
  `still stale: ${stale.join(', ')}`);
// A proof may only re-implement the sequence by SAYING SO. The marker makes the
// exception reviewable; without it, the next silent copy drifts like the last six.
const ownCopy = files.filter((f) => {
  const s = read(PROOFS, f);
  return /waitForText\('Conectar conta'/.test(s) && /fillFieldBySemantics\('cantina_alex'/.test(s)
      && !/SIGNIN_INLINE_BY_DESIGN/.test(s);
});
check('sign-in · an inline copy is declared, or absent', ownCopy.length === 0,
  `undeclared inline sign-in in: ${ownCopy.join(', ')}`);

// ── Flutter tappables. An InkWell's semantics node is role="button"; tapText
//    hits the label overlay, the pointer is swallowed, onTap never fires, and
//    NOTHING is logged. In proof 10 that impersonated session replay.
const ACTIONS = ['Terminar sessão', 'Remover conta', 'Sair', 'Gerar cobrança', 'Criar cobrança', 'Continuar', 'Entrar'];
for (const f of files) {
  const src = read(PROOFS, f);
  for (const a of ACTIONS) {
    const bare = new RegExp(`(?<!tapButton\\([^)]{0,40})tapText\\('${a.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}'\\)(?!\\s*\\))`);
    // A tapText is acceptable only as an explicit fallback after a tapButton.
    const lines = src.split('\n').filter((l) => l.includes(`tapText('${a}')`) && !l.includes('tapButton'));
    check(`tappables · ${f} does not tapText "${a}" without a tapButton`, lines.length === 0,
      lines[0]?.trim());
    void bare;
  }
}

// ── Reusable fixtures must survive. retireBusiness SUSPENDS, and seven of nine
//    proofs called it on a supplied fixture, poisoning the handle for every
//    later run with an error that looks nothing like the cause.
// ── fixture hygiene: give back what you were given ───────────────────────────
// The Sandbox's aggregate-funds cap is 50 000 000 minor and SHARED. Proof 15
// funded a fresh consumer 500 000 on every run and never returned it: 42 runs
// in one day held 39 600 000 of the cap, and the next run's funding was refused
// with INSUFFICIENT_FUNDS — which reads like a product fault and is not one.
// Nine sibling proofs already retired their consumers; nothing made that a rule.
// The rule above used to live here as a source match on THIS file only:
//
//     /auth\/register/ present  =>  retireConsumer must be present
//
// It never applied to proof 14, which registers through the UI, nor to proof 04,
// whose registration is three files away inside lib/deeplink-pay.mjs. Both
// leaked a 1 000 000 minor grant per registration for months while this gate
// stayed green. Lifecycle is now decided across the whole import closure, over
// API and UI primitives alike, and about the EXCEPTION path — by
// tools/check-validation-fixture-lifecycle.mjs. What remains here is the
// assertion that the replacement is actually wired up, so deleting it is loud.
check('fixture hygiene · lifecycle is decided by the closure-aware guard',
  existsSync(join(repo, 'tools/check-validation-fixture-lifecycle.mjs')),
  'the narrow source match this replaced was green through two real leaks');
check('fixture hygiene · …and that guard is mutation-proven',
  existsSync(join(repo, 'tools/check-validation-fixture-lifecycle.selftest.mjs')));

const prov = read(LIB, 'business-provision.mjs');
// A retirement that returns nothing is a suspension. retireBusiness suspended
// and stopped there, so proof 24's fixture kept the 350 000 it was paid on every
// execution — while the harness could point at a call named "retireBusiness".
const provSrc = read(LIB, 'business-provision.mjs');
check('fixtures · retireBusiness returns the value the Business holds',
  /sandbox\/retire-funds[\s\S]{0,200}?"owner_type":"MERCHANT"/.test(provSrc),
  'its consumer counterpart has always done the balanced posting before suspending');
check('fixtures · …and does so BEFORE suspending it',
  provSrc.indexOf('sandbox/retire-funds') < provSrc.indexOf('/suspend'),
  'a suspended merchant may no longer accept the posting that empties it');

check('fixtures · retireBusiness refuses a reused id structurally',
  /REUSED\.has\(merchantId\)/.test(prov) && /return 'skipped-reused'/.test(prov),
  'a rule seven call sites have to remember is not a rule');

/* ── diagnostic instrumentation must be inert when it is off ─────────────── */
//
// Proof 18 carries a root-cause probe behind BZ_S18_PROBE. Instrumentation that
// can change a verdict is not instrumentation — it is a second, undeclared
// harness. These are the properties that make "off by default" a fact rather
// than an intention.
{
  const { readFileSync } = await import('node:fs');
  const p18 = readFileSync(new URL('./e2e/app-web/proofs/18-business-web-large-text.mjs', import.meta.url), 'utf8');
  const guard = "if (process.env.BZ_S18_PROBE === '1') {";
  const at = p18.indexOf(guard);
  check('probe · proof 18 gates its root-cause probe on BZ_S18_PROBE', at > 0,
    'an ungated probe runs on every validation run');

  // The whole block, by brace balance from the guard.
  let depth = 0, end = at;
  for (let i = at + guard.length - 1; i < p18.length; i++) {
    if (p18[i] === '{') depth++;
    else if (p18[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const block = p18.slice(at, end + 1);
  check('probe · it records no gate, so it cannot change a verdict',
    at > 0 && !/R\.mark\(/.test(block), 'a probe that marks is a harness');
  check('probe · it only reads and prints',
    at > 0 && !/\bclick\(|\btype\(|tapButton|tapText|tapLocatorBox|goto\(|wheel\(/.test(block),
    'a probe that acts changes the thing it is measuring');
  check('probe · a failure inside it cannot fail the proof',
    at > 0 && /\.catch\(/.test(block), 'an unguarded evaluate would throw out of the journey');
  check('probe · exactly one such gated block exists',
    (p18.match(/process\.env\.BZ_S18_PROBE/g) ?? []).length === 1);

  // And the scale lever: overridable, but the DEFAULT is the scale the journey
  // exists to test. A default that drifted to 16px would turn this proof into a
  // normal-text proof wearing a large-text name.
  check('probe · the text scale defaults to the 1.50x this journey tests',
    /BZ_LARGE_FONT_PX \?\? 24/.test(p18), 'the default is the assertion');
}

console.log(failures === 0
  ? `\n✓ E2E_HARNESS_REGRESSIONS=PASS\n`
  : `\n✗ E2E_HARNESS_REGRESSIONS=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
