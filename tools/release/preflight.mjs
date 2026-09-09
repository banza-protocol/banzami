#!/usr/bin/env node
/**
 * Release preflight — fail before an expensive build, not inside it.
 *
 * Disk exhaustion stopped this programme twice. The second time it killed a
 * Rust attestation build partway through and left the Docker daemon
 * unresponsive, which is the shape of the problem: ENOSPC does not surface as
 * "no disk", it surfaces as a compiler error, a corrupt layer, or a hang, an
 * hour after the decision that caused it. By then the diagnosis costs more than
 * the build.
 *
 * So capacity is a gate, checked before the build starts, with a number that
 * comes from measurement rather than taste.
 *
 * HOW THE THRESHOLD IS DERIVED — and why it is not a round number someone liked
 *
 * Two observations bound it:
 *
 *   · a full release package build STARTING with 13 GiB free completed
 *   · a full release package build STARTING with ≈2.3 GiB free died with ENOSPC
 *
 * so the true transient requirement lies between those. The floor below is set
 * inside that interval, deliberately nearer the failure than the success, and it
 * is a FLOOR — not a claim of precision. The moment a build completes under
 * this tool it records what it actually consumed, and from then on the
 * requirement is that measurement plus a margin. The number calibrates itself
 * out of the guess.
 *
 * Measured artefact sizes, for the cleanup classification:
 *   · one source bundle              ~92 MiB
 *   · one release package directory  ~770 MiB   (2.3 GiB observed for three)
 *
 *   node tools/release/preflight.mjs [--require-gib N] [--json]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/** Floor, in GiB. Bounded by observation: >2.3 (failed) and <13 (succeeded). */
export const FLOOR_GIB = 8;
/** Margin applied to a calibrated measurement. */
export const CALIBRATION_MARGIN = 1.25;

export const storeRoot = () =>
  process.env.BANZAMI_ASSURANCE_STORE || join(homedir(), '.banzami', 'assurance');

const calibrationFile = () => join(storeRoot(), 'build-capacity.json');

/** GiB free on the filesystem holding `path`. */
export function freeGiB(path = process.cwd()) {
  const s = statfsSync(path);
  return (s.bavail * s.bsize) / 1024 ** 3;
}

/** The requirement: the calibrated peak plus margin, never below the floor. */
export function requiredGiB() {
  const explicit = Number(process.env.BANZAMI_RELEASE_REQUIRE_GIB);
  if (Number.isFinite(explicit) && explicit > 0) return { gib: explicit, source: 'env' };
  try {
    const c = JSON.parse(readFileSync(calibrationFile(), 'utf8'));
    if (Number.isFinite(c.peak_build_gib) && c.peak_build_gib > 0) {
      const gib = Math.max(FLOOR_GIB, c.peak_build_gib * CALIBRATION_MARGIN);
      return { gib, source: `calibrated from ${c.peak_build_gib.toFixed(2)} GiB observed on ${c.observed_at}` };
    }
  } catch { /* not calibrated yet */ }
  return { gib: FLOOR_GIB, source: 'floor (bounded by observed failure <2.3 GiB and success at 13 GiB; not yet calibrated)' };
}

/** Record what a completed build actually consumed, so the floor stops guessing. */
export function recordBuildConsumption({ beforeGiB, afterGiB, sha }) {
  const used = Math.max(0, beforeGiB - afterGiB);
  mkdirSync(storeRoot(), { recursive: true });
  let prev = {};
  try { prev = JSON.parse(readFileSync(calibrationFile(), 'utf8')); } catch { /* first run */ }
  const peak = Math.max(used, prev.peak_build_gib ?? 0);
  const next = {
    schema: 'banzami-build-capacity/v1',
    peak_build_gib: peak,
    last_build_gib: used,
    observed_at: new Date().toISOString(),
    last_sha: sha ?? null,
    note: 'peak is the largest observed consumption of a full release package build',
  };
  writeFileSync(calibrationFile(), JSON.stringify(next, null, 2) + '\n');
  return next;
}

