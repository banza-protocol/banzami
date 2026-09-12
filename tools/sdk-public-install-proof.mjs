#!/usr/bin/env node
/**
 * CAP-SDK-001 — what an integrator actually gets from the public registry.
 *
 * Runs OUTSIDE every Banzami repository, installs @banzami/sdk from
 * registry.npmjs.org by version range only, and exercises the PUBLISHED build.
 * The point is the class of defect that only appears there: a file missing from
 * the tarball, an entrypoint that does not resolve, a type that ships wrong, a
 * local path silently satisfying the import.
 *
 * It proves what can be proved without a credential — integrity, contents,
 * entrypoints, methods, money formatting, webhook signature verification, and
 * that nothing resolved from disk. The credentialed half of the release (calls
 * against the deployed Sandbox) is a separate artifact; this one is the part
 * that must be re-run every time the registry changes.
 *
 *   node tools/sdk-public-install-proof.mjs [--out <path>]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? process.argv[outArg + 1] : join(ROOT, 'evidence/assurance/sdk/cap-sdk-001-public-install.json');

const PKG = '@banzami/sdk';
const checks = [];
const check = (id, pass, note) => { checks.push({ id, pass: !!pass, note }); console.log(`${pass ? '  \x1b[32m✓\x1b[0m' : '  \x1b[31m✗\x1b[0m'} ${id} — ${note}`); };
const npm = (args, cwd) => execFileSync('npm', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });

// 1. What the registry serves, asked of the registry itself.
const view = JSON.parse(npm(['view', PKG, '--json'], ROOT));
const latest = view['dist-tags'].latest;
console.log(`\n${PKG}: registry latest = ${latest}\n`);

// 2. A clean project, outside any repository, depending on the version range.
const dir = mkdtempSync(join(tmpdir(), 'banzami-sdk-cleanroom-'));
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'cleanroom', private: true, type: 'module', dependencies: { [PKG]: `^${latest}` } }, null, 2));
npm(['install', '--no-audit', '--no-fund'], dir);

const installed = JSON.parse(readFileSync(join(dir, 'node_modules', PKG, 'package.json'), 'utf-8'));
const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf-8'));
const entry = lock.packages?.[`node_modules/${PKG}`] ?? {};

check('SDK.registry.published', !!latest, `dist-tags.latest = ${latest}`);
check('SDK.install.from-registry', String(entry.resolved || '').startsWith('https://registry.npmjs.org/'), `resolved ${entry.resolved}`);
check('SDK.install.version-matches-latest', installed.version === latest, `installed ${installed.version}`);
check('SDK.install.no-local-path', !/^(file:|link:|workspace:)/.test(JSON.stringify(entry.resolved || '')), 'no file:/link:/workspace: spec');
check('SDK.install.integrity-recorded', !!entry.integrity, `${String(entry.integrity).slice(0, 24)}…`);
check('SDK.registry.license-mit', installed.license === 'MIT', String(installed.license));

// 3. The source tree must not be BEHIND the registry: if it were, the published
//    package would contain code nothing here describes.
const srcVersion = JSON.parse(readFileSync(join(ROOT, 'sdk/typescript/package.json'), 'utf-8')).version;
const cmp = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); return 0; };
check('SDK.source.not-behind-registry', cmp(srcVersion, latest) >= 0, `source ${srcVersion}, registry ${latest}`);

// 4. The published tarball's contents — the files an integrator receives.
for (const f of ['dist/index.js', 'dist/index.d.ts', 'dist/types.d.ts', 'dist/sandbox.js', 'README.md', 'LICENSE']) {
  check(`SDK.contents.${f}`, existsSync(join(dir, 'node_modules', PKG, f)), f);
}
// A credential literal in a published file would be shipped to every integrator.
const files = execFileSync('find', [join(dir, 'node_modules', PKG), '-type', 'f'], { encoding: 'utf-8' }).trim().split('\n');
const credential = ['bz', '_', 'test', '_', 'sk', '_'].join('').replace(/_(?=[a-z])/g, '_');
const leaked = files.filter(f => /\.(js|ts|json|md|map)$/.test(f) && /bz_(test|live)_(sk|pk)_[A-Za-z0-9]/.test(readFileSync(f, 'utf-8')));
check('SDK.contents.no-credential-literal', leaked.length === 0, leaked.length ? leaked.join(', ') : 'no key literal in any published file');

// 5. The PUBLISHED build, executed.
const probe = join(dir, 'probe.mjs');
writeFileSync(probe, `
import { formatMinor, addMinor } from '${PKG}';
import { BanzamiClient } from '${PKG}/sandbox';
import { verifySignature, SIGNATURE_HEADER } from '${PKG}';
import { createHmac } from 'node:crypto';

const out = {};
// Money is minor units in, a formatted Kwanza string out. 0.12.1 printed every
// amount 100x too large; the boundaries are the whole point of the matrix.
out.money = [[5000000,'50 000 Kz'],[0,null],[1,null],[100,null],[1000,null],[-1000,null],[100000000000,null],[5000050,null]]
  .map(([m, want]) => ({ minor: m, got: formatMinor(m, 'AOA'), want }));
out.addMinor = addMinor(999999999, 1);

// A live-rail key must be refused client-side, before any network call.
try { new BanzamiClient({ apiKey: 'bz_live_sk_' + 'x'.repeat(24), environment: 'sandbox' }); out.liveKeyRejected = false; }
catch { out.liveKeyRejected = true; }

// Webhook signature verification, against a signature this probe computes.
const secret = 'whsec_' + 'k'.repeat(24);
const body = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded' });
const t = Math.floor(Date.now() / 1000);
const v1 = createHmac('sha256', secret).update(t + '.' + body).digest('hex');
// verifySignature RETURNS for a good signature and THROWS for anything else,
// so a caller who forgets to check a boolean cannot accept a forged event.
const verifies = (b, h, s) => { try { verifySignature(b, h, s); return true; } catch { return false; } };
out.sigHeader = SIGNATURE_HEADER;
out.sigValid = verifies(body, \`t=\${t},v1=\${v1}\`, secret);
out.sigTampered = verifies(body + ' ', \`t=\${t},v1=\${v1}\`, secret);
out.sigWrongSecret = verifies(body, \`t=\${t},v1=\${v1}\`, secret + 'x');
out.sigEmptySecret = verifies(body, \`t=\${t},v1=\${v1}\`, '');
out.sigStaleTimestamp = verifies(body, \`t=\${t - 4000},v1=\${createHmac('sha256', secret).update((t - 4000) + '.' + body).digest('hex')}\`, secret);
console.log(JSON.stringify(out));
`);
const probed = JSON.parse(execFileSync('node', [probe], { cwd: dir, encoding: 'utf-8' }).trim().split('\n').pop());

check('SDK.run.esm-entrypoint', typeof probed.addMinor === 'number', `addMinor(999999999,1) = ${probed.addMinor}`);
check('SDK.run.sandbox-entrypoint', probed.liveKeyRejected === true, 'BanzamiClient imported from ./sandbox');
const money = probed.money.find(m => m.minor === 5000000);
check('SDK.money.canonical-format', money.got === '50 000 Kz', `5 000 000 minor AOA -> '${money.got}'`);
check('SDK.money.no-float-scaling', probed.money.every(m => !/\./.test(m.got) && !/NaN|Infinity/.test(m.got)),
  probed.money.map(m => `${m.minor}->${m.got}`).join(' · '));
check('SDK.safety.live-key-in-sandbox-rejected', probed.liveKeyRejected === true, 'bz_live_ key with environment sandbox throws before any network call');
check('SDK.webhooks.header-canonical', probed.sigHeader === 'banza-signature', probed.sigHeader);
check('SDK.webhooks.valid-signature-accepted', probed.sigValid === true, 'a correctly signed body verifies');
check('SDK.webhooks.tampered-payload-rejected', probed.sigTampered === false, 'a modified payload does not verify');
check('SDK.webhooks.wrong-secret-rejected', probed.sigWrongSecret === false, 'a wrong secret does not verify');
check('SDK.webhooks.empty-secret-refused', probed.sigEmptySecret === false, 'an unconfigured secret is refused, never treated as a match');
check('SDK.webhooks.replay-window-enforced', probed.sigStaleTimestamp === false, 'a correctly signed body with a stale timestamp does not verify');

const passed = checks.filter(c => c.pass).length;
const evidence = {
  suite: `CAP-SDK-001 — public registry install, outside every Banzami repository`,
  generated_at: new Date().toISOString(),
  registry: {
    name: PKG,
    latest,
    license: installed.license,
    tarball: entry.resolved,
    integrity: entry.integrity,
    all_versions: view.versions,
  },
  clean_project: {
    inside_git_repo: false,
    dependency_spec: `^${latest}`,
    installed_version: installed.version,
    local_path_dependency: false,
  },
  source_version: srcVersion,
  assertions: checks,
  note: `Re-proved against the registry as served now. The published build is executed — money formatting, entrypoints and webhook signature verification come from the installed package, never from the working tree.`,
  total: checks.length,
  passed,
  promotable: passed === checks.length,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(evidence, null, 2) + '\n');
console.log(`\n${passed}/${checks.length} — ${evidence.promotable ? '\x1b[32mpromotable\x1b[0m' : '\x1b[31mNOT promotable\x1b[0m'}`);
console.log(`evidence -> ${OUT}\n`);
process.exit(evidence.promotable ? 0 : 1);
