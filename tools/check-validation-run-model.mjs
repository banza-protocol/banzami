#!/usr/bin/env node
/**
 * check-validation-run-model — the Validation Run state machine, proven.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001 Phase C.2/C.11).
 *
 * A state machine that is only described in a document is a description. This
 * applies db/migrations/0160_validation_runs.sql to a disposable database and
 * then TRIES TO BREAK IT — each attempt must be refused, and refused for the
 * stated reason, not merely refused.
 *
 * It is a mutation proof in the repository's sense: the guard is shown failing
 * for the right reason, so a future edit that silently removes a constraint
 * fails here instead of surfacing during a real run.
 *
 *   node tools/check-validation-run-model.mjs
 *
 * Requires a local PostgreSQL the current user can createdb on. The database is
 * created, used and dropped; nothing touches Sandbox or Live.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.VALIDATION_MODEL_DB || 'vs_run_model_check';
const MIGRATION = join(repo, 'db/migrations/0160_validation_runs.sql');

const psql = (sql, { expectFail = false } = {}) => {
  try {
    const out = execFileSync('psql', ['-d', DB, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (expectFail) return { ok: true, refused: false, out: out.trim() };
    return { ok: true, refused: false, out: out.trim() };
  } catch (e) {
    const msg = ((e.stderr || '') + (e.stdout || '')).trim();
    return { ok: false, refused: true, out: msg };
  }
};

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

// ── set up ────────────────────────────────────────────────────────────────────
try { sh('dropdb', ['--if-exists', DB]); } catch { /* fine */ }
try {
  sh('createdb', [DB]);
} catch (e) {
  console.error('could not create the disposable database:', String(e.stderr || e.message).trim());
  console.error('a local PostgreSQL the current user can createdb on is required.');
  process.exit(2);
}

let failures = 0;
const RUN = (ref, extra = '') =>
  `INSERT INTO validation_runs (run_ref, profile_id, profile_version, profile_digest${extra ? ', ' + extra.split('=')[0] : ''}) ` +
  `VALUES ('${ref}','GOLDEN',1,repeat('a',64)${extra ? ", '" + extra.split('=')[1] + "'" : ''});`;

/** The guard must refuse, and the refusal must SAY the right thing. */
const mustRefuse = (title, sql, expectedFragment) => {
  const r = psql(sql);
  if (!r.refused) {
    console.log(`  ✗ ${title}\n      ACCEPTED — the invariant is not enforced`);
    failures++;
    return;
  }
  if (!r.out.toLowerCase().includes(expectedFragment.toLowerCase())) {
    console.log(`  ✗ ${title}\n      refused, but for the wrong reason:\n      ${r.out.split('\n')[0]}`);
    failures++;
    return;
  }
  console.log(`  ✓ ${title}`);
};

const mustAccept = (title, sql) => {
  const r = psql(sql);
  if (r.refused) {
    console.log(`  ✗ ${title}\n      REFUSED a legal operation:\n      ${r.out.split('\n')[0]}`);
    failures++;
    return;
  }
  console.log(`  ✓ ${title}`);
};

console.log('\nBanzami Validation Studio — Validation Run model\n');

