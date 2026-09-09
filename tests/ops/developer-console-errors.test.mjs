/**
 * The Developers Console must not discard the API's diagnosis.
 *
 * Found while driving the public login as an external developer: submitting a
 * malformed address returned
 *
 *     400 {"error":{"code":"INVALID_EMAIL","message":"invalid email"}}
 *
 * and the console displayed "Não foi possível enviar o código. Tente novamente."
 * The page branched on a short list of codes and re-derived a sentence, so a
 * precise, actionable diagnosis became a generic failure — which invites the
 * developer to retry, and retrying is how they reach the rate limiter. It is the
 * first screen an external developer ever sees.
 *
 * These assertions are about the mapping, not the network.
 *
 * Run: node tests/ops/developer-console-errors.test.mjs
 */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (d) => { console.log(`  \x1b[0;32m✓\x1b[0m ${d}`); pass++; };
const no = (d, got) => { console.log(`  \x1b[0;31m✗\x1b[0m ${d} — ${got}`); fail++; };
const is = (d, c, got = '') => (c ? ok(d) : no(d, got));

const api = readFileSync(new URL('../../apps/website/lib/developer-api.ts', import.meta.url), 'utf8');
const login = readFileSync(new URL('../../apps/website/app/developers/login/page.tsx', import.meta.url), 'utf8');

// The message table, read out of the source so the test tracks the real file.
const table = Object.fromEntries(
  [...api.matchAll(/^\s{2}([A-Z_]+):\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]));

console.log('\n▸ every code the API actually returns has a mapped message');
for (const code of ['INVALID_EMAIL', 'RATE_LIMITED', 'VALIDATION', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND']) {
  is(`${code} is mapped`, typeof table[code] === 'string' && table[code].length > 0, JSON.stringify(table[code]));
}

console.log('\n▸ the mapped messages are usable Portuguese, not passthrough English');
is('INVALID_EMAIL tells the developer what to fix',
   /email válido/i.test(table.INVALID_EMAIL ?? ''), JSON.stringify(table.INVALID_EMAIL));
is('RATE_LIMITED says to wait, not to retry now',
   /daqui a pouco|aguarde|mais tarde/i.test(table.RATE_LIMITED ?? ''), JSON.stringify(table.RATE_LIMITED));
is('no mapped message is English passthrough',
   !Object.values(table).some((m) => /^invalid email$|^too many requests/i.test(m)),
   Object.values(table).filter((m) => /^invalid/i.test(m)).join('|'));

console.log('\n▸ the login page uses the mapping instead of re-deriving one');
is('it imports the shared message table', /import\s*{[^}]*MESSAGES[^}]*}\s*from\s*'@\/lib\/developer-api'/.test(login),
   'MESSAGES not imported');
is('it looks the code up rather than listing codes inline',
   /MESSAGES\[\s*err\.code\s*\]/.test(login), 'no lookup');
is('the generic sentence remains only as the fallback',
   (login.match(/Não foi possível enviar o código/g) ?? []).length === 1, 'generic message used more than once');
// The specific regression: a hard-coded ternary chain reintroduces the defect.
is('no inline code ternary chain remains',
   !/code === 'RATE_LIMITED'[\s\S]{0,200}code === 'VALIDATION'/.test(login), 'ternary chain still present');

console.log();
if (fail === 0) { console.log(`\x1b[0;32m✓ developer console errors: ${pass}/${pass + fail}\x1b[0m\n`); process.exit(0); }
console.log(`\x1b[0;31m✗ developer console errors: ${fail} of ${pass + fail} failed\x1b[0m\n`);
process.exit(1);
