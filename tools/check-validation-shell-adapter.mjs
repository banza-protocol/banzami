#!/usr/bin/env node
/**
 * check-validation-shell-adapter — the shell path, exercised against REAL
 * harnesses, at zero cost.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * The phase0-stdout adapter was proven against fixtures, which is how it looked
 * finished while the runner could not actually start a phase-0 harness at all:
 * some of them copy themselves to the host and need tools/ops/lib/remote.sh
 * beside them, and the runner staged only two files. Fixtures cannot find that.
 *
 * So this runs the real thing — but only the READ-ONLY harnesses. Both issue no
 * POST, PUT or DELETE, open no synthetic tenant and move no money, so this can
 * run as often as anyone likes without touching the application-submit window
 * or the merchant-credit budget.
 *
 * What it proves end to end: staging from this working tree, remote execution,
 * exit status, per-assertion parsing, reconciliation against the harness's own
 * totals, sha256 pinning to the file that actually ran, and that nothing
 * secret-shaped survives capture.
 *
 *   node tools/check-validation-shell-adapter.mjs
 */
const { runShellHarness } = await import('./validation-runner.mjs');

/** Read-only, and that is why they are here. Adding a mutating harness to this
 *  list would turn a free guard into a run that spends Sandbox resources. */
const READ_ONLY = [
  { harness: 'tests/phase0/banzadmin-authority-e2e.sh', min: 13 },
  { harness: 'tests/phase0/doa-canonical-binding.sh',   min: 4 },
];

let failures = 0;
const check = (title, ok, detail = '') => {
  if (ok) return console.log(`  ✓ ${title}`);
  console.log(`  ✗ ${title}${detail ? `\n      ${detail}` : ''}`);
  failures++;
};

console.log('\nshell adapter — real harnesses, read-only\n');

for (const { harness, min } of READ_ONLY) {
  const name = harness.split('/').pop();
  const r = runShellHarness(harness, 6 * 60 * 1000, 'ADAPTER-GATE');

  check(`${name} runs and passes`, r.ok, r.reason || '(no reason given)');
  check(`${name} yields at least ${min} assertions`, r.gates.length >= min,
    `got ${r.gates.length}`);
  check(`${name} reconciles with the harness's own totals`,
    !/counted|blocked|not fully understood/.test(r.reason ?? ''), r.reason);
  check(`${name} pins every assertion to the file that ran`,
    r.gates.length > 0 && r.gates.every((g) => /^[0-9a-f]{64}$/.test(String(g.sha256))));
  check(`${name} captured its output`, (r.stdout ?? '').length > 0);
  check(`${name} leaks nothing secret-shaped`,
    !/bz_(test|live)_sk_|Bearer\s+[A-Za-z0-9._-]{8,}|eyJ[A-Za-z0-9_-]{10,}\./.test(r.stdout ?? ''));
}

// A path that is not an allow-listed harness must be refused before anything runs.
const bad = runShellHarness('tests/phase0/../../etc/passwd', 5000, 'ADAPTER-GATE');
check('an unlisted path is refused, not executed', !bad.ok && /allow-listed/.test(bad.reason));

console.log(failures === 0
  ? '\n✓ VALIDATION_SHELL_ADAPTER=PASS\n'
  : `\n✗ VALIDATION_SHELL_ADAPTER=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
