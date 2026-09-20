#!/usr/bin/env node
/**
 * check-validation-materialization — the FULL plan, materialised against the
 * real schema and then rolled back.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * The counts and the vocabulary are properties of the DATABASE, not of the
 * planner's intentions: a CHECK constraint refuses what the executor would
 * happily have written, and only the database can say so. But proving that by
 * starting a FULL run would cost an owner ceremony, thirteen minutes and real
 * Sandbox resources — and would leave a run in the history whose only purpose
 * was to count rows.
 *
 * So the whole plan is inserted inside a transaction that is ROLLED BACK. The
 * constraints fire, the counts are read from real rows, and the history is
 * untouched.
 *
 *   node tools/check-validation-materialization.mjs
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
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
const check = (t, ok, d = '') => { if (ok) return console.log(`  ✓ ${t}`); console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`); failures++; };
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

console.log('\nmaterialization — proven against the schema, rolled back\n');

const { planFor } = await import('./validation-runner.mjs');
const { plan } = planFor('FULL');

// One transaction: a throwaway run, the whole plan, the reads, then ROLLBACK.
const rows = plan.map((p) => `(${lit(p.journey)}, ${lit(p.suite)}, 'PLANNED', ${lit(p.kind)}, ` +
  `${p.controlClassification ? lit(p.controlClassification) : 'NULL'}, ` +
  `${p.controlReason ? lit(p.controlReason) : 'NULL'})`).join(',\n         ');

const out = sql(`
BEGIN;
INSERT INTO validation_runs (run_ref, environment, profile_id, profile_version, profile_digest, state)
VALUES ('BZV-MATERIALIZATION-PROBE', 'SANDBOX', 'FULL', 1, repeat('0', 64), 'PREPARING');

INSERT INTO validation_run_journeys
  (run_id, journey_id, suite_id, outcome, record_kind, control_classification, control_reason)
SELECT r.id, v.*
  FROM validation_runs r,
       (VALUES
         ${rows}
       ) AS v(journey_id, suite_id, outcome, record_kind, control_classification, control_reason)
 WHERE r.run_ref = 'BZV-MATERIALIZATION-PROBE';

SELECT 'counts',
       count(*) FILTER (WHERE record_kind='JOURNEY'),
       count(*) FILTER (WHERE record_kind='CONTROL'),
       count(*),
       count(*) FILTER (WHERE record_kind IS NULL)
  FROM validation_run_journeys j
 WHERE j.run_id = (SELECT id FROM validation_runs WHERE run_ref='BZV-MATERIALIZATION-PROBE');

SELECT 'control', journey_id, suite_id, control_classification, control_reason
  FROM validation_run_journeys
 WHERE run_id = (SELECT id FROM validation_runs WHERE run_ref='BZV-MATERIALIZATION-PROBE')
   AND record_kind='CONTROL';
ROLLBACK;
`);

const counts = out.find((r) => r[0] === 'counts');
const control = out.find((r) => r[0] === 'control');

check('§9. materialises 38 JOURNEY rows', counts && Number(counts[1]) === 38, `got ${counts?.[1]}`);
check('§9. materialises 1 CONTROL row', counts && Number(counts[2]) === 1, `got ${counts?.[2]}`);
check('§9. 39 records in total', counts && Number(counts[3]) === 39, `got ${counts?.[3]}`);
check('§9. and nothing untyped', counts && Number(counts[4]) === 0, `${counts?.[4]} rows with no record_kind`);
check('§9. the CONTROL is S20, classified and reasoned',
  control && control[2] === 'S20' && control[3] === 'NOT_PROVEN' && control[4] === 'ARCHITECTURAL',
  control ? control.slice(1).join(' · ') : 'no control row');

// The probe must leave nothing behind.
const left = sql(`SELECT count(*) FROM validation_runs WHERE run_ref='BZV-MATERIALIZATION-PROBE';`);
check('§9. the probe rolled back and left no run', Number(left[0][0]) === 0, `${left[0][0]} row(s) remain`);

/* ── §10 + §11 · the vocabulary, enforced by the database ────────────────── */

const refused = (label, stmt) => {
  try {
    sql(`BEGIN;
      WITH r AS (INSERT INTO validation_runs (run_ref, environment, profile_id, profile_version, profile_digest, state)
        VALUES ('BZV-VOCAB-PROBE', 'SANDBOX', 'FULL', 1, repeat('0',64), 'PREPARING') RETURNING id)
      INSERT INTO validation_run_journeys (run_id, journey_id, suite_id, outcome, record_kind, control_classification, control_reason)
      SELECT r.id, ${stmt} FROM r;
      ROLLBACK;`);
    return false;
  } catch { return true; }
};

check('§10. NOT_REACHED is a legal outcome',
  !refused('not_reached', `'J1','S01','NOT_REACHED','JOURNEY',NULL,NULL`));
check('§10. UNAVAILABLE is a legal outcome',
  !refused('unavailable', `'J1','S01','UNAVAILABLE','JOURNEY',NULL,NULL`));
check('§10. SKIPPED is a legal outcome',
  !refused('skipped', `'J1','S01','SKIPPED','JOURNEY',NULL,NULL`));
check('§10. a made-up outcome is refused',
  refused('nonsense', `'J1','S01','NOT_RUN','JOURNEY',NULL,NULL`),
  'synonyms are how a vocabulary stops meaning anything');
check('§12. a CONTROL record cannot be recorded as PASSED',
  refused('control passed', `'S20-NOT-PROVEN','S20','PASSED','CONTROL','NOT_PROVEN','ARCHITECTURAL'`),
  'a control record is not executable, so it can never have executed');
check('§12. a CONTROL record without its classification is refused',
  refused('bare control', `'S20-NOT-PROVEN','S20','PLANNED','CONTROL',NULL,NULL`));
check('§12. a JOURNEY record carrying a control reason is refused',
  refused('journey with reason', `'J1','S01','PLANNED','JOURNEY','NOT_PROVEN','ARCHITECTURAL'`));

/* ── §13 · history stays legacy ──────────────────────────────────────────── */

const legacy = sql(`SELECT r.run_ref, count(*), count(j.record_kind)
   FROM validation_runs r JOIN validation_run_journeys j ON j.run_id=r.id
  WHERE r.run_ref IN ('BZV-20260919-0001','BZV-20260919-0003') GROUP BY 1 ORDER BY 1;`);
for (const [ref, total, typed] of legacy) {
  check(`§13. ${ref} keeps all ${total} rows LEGACY`, Number(typed) === 0,
    `${typed} of ${total} were typed — backfilling would be the inference 0162 abolished`);
}

console.log(failures === 0
  ? `\n✓ VALIDATION_MATERIALIZATION=PASS\n`
  : `\n✗ VALIDATION_MATERIALIZATION=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