/** Is the Docker daemon actually answering? A hung daemon fails a build slowly. */
function dockerResponsive(timeoutMs = 20_000) {
  const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'],
                      { encoding: 'utf8', timeout: timeoutMs });
  if (r.error || r.status !== 0) return { ok: false, detail: r.error?.code === 'ETIMEDOUT' ? 'no response' : 'not available' };
  return { ok: true, detail: r.stdout.trim() };
}

/**
 * Regenerable consumers, largest first. Classification only — nothing is
 * deleted here. Anything not on this list is NOT a cleanup candidate, which is
 * the half that matters: provenance manifests, receipts, secrets and runtime
 * state must never appear.
 */
export function regenerableConsumers() {
  const T = process.env.TMPDIR || tmpdir();
  const candidates = [
    { path: join(T, 'banzami-blueprint-release'), what: 'release package build products (regenerable from git)' },
    { path: join(T, 'banzami-source-deploy'),     what: 'source bundles — .tar.gz only; manifests and receipts are PROVENANCE and must be kept' },
    { path: join(T, 'banzami-blueprint-runner-lab'), what: 'runner lab scratch' },
  ];
  return candidates.filter((c) => existsSync(c.path)).map((c) => {
    let gib = 0;
    try {
      const out = execFileSync('du', ['-sk', c.path], { encoding: 'utf8' });
      gib = parseInt(out.split('\t')[0], 10) / 1024 ** 2;
    } catch { /* unreadable is not a candidate */ }
    return { ...c, gib };
  }).sort((a, b) => b.gib - a.gib);
}

/** Paths a cleanup must never touch, whatever the pressure. */
export const PROTECTED = [
  '*/banzami-source-deploy/*.manifest.json',
  '*/banzami-source-deploy/*.receipt.txt',
  '<assurance store>/**',
  '/run/secrets/**',
  'any database, runtime state, or currently-deployed image',
];

export function preflight({ requireGib } = {}) {
  const free = freeGiB();
  const req = requireGib ? { gib: requireGib, source: 'explicit' } : requiredGiB();
  const docker = dockerResponsive();
  const consumers = regenerableConsumers();
  const reclaimable = consumers.reduce((n, c) => n + c.gib, 0);

  const checks = [
    { name: 'free capacity', ok: free >= req.gib,
      detail: `${free.toFixed(1)} GiB free, ${req.gib.toFixed(1)} GiB required — ${req.source}` },
    { name: 'docker daemon', ok: docker.ok, detail: docker.detail },
  ];
  return { free_gib: free, required_gib: req.gib, requirement_source: req.source,
           reclaimable_gib: reclaimable, consumers, checks,
           verdict: checks.every((c) => c.ok) ? 'PASS' : 'FAIL' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--require-gib');
  const r = preflight({ requireGib: i > -1 ? Number(process.argv[i + 1]) : undefined });
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(r.verdict === 'PASS' ? 0 : 1); }

  console.log('\n▸ release preflight');
  for (const c of r.checks) console.log(`  ${c.ok ? '\x1b[0;32m✓\x1b[0m' : '\x1b[0;31m✗\x1b[0m'} ${c.name.padEnd(18)} ${c.detail}`);
  if (r.verdict !== 'PASS' && r.consumers.length) {
    console.log('\n  regenerable consumers, largest first:');
    for (const c of r.consumers) console.log(`    ${c.gib.toFixed(2).padStart(7)} GiB  ${c.path}\n              ${c.what}`);
    console.log(`\n  reclaimable without touching provenance: ${r.reclaimable_gib.toFixed(1)} GiB`);
    console.log('  never delete: ' + PROTECTED.join(' · '));
  }
  console.log(`\n  ${r.verdict === 'PASS' ? '\x1b[0;32mPASS\x1b[0m' : '\x1b[0;31mFAIL — do not start the build\x1b[0m'}\n`);
  process.exit(r.verdict === 'PASS' ? 0 : 1);
}
