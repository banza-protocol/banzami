#!/usr/bin/env node
/**
 * Does the console half of the hygiene gate actually bite?
 *
 * The gate was extended after 33 console accounts, each with a live session,
 * were found sitting on the operator — one set per harness run, kept forever.
 * A gate written to catch that must be shown catching it, on the two shapes it
 * actually took: a harness that inserts the account itself, and one that lets
 * /auth/request-otp create it during sign-in. The second is the one the first
 * version of the gate missed.
 *
 * Each case is a crafted file in a temporary directory, run through the real
 * gate as a child process.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = 'tools/check-harness-hygiene.mjs';
const ROOT = join(HERE, '..');

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? '✓' : '✗'} ${name}`); if (!cond) failed++; };

const INSERTS = `
const made = ssh(\`q "insert into account_identity.identity_users (email, verified, status)
  select 'probe-\${stamp}@banzami-e2e.test', true, 'ACTIVE'"\`);
`;
const SIGNS_IN = `
const email = n => \`probe-\${n}-\${stamp}@banzami-e2e.test\`;
await ctx.request.post(\`\${API}/auth/request-otp\`, { data: { email: email('a') } });
`;
const CLEANS = `
import { registerCleanup } from './lib/run-cleanup.mjs';
registerCleanup({ emailPattern: \`probe-%\${stamp}@banzami-e2e.test\` });
`;
const NO_PATTERN = `
import { registerCleanup } from './lib/run-cleanup.mjs';
registerCleanup({});
`;

/** Run the real gate over a copy of the repo whose console dir holds only `src`. */
function runGate(src) {
  const dir = mkdtempSync(join(tmpdir(), 'hyg-'));
  try {
    mkdirSync(join(dir, 'tests', 'phase0'), { recursive: true });
    mkdirSync(join(dir, 'tools', 'e2e', 'console', 'lib'), { recursive: true });
    mkdirSync(join(dir, 'tools', 'e2e', 'dev-console'), { recursive: true });
    cpSync(join(ROOT, GATE), join(dir, GATE));
    writeFileSync(join(dir, 'tools/e2e/console/probe.mjs'), src);
    const out = execFileSync('node', [GATE], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    return { pass: true, out };
  } catch (e) {
    return { pass: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A harness that creates nothing needs nothing.
check('a read-only harness passes', runGate('const r = await fetch(API);').pass);

// The two ways an account gets created, each without cleanup.
{
  const r = runGate(INSERTS);
  check('inserts an account, no cleanup → fail', !r.pass && /never calls registerCleanup/.test(r.out));
}
{
  const r = runGate(SIGNS_IN);
  check('signs in a fresh address, no cleanup → fail', !r.pass && /never calls registerCleanup/.test(r.out));
}

// The same two, wired up.
check('inserts an account, registers cleanup → pass', runGate(CLEANS + INSERTS).pass);
check('signs in a fresh address, registers cleanup → pass', runGate(CLEANS + SIGNS_IN).pass);

// Registered but pointing at nothing: cleanup that matches no address removes
// nothing and still reads as cleanup.
{
  const r = runGate(NO_PATTERN + INSERTS);
  check('registers cleanup with no emailPattern → fail', !r.pass && /emailPattern/.test(r.out));
}

if (failed) { console.error(`\n✗ console hygiene self-test: ${failed} case(s) failed`); process.exit(1); }
console.log('\n✓ console hygiene self-test: both ways of minting an account are caught');
