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
import { readFileSync, readdirSync } from 'node:fs';
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
const prov = read(LIB, 'business-provision.mjs');
check('fixtures · retireBusiness refuses a reused id structurally',
  /REUSED\.has\(merchantId\)/.test(prov) && /return 'skipped-reused'/.test(prov),
  'a rule seven call sites have to remember is not a rule');

console.log(failures === 0
  ? `\n✓ E2E_HARNESS_REGRESSIONS=PASS\n`
  : `\n✗ E2E_HARNESS_REGRESSIONS=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