psql('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
psql('CREATE TABLE admin_users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT);');

const migration = readFileSync(MIGRATION, 'utf8');
try {
  execFileSync('psql', ['-q', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-f', MIGRATION],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  console.log('  ✓ 0160 applies cleanly');
} catch (e) {
  console.log('  ✗ 0160 failed to apply:\n', String(e.stderr || '').trim());
  process.exit(1);
}
void migration;

console.log('\n  the environment');
mustRefuse('a Validation Run against LIVE cannot be represented',
  `INSERT INTO validation_runs (run_ref, environment, profile_id, profile_version, profile_digest)
   VALUES ('BZV-CHK-LIVE','LIVE','GOLDEN',1,repeat('a',64));`,
  'validation_runs_environment_check');

console.log('\n  the state machine');
mustAccept('a run is born PREPARING', RUN('BZV-CHK-0001'));
mustRefuse('PREPARING cannot jump straight to RUNNING',
  `UPDATE validation_runs SET state='RUNNING' WHERE run_ref='BZV-CHK-0001';`,
  'illegal validation run transition: PREPARING -> RUNNING');
mustAccept('PREPARING -> PREFLIGHT_RUNNING is legal',
  `UPDATE validation_runs SET state='PREFLIGHT_RUNNING' WHERE run_ref='BZV-CHK-0001';`);
mustAccept('an UNHEALTHY preflight lands in BLOCKED, not READY',
  `UPDATE validation_runs SET state='BLOCKED' WHERE run_ref='BZV-CHK-0001';`);
mustRefuse('BLOCKED cannot be queued without preflighting again',
  `UPDATE validation_runs SET state='QUEUED' WHERE run_ref='BZV-CHK-0001';`,
  'illegal validation run transition: BLOCKED -> QUEUED');
mustAccept('a run can always be cancelled',
  `UPDATE validation_runs SET state='CANCELLED', ended_at=now() WHERE run_ref='BZV-CHK-0001';`);
mustRefuse('a terminal state is terminal',
  `UPDATE validation_runs SET state='PREPARING', ended_at=NULL WHERE run_ref='BZV-CHK-0001';`,
  'illegal validation run transition: CANCELLED -> PREPARING');

console.log('\n  one run at a time');
mustAccept('a second run reaches QUEUED',
  RUN('BZV-CHK-0002') +
  `UPDATE validation_runs SET state='PREFLIGHT_RUNNING' WHERE run_ref='BZV-CHK-0002';
   UPDATE validation_runs SET state='READY' WHERE run_ref='BZV-CHK-0002';
   UPDATE validation_runs SET state='QUEUED' WHERE run_ref='BZV-CHK-0002';`);
mustRefuse('a third run cannot hold the Sandbox at the same time',
  `INSERT INTO validation_runs (run_ref, state, profile_id, profile_version, profile_digest)
   VALUES ('BZV-CHK-0003','QUEUED','GOLDEN',1,repeat('a',64));`,
  'validation_runs_one_active');

console.log('\n  the verdict');
mustAccept('QUEUED -> RUNNING',
  `UPDATE validation_runs SET state='RUNNING', started_at=now() WHERE run_ref='BZV-CHK-0002';`);
mustRefuse('a COMPLETED run without a verdict is not a completed run',
  `UPDATE validation_runs SET state='COMPLETED', ended_at=now() WHERE run_ref='BZV-CHK-0002';`,
  'validation_runs_verdict_iff_completed');
mustAccept('COMPLETED with a verdict is accepted',
  `UPDATE validation_runs SET state='COMPLETED', verdict='PASS', ended_at=now() WHERE run_ref='BZV-CHK-0002';`);

console.log('\n  the history');
psql(`INSERT INTO validation_run_events (run_id, seq, from_state, to_state, reason)
      SELECT id, 1, 'QUEUED', 'RUNNING', 'executor claimed the lease'
      FROM validation_runs WHERE run_ref='BZV-CHK-0002';`);
mustRefuse('a recorded transition cannot be rewritten',
  `UPDATE validation_run_events SET reason='something else' WHERE seq=1;`,
  'append-only');
mustRefuse('a recorded transition cannot be deleted',
  `DELETE FROM validation_run_events WHERE seq=1;`,
  'append-only');

// A Validation Run is evidence. Since a transition is recorded the moment a run
// is prepared, and events refuse deletion AND do not cascade, the run itself
// cannot be removed — not by the Studio, not from a psql prompt.
mustRefuse('a Validation Run cannot be deleted',
  `DELETE FROM validation_runs WHERE run_ref='BZV-CHK-0002';`,
  'validation_run_events_run_id_fkey');

console.log('\n  the idempotent start');
mustAccept('a run may carry an idempotency key',
  `INSERT INTO validation_runs (run_ref, profile_id, profile_version, profile_digest, idempotency_key)
   VALUES ('BZV-CHK-0005','GOLDEN',1,repeat('a',64),'owner-key');`);
mustRefuse('the same key cannot produce a second run',
  `INSERT INTO validation_runs (run_ref, profile_id, profile_version, profile_digest, idempotency_key)
   VALUES ('BZV-CHK-0006','GOLDEN',1,repeat('a',64),'owner-key');`,
  'validation_runs_idempotency');

console.log('\n  the evidence vocabulary');
mustRefuse('a journey outcome outside the vocabulary is refused',
  `INSERT INTO validation_run_journeys (run_id, journey_id, suite_id, outcome)
   SELECT id, 'J-1', 'S01', 'PROBABLY_FINE' FROM validation_runs WHERE run_ref='BZV-CHK-0002';`,
  'validation_run_journeys_outcome_check');
mustAccept('PLANNED, UNAVAILABLE and SKIPPED are all first-class outcomes',
  `INSERT INTO validation_run_journeys (run_id, journey_id, suite_id, outcome)
   SELECT id, x.j, 'S01', x.o FROM validation_runs,
     (VALUES ('J-1','PLANNED'),('J-2','UNAVAILABLE'),('J-3','SKIPPED')) AS x(j,o)
   WHERE run_ref='BZV-CHK-0002';`);

try { sh('dropdb', ['--if-exists', DB]); } catch { /* fine */ }

console.log('');
if (failures > 0) {
  console.log(`✗ VALIDATION_RUN_MODEL_ENFORCED=FAIL (${failures} invariant(s) not enforced)\n`);
  process.exit(1);
}
console.log('✓ VALIDATION_RUN_MODEL_ENFORCED=PASS');
console.log('✓ VALIDATION_RUN_LIVE_REPRESENTABLE=0\n');
