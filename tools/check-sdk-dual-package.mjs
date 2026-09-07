/**
 * Prove the published tarball loads both ways, on a runtime that does not guess.
 *
 * @banzami/sdk ships ESM in dist/ and CommonJS in dist/cjs/. Until the dual-package
 * markers existed, nothing declared which was which, so Node fell back to the
 * package default — CommonJS — for a file full of `export` statements. Modern
 * Node hides that by detecting module syntax, which is why every check this repo
 * had stayed green while
 *
 *     import { constructEvent } from '@banzami/sdk'
 *
 * threw "Named export 'constructEvent' not found" inside a serverless function.
 *
 * So this does not import from the source tree. It packs the package exactly as
 * `npm publish` would, installs the tarball into a scratch directory, and loads
 * it twice — once through require(), once through a real ESM import with syntax
 * detection turned OFF, which is the behaviour of the runtimes that broke.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PKG = new URL('../sdk/typescript/', import.meta.url).pathname;
// Exports a developer reaches for straight out of the public documentation.
const NAMED = ['BanzamiClient', 'constructEvent', 'verifySignature', 'BanzamiApiError'];

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const work = mkdtempSync(join(tmpdir(), 'sdk-dual-'));
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  run('npm', ['pack', '--pack-destination', work], PKG);
  const tarball = readdirSync(work).find((f) => f.endsWith('.tgz'));
  if (!tarball) throw new Error('npm pack produced no tarball');

  writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
  run('npm', ['install', '--no-audit', '--no-fund', join(work, tarball)], work);

  // CommonJS consumer — require() must resolve the dist/cjs half.
  writeFileSync(join(work, 'cjs.cjs'), `
    const sdk = require('@banzami/sdk');
    const missing = ${JSON.stringify(NAMED)}.filter((n) => typeof sdk[n] === 'undefined');
    if (missing.length) { console.error('missing: ' + missing.join(', ')); process.exit(1); }
  `);
  try {
    run('node', ['cjs.cjs'], work);
    check('require() resolves the CommonJS build', true);
  } catch (e) {
    check('require() resolves the CommonJS build', false, String(e.stderr || e.message).split('\n')[0]);
  }

  // ESM consumer, with detection off. This is the case that failed in production.
  writeFileSync(join(work, 'esm.mjs'), `
    import * as sdk from '@banzami/sdk';
    import { ${NAMED.join(', ')} } from '@banzami/sdk';
    const missing = ${JSON.stringify(NAMED)}.filter((n) => typeof sdk[n] === 'undefined');
    if (missing.length) { console.error('missing: ' + missing.join(', ')); process.exit(1); }
  `);
  try {
    run('node', ['--no-experimental-detect-module', 'esm.mjs'], work);
    check('named ESM imports work without module-syntax detection', true);
  } catch (e) {
    const first = String(e.stderr || e.message).split('\n').find((l) => l.includes('Error')) ?? String(e.message);
    check('named ESM imports work without module-syntax detection', false, first.trim());
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nSDK dual-package loading: OK' : `\nSDK dual-package loading: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
