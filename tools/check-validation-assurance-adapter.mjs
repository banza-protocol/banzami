#!/usr/bin/env node
/**
 * check-validation-assurance-adapter — VD-008 held shut.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * The assurance-json adapter was registered EXECUTABLE on fixtures alone. That
 * is exactly how phase0-stdout looked finished while the runner could not start
 * a phase-0 harness at all: no fixture discovers a missing staged dependency,
 * because a fixture is written by the same person who writes the reader.
 *
 * So the pinned report below is REAL. It was produced on 2026-09-19 by
 * tools/e2e/docs/quickstart-e2e.mjs, executed through the runner's own
 * runHarness() with the S19-DOC-001 registry arguments, against the deployed
 * Sandbox: twelve steps PASS, residue 0, @banzami/sdk 0.14.1 taken from the
 * public npm registry into an empty directory.
 *
 * Everything below drives the SHIPPING adapter over that report. The negative
 * cases are mutations OF IT rather than hand-written fixtures — the real run
 * took only the all-PASS path, and a branch no run exercised still has to be
 * proven against the shape a run actually produces.
 *
 *   node tools/check-validation-assurance-adapter.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = join(repo, 'evidence/assurance/docs-quickstart/vd008-real-report-20260921.json');
const HARNESS = join(repo, 'tools/e2e/docs/quickstart-e2e.mjs');

/** The harness that produced the pinned report. Pinned, so a rewrite of the
 *  harness cannot quietly inherit evidence produced by a different one. */
const HARNESS_SHA = 'cb172f67e5b3382305209688e2578acaf838a81c9646d5fc7163a05b37e671c4';

let failures = 0;
const check = (title, ok, detail = '') => {
  if (ok) return console.log(`  ✓ ${title}`);
  console.log(`  ✗ ${title}${detail ? `\n      ${detail}` : ''}`);
  failures++;
};

console.log('\nassurance-json adapter — VD-008, against a real report\n');

const real = JSON.parse(readFileSync(REPORT, 'utf8'));

/* ── the report is real, and still belongs to the harness that made it ────── */

check('the pinned report is the shape a run produces',
  Array.isArray(real.steps) && real.steps.length === 12 && !!real.ran_at && !!real.summary);
check('it records the SDK it took from the public registry',
  real.sdk?.name === '@banzami/sdk' && /^\d+\.\d+\.\d+$/.test(real.sdk?.version ?? ''),
  'a report with no provenance is a fixture with a timestamp');
check('the harness that produced it is unchanged',
  createHash('sha256').update(readFileSync(HARNESS)).digest('hex') === HARNESS_SHA,
  'edit the harness and this evidence is about a different program — re-run it and re-pin');

/* ── no credential reached the evidence ──────────────────────────────────────
 * Step 5 reveals a secret key. The report names the step and the prefix and
 * carries neither the value nor anything else bearer-shaped; the only long
 * literals in it are resource UUIDs. */
const raw = readFileSync(REPORT, 'utf8');
const longLiterals = (raw.match(/[A-Za-z0-9_-]{24,}/g) ?? [])
  .filter((s) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s));
check('no credential-shaped literal survived into the evidence', longLiterals.length === 0,
  longLiterals.slice(0, 3).join(', '));
check('no secret key value', !/bz_(test|live)_sk_[A-Za-z0-9]/.test(raw),
  'naming the prefix is documentation; carrying the value is a leak');
check('no bearer token', !/Bearer\s+[A-Za-z0-9._-]{12,}/.test(raw));

/* ── drive the SHIPPING adapter over it ──────────────────────────────────── */

const { harvestAssuranceJSON } = await import('./validation-runner.mjs');

/** Put a report where the adapter looks, and read it with the adapter. */
function harvest(json, { stem = 'docs-quickstart', lookFor = null, raw: rawText = null } = {}) {
  const box = mkdtempSync(join(tmpdir(), 'vd008-'));
  const dir = join(box, 'banzami-assurance', 'x');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${stem}-complete-${Date.now()}.json`);
  writeFileSync(file, rawText ?? JSON.stringify(json));
  const now = Date.now() / 1000;
  utimesSync(file, now, now);
  const prev = process.env.TMPDIR;
  process.env.TMPDIR = box;
  try { return harvestAssuranceJSON(lookFor ?? stem, Date.now() - 1000); }
  finally { process.env.TMPDIR = prev; rmSync(box, { recursive: true, force: true }); }
}

const gates = harvest(real);
const passes = gates.filter((g) => g.verdict === 'PASS');
check('the adapter reads the real report', gates.length === 12, `${gates.length} gate(s)`);
check('all twelve steps read as PASS', passes.length === 12);
check('it did not manufacture a reconciliation failure',
  !gates.some((g) => g.gate === 'ADAPTER_RECONCILED'));
check('every gate carries the report it came from',
  gates.every((g) => g.sha256 && g.file), 'evidence with no source is an assertion about nothing');
check('the gate names are the step names, not indices',
  gates[0].gate === real.steps[0].name);

/* ── the branches the real run did not take ──────────────────────────────── */

const withStep = (n, patch) => {
  const copy = JSON.parse(JSON.stringify(real));
  Object.assign(copy.steps[n], patch);
  return copy;
};

for (const verdict of ['PENDING', 'NOT_RUN', 'FAIL', 'SKIPPED', '']) {
  const g = harvest(withStep(3, { verdict }));
  const step4 = g.find((x) => x.gate === real.steps[3].name);
  check(`a step reported ${verdict || '(empty)'} is not a pass`, step4?.verdict === 'FAIL',
    `read ${step4?.verdict}`);
  check(`…and the count no longer reconciles with the harness's own total`,
    g.some((x) => x.gate === 'ADAPTER_RECONCILED' && x.verdict === 'FAIL'),
    'the harness still claims 12 passed; reading 11 and staying silent is the defect');
}

/* ── malformed input must yield nothing, never a confident subset ─────────── */

check('a report with no steps[] or matrix[] yields no gates',
  harvest({ ...real, steps: undefined }).length === 0);
check('a truncated report yields no gates',
  harvest(null, { raw: '{"steps": [' }).length === 0);
check('an empty file yields no gates', harvest(null, { raw: '' }).length === 0);
check('a report filed under another harness is not harvested',
  harvest(real, { stem: 'docs-quickstart', lookFor: 'some-other-suite' }).length === 0,
  'the stem is how a renamed reporter fails loudly instead of inheriting a neighbour\'s evidence');

/* ── and the thing all of that exists to protect ──────────────────────────── */

// steps: [] is a well-formed report claiming twelve passes and listing none.
// The adapter does better than returning nothing: it returns the mismatch.
const emptied = harvest({ ...real, steps: [] });
check('a report that lists no steps yields no passes',
  emptied.filter((g) => g.verdict === 'PASS').length === 0);
check('…and says the harness total disagrees rather than staying silent',
  emptied.some((g) => g.gate === 'ADAPTER_RECONCILED' && g.verdict === 'FAIL'),
  'silence here would be a journey passing on an empty assertion set');
check('an inflated harness total is caught',
  harvest({ ...real, summary: { ...real.summary, passed: 13 } })
    .some((g) => g.gate === 'ADAPTER_RECONCILED' && g.verdict === 'FAIL'));

console.log(failures === 0
  ? `\n✓ VALIDATION_ASSURANCE_ADAPTER=PASS\n`
  : `\n✗ VALIDATION_ASSURANCE_ADAPTER=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
