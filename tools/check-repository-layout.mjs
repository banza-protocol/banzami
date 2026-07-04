#!/usr/bin/env node
/**
 * check-repository-layout.mjs
 *
 * Verifies that the Banzami repository structure conforms to the frozen
 * architecture defined in CLAUDE.md §20 and README.md §Repository Layout.
 *
 * Usage:
 *   node tools/check-repository-layout.mjs
 *   make check-repo-layout
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more checks failed
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

let failures = 0;
let warnings = 0;
let passes   = 0;

const RESET  = '\x1b[0m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const CYAN   = '\x1b[36m';

function pass(msg)  { console.log(`  ${GREEN}✓${RESET}  ${msg}`); passes++; }
function fail(msg)  { console.error(`  ${RED}✗${RESET}  ${msg}`); failures++; }
function warn(msg)  { console.warn(`  ${YELLOW}⚠${RESET}  ${msg}`); warnings++; }
function section(t) { console.log(`\n${BOLD}${CYAN}${t}${RESET}`); }

function exists(rel, label) {
  const ok = existsSync(join(ROOT, rel));
  ok ? pass(`${label ?? rel} exists`) : fail(`${label ?? rel} is MISSING  (${rel})`);
  return ok;
}

// ─── 1. Required top-level directories ───────────────────────────────────────

section('1. Required top-level directories');

const REQUIRED_TOP_LEVEL = [
  ['core',          'core/  — Rust financial core (Cargo workspace)'],
  ['services',      'services/  — Go orchestration services'],
  ['apps',          'apps/  — Product-facing applications'],
  ['sdk',           'sdk/  — Official Banzami SDKs'],
  ['plugins',       'plugins/  — Commerce plugins and runtime adapters'],
  ['db',            'db/  — PostgreSQL migrations'],
  ['infra',         'infra/  — Infrastructure as code'],
  ['docs',          'docs/  — Technical documentation'],
  ['tools',         'tools/  — Developer tooling'],
  ['quality',       'quality/  — Canonical operator assurance manifest'],
  ['ops',           'ops/  — Authoritative asset inventory (non-secret)'],
];

for (const [dir, label] of REQUIRED_TOP_LEVEL) {
  exists(dir, label);
}

// ─── 2. (removed) contracts/ subdirectories ──────────────────────────────────
// Protocol contracts are owned by the BANZA protocol repo, not the operator.
// Removed in BANZAMI-PURIFICATION-EXECUTION-001. Canonical home: ~/banza/contracts/.

// ─── 3. infra/terraform/ provider directories ─────────────────────────────────

section('3. infra/terraform/ provider subdirectories');

const REQUIRED_TERRAFORM = [
  'infra/terraform/cloudflare',
  'infra/terraform/ionos',
  'infra/terraform/monitoring',
  'infra/terraform/networking',
];

for (const dir of REQUIRED_TERRAFORM) {
  exists(dir);
}

// ─── 4. core/jobs/ ────────────────────────────────────────────────────────────

section('4. core/jobs/ — background job home');

exists('core/jobs', 'core/jobs/  — background jobs owned by financial core');

// ─── 5. apps/ product-app check ──────────────────────────────────────────────

section('5. apps/ — product applications');

// 'mobile' is the unified Flutter app: it builds BOTH the consumer (users) and
// merchant apps via flavors (main_consumer.dart / main_merchant.dart). There is
// no separate 'merchant' directory — the two Banzami mobile apps come from here.
const EXPECTED_APPS = new Set(['dashboard', 'admin', 'pay', 'checkout', 'mobile', 'website', 'validation-studio']);
const actualApps = readdirSync(join(ROOT, 'apps'), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

const unknownApps = actualApps.filter(a => !EXPECTED_APPS.has(a));
if (unknownApps.length === 0) {
  pass('No unknown directories in apps/');
} else {
  for (const a of unknownApps) {
    fail(`Unknown directory in apps/: "${a}" — product apps only; move platforms to apps/validation-studio, or update EXPECTED_APPS in this check`);
  }
}

// Warn about known non-product apps (governance note)
const PLATFORM_APPS = actualApps.filter(a => ['validation-studio'].includes(a));
if (PLATFORM_APPS.length > 0) {
  warn(`apps/ contains platform directories: ${PLATFORM_APPS.join(', ')}  — target: platforms/ (migration pending, physically safe for now)`);
}

// ─── 6. Known top-level directories (no surprise additions) ──────────────────

section('6. No unexpected top-level directories');

const ACCEPTED_TOP_LEVEL = new Set([
  'core', 'services', 'apps', 'sdk', 'plugins',
  'db', 'infra', 'docs', 'tools', 'assets',
  'evidence',            // conformance / audit evidence artifacts (not a source of truth)
  'quality',             // canonical assurance manifest (operator-assurance-manifest.yaml)
  'ops',                 // authoritative non-secret asset inventory (asset-inventory.yaml)
  '.git', '.github', '.gitignore', '.env', '.env.example',
  '.claude',             // Claude Code project config (memory, commands)
  '.DS_Store',           // macOS filesystem artifact
  '.tmux.conf',          // tmux developer config
  'CLAUDE.md', 'README.md', 'Makefile', 'deploy.sh', 'dev.sh',
  'Cargo.lock',          // root Cargo.lock if present
  'go.work', 'go.work.sum', // Go multi-module workspace (ties services/ together)
  'node_modules',        // gitignored dependency tree (present locally)
  // Operator top-level documents
  'BANZAMI_ARCHITECTURE.md', 'BANZAMI_DEPLOYMENT.md', 'BANZAMI_GOVERNANCE.md',
  'BANZAMI_OPERATIONS.md', 'BANZAMI_REFERENCE.md', 'BANZAMI_REFERENCIA.md',
  'BANZAMI_SECURITY.md',
  'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'LICENSE',
]);

const topLevel = readdirSync(ROOT, { withFileTypes: true }).map(d => d.name);
const unknownTop = topLevel.filter(n => !ACCEPTED_TOP_LEVEL.has(n));

if (unknownTop.length === 0) {
  pass('No unexpected top-level entries');
} else {
  for (const n of unknownTop) {
    fail(`Unexpected top-level entry: "${n}" — must be documented in CLAUDE.md §20 and accepted in this check`);
  }
}

// ─── 7. sdk/ structure ───────────────────────────────────────────────────────

section('7. sdk/ — official SDK presence');

const EXPECTED_SDKS = ['flutter', 'typescript', 'python', 'php', 'go'];
for (const sdk of EXPECTED_SDKS) {
  exists(`sdk/${sdk}`, `sdk/${sdk}/`);
}

// ─── 8. README documents the top-level layout ────────────────────────────────

section('8. README.md documents the repository layout');

const readme = readFileSync(join(ROOT, 'README.md'), 'utf-8');
const REQUIRED_README_MENTIONS = [
  ['core/',     'core/ in README'],
  ['services/', 'services/ in README'],
  ['apps/',     'apps/ in README'],
  ['sdk/',      'sdk/ in README'],
];

for (const [token, label] of REQUIRED_README_MENTIONS) {
  readme.includes(token) ? pass(label) : fail(`${label} — add description to Repository Layout section`);
}

// ─── 9. CLAUDE.md has Repository Layout Freeze section ─────────────────────

section('9. CLAUDE.md §20 Repository Layout Freeze');

const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf-8');
if (claude.includes('Repository Layout Freeze')) {
  pass('CLAUDE.md contains Repository Layout Freeze section');
} else {
  fail('CLAUDE.md is missing §20 Repository Layout Freeze — add the governance rules');
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`${BOLD}Repository layout check${RESET}`);
console.log(`  ${GREEN}Passed:${RESET}   ${passes}`);
if (warnings > 0) console.log(`  ${YELLOW}Warnings:${RESET} ${warnings}  (informational — do not block CI)`);
if (failures > 0) {
  console.log(`  ${RED}Failed:${RESET}   ${failures}`);
  console.log(`\n${RED}${BOLD}Layout check FAILED.${RESET} Fix the issues above before merging.\n`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}${BOLD}Layout check passed.${RESET}\n`);
}
