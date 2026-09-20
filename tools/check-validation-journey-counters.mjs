#!/usr/bin/env node
/**
 * check-validation-journey-counters — a CONTROL row must not move a JOURNEY
 * counter.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase A1).
 *
 * BZV-20260920-0001 printed `17 passed / 2 failed / 20 not reached` for a
 * universe of 38 journeys. The three numbers summed to 39 because the outcome
 * counters selected from validation_run_journeys without scoping to
 * record_kind, so the CONTROL row — which by construction never executes and
 * is therefore always NOT_REACHED — was counted as a journey that was not
 * reached. The two structural counters in the SAME select already filtered by
 * kind, so the query disagreed with itself.
 *
 * The property is not "the runner prints the right string". It is: inserting a
 * CONTROL row changes the CONTROL block and nothing else. That is checkable
 * without running anything, by materialising both shapes in a transaction and
 * rolling it back.
 *
 * The control arm matters as much as the test: the OLD counter shape is run
 * against the same rows and MUST move, or this file is asserting nothing.
 *
 *   node tools/check-validation-journey-counters.mjs
 */
import { execFileSync } from 'node:child_process';

const HOST = process.env.BANZAMI_SANDBOX_HOST || 'root@217.160.9.248';
const PG = process.env.BANZAMI_SANDBOX_PG || 'bzsandbox-20260708184104-1708617-23807-postgres-1';
const SEP = '\t';

function sql(statement) {
  const b64 = Buffer.from(statement, 'utf8').toString('base64');
  const remote = `echo ${b64} | base64 -d | docker exec -i ${PG} sh -lc ` +
    `'PGPASSWORD=$(cat "$POSTGRES_PASSWORD_FILE") psql -U "$POSTGRES_USER" -d banzami_staging -Atq -F"${SEP}" -v ON_ERROR_STOP=1'`;
  return execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, remote], { encoding: 'utf8', maxBuffer: 1 << 24 })
    .split('\n').filter(Boolean).map((l) => l.split(SEP));
}

