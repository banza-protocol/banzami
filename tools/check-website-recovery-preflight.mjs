#!/usr/bin/env node
// check-website-recovery-preflight.mjs
//
// Website-only deploy/recovery preflight. Verifies just the prerequisites the
// institutional website (banzami.com) needs to build and be restored — WITHOUT
// requiring unrelated payment/platform/manifest/SDK checks. Used by the
// scope-aware assurance gate in deploy.sh for website-only deploys, so an
// emergency website restore does not need an assurance-skip for unrelated
// repository checks. See docs/infra/BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md.
//
// This is a SERVICE-SPECIFIC check. Global safety (single-source-of-truth guard,
// wrong-checkout / banzami-canonical rejection, no local QEMU fallback) is
// enforced separately and unconditionally by deploy.sh itself; this file must
// never weaken those.
//
// No network, no Docker, no database. Exit 0 = website prerequisites present.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); failed++; };

// 1. Website application source present.
const APP = join(ROOT, 'apps', 'website');
existsSync(APP) ? ok('apps/website/ present') : bad('apps/website/ missing');

// 2. Website package manifest present, with a build command.
const PKG = join(APP, 'package.json');
if (!existsSync(PKG)) {
  bad('apps/website/package.json missing');
} else {
  ok('apps/website/package.json present');
  let pkg = {};
  try { pkg = JSON.parse(readFileSync(PKG, 'utf8')); } catch { bad('apps/website/package.json is not valid JSON'); }
  (pkg.scripts && typeof pkg.scripts.build === 'string')
    ? ok('website build command present (scripts.build)')
    : bad('website build command missing (scripts.build)');
}

// 3. Website-only proxy / recovery documentation present (the independence rule
//    and the sanitised recovery procedure must exist).
for (const rel of [
  join('docs', 'infra', 'BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md'),
  join('docs', 'infra', 'BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md'),
]) {
  existsSync(join(ROOT, rel)) ? ok(`${rel} present`) : bad(`${rel} missing`);
}

if (failed > 0) {
  console.error(`website recovery preflight FAILED (${failed} issue(s))`);
  process.exit(1);
}
console.log('website recovery preflight PASS');