let failures = 0;
const check = (t, ok, d = '') => {
  if (ok) return console.log(`  ✓ ${t}${d ? `  ${d}` : ''}`);
  console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`);
  failures++;
};

console.log('\njourney counters — a CONTROL row must not move a JOURNEY counter\n');

const REF = 'BZV-COUNTER-PROBE';

/**
 * Both counter shapes over the same rows.
 *
 * `scoped` is what the runner now does. `unscoped` is what it did — kept here
 * deliberately, because a mutation proof whose control cannot fail proves only
 * that the file runs.
 */
const counters = (alias) => `
  (SELECT count(*) FROM validation_run_journeys j
    WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY' AND j.outcome = 'PASSED'),
  (SELECT count(*) FROM validation_run_journeys j
    WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY' AND j.outcome = 'FAILED'),
  (SELECT count(*) FROM validation_run_journeys j
    WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY' AND j.outcome = 'NOT_REACHED'),
  (SELECT count(*) FROM validation_run_journeys j
    WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY'),
  (SELECT count(*) FROM validation_run_journeys j
    WHERE j.run_id = r.id AND j.record_kind = 'CONTROL'),
  (SELECT count(*) FROM validation_run_journeys j WHERE j.run_id = r.id),
  -- the OLD shape, unscoped: the control arm
  (SELECT count(*) FROM validation_run_journeys j
    WHERE j.run_id = r.id AND j.outcome = 'NOT_REACHED')
  FROM validation_runs r WHERE r.run_ref = '${REF}'${alias}`;

// Two readings of the same probe run: before the CONTROL row exists, and after.
const out = sql(`
BEGIN;
INSERT INTO validation_runs (run_ref, environment, profile_id, profile_version, profile_digest, state, requested_by)
-- requested_by is FK'd to admin_users: borrow a real operator rather than
-- inventing one, so the probe exercises the same shape a real run does.
VALUES ('${REF}', 'SANDBOX', 'FULL', 1, repeat('c', 64), 'QUEUED',
        (SELECT requested_by FROM validation_runs WHERE requested_by IS NOT NULL LIMIT 1));

INSERT INTO validation_run_journeys (run_id, journey_id, suite_id, outcome, record_kind)
SELECT r.id, x.j, 'S01', x.o, 'JOURNEY'
  FROM validation_runs r,
       (VALUES ('J-1','PASSED'), ('J-2','PASSED'), ('J-3','FAILED'), ('J-4','NOT_REACHED')) AS x(j,o)
 WHERE r.run_ref = '${REF}';

SELECT 'BEFORE', ${counters(';')}

INSERT INTO validation_run_journeys
       (run_id, journey_id, suite_id, outcome, record_kind, control_classification, control_reason)
SELECT r.id, 'S20-NOT-PROVEN', 'S20', 'NOT_REACHED', 'CONTROL', 'NOT_PROVEN', 'ARCHITECTURAL'
  FROM validation_runs r WHERE r.run_ref = '${REF}';

SELECT 'AFTER', ${counters(';')}
ROLLBACK;
`);

const rows = Object.fromEntries(out.filter((r) => r[0] === 'BEFORE' || r[0] === 'AFTER')
  .map((r) => [r[0], r.slice(1).map(Number)]));

const [bPass, bFail, bNR, bJ, bC, bTot, bOld] = rows.BEFORE ?? [];
const [aPass, aFail, aNR, aJ, aC, aTot, aOld] = rows.AFTER ?? [];

check('probe materialised', Array.isArray(rows.BEFORE) && Array.isArray(rows.AFTER),
  `got ${JSON.stringify(rows)}`);

// The journey block is untouched by the control row.
check('JOURNEY passed unchanged',      bPass === aPass, `${bPass} → ${aPass}`);
check('JOURNEY failed unchanged',      bFail === aFail, `${bFail} → ${aFail}`);
check('JOURNEY not_reached unchanged', bNR === aNR, `${bNR} → ${aNR}`);
check('JOURNEY total unchanged',       bJ === aJ && aJ === 4, `${bJ} → ${aJ}`);

// The control row is visible where it belongs, and in the materialised total.
check('CONTROL total moved 0 → 1', bC === 0 && aC === 1, `${bC} → ${aC}`);
check('RECORDS total moved 4 → 5', bTot === 4 && aTot === 5, `${bTot} → ${aTot}`);

// The blocks reconcile: nothing is counted twice and nothing is lost.
check('JOURNEY + CONTROL = RECORDS', aJ + aC === aTot, `${aJ} + ${aC} = ${aTot}`);

// THE CONTROL ARM. The old unscoped counter must move, or nothing above is a
// proof — it would pass just as happily against a shape that was never broken.
check('control arm: the OLD unscoped counter DOES move (detector works)',
  bOld === 1 && aOld === 2,
  `unscoped not_reached ${bOld} → ${aOld}; if this did not move, the scoped ` +
  'assertions above are vacuous');

// The historical run is evidence and is read, never rewritten.
const [[histJ, histC, histNR]] = sql(`
  SELECT (SELECT count(*) FROM validation_run_journeys j
           WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY'),
         (SELECT count(*) FROM validation_run_journeys j
           WHERE j.run_id = r.id AND j.record_kind = 'CONTROL'),
         (SELECT count(*) FROM validation_run_journeys j
           WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY' AND j.outcome = 'NOT_REACHED')
    FROM validation_runs r WHERE r.run_ref = 'BZV-20260920-0001';`);
check('BZV-20260920-0001 reads 38 JOURNEY · 1 CONTROL · 19 journey NOT_REACHED',
  Number(histJ) === 38 && Number(histC) === 1 && Number(histNR) === 19,
  `${histJ} JOURNEY · ${histC} CONTROL · ${histNR} not reached`);

const [[leaked]] = sql(`SELECT count(*) FROM validation_runs WHERE run_ref = '${REF}';`);
check('probe rolled back — no row survives', Number(leaked) === 0, `${leaked} row(s) left`);

console.log(failures === 0
  ? '\nVALIDATION_JOURNEY_COUNTERS: PASS\n'
  : `\nVALIDATION_JOURNEY_COUNTERS: FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
