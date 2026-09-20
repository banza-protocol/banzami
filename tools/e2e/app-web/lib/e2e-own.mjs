/**
 * Fixture ownership and guaranteed cleanup for the app-web harnesses.
 *
 * This is the node port of tests/phase0/lib/e2e-run.sh, which has had the
 * contract right since 2026-09-11 while these proofs did not. Two of them
 * leaked a UI-registered consumer on every execution — proof 14 twice, and
 * lib/deeplink-pay.mjs once, behind a helper where neither the proof nor any
 * guard could see it. Each registration carries a 1 000 000 minor Sandbox
 * grant, so the accepted GOLDEN run alone left 2 650 000 behind while every
 * one of its journeys reported PASS.
 *
 * OWNERSHIP IS DECLARED, NEVER RECOGNISED
 *
 * A cleaner that decides what to retire by looking at a name is how you delete
 * the account that takes donations: fm65, priscila, oxfannio and qatester15
 * match every synthetic pattern this Sandbox has and belong to real people.
 * Nothing is retired here that was not handed over by the code that made it.
 *
 * CLEANUP RUNS HOWEVER THE HARNESS EXITS
 *
 * `withOwnedFixtures` puts cleanup in a finally, so a failed assertion, a
 * thrown locator timeout and an early return all retire. The runs that leak are
 * exactly the runs that failed, which is why cleanup on the success path only
 * is worth almost nothing.
 *
 * THE TWO RESULTS STAY SEPARATE
 *
 * A cleanup failure must never overwrite the functional failure that preceded
 * it, and must never be swallowed either. `withOwnedFixtures` returns both and
 * rethrows the ORIGINAL error, with the cleanup outcome attached.
 *
 * RETIREMENT, NOT DELETION
 *
 * Consumers and Businesses go back through the canonical Core routes a person
 * would use — a balanced posting to the Sandbox funding source, then suspend.
 * No SQL, no value created or destroyed, history preserved.
 *
 * THE MANIFEST SURVIVES A CRASH
 *
 * Node cannot await anything from process.on('exit'), so unlike the shell trap
 * this cannot clean up after a hard kill. The manifest is therefore written
 * synchronously at the moment of ownership: if the process dies outright, the
 * ids are on disk and can be retired afterwards.
 *
 *   const owned = e2eBegin('proof-14');
 *   const { functional, cleanup } = await withOwnedFixtures(owned, async () => {
 *     const c = await registerConsumerSomehow();
 *     e2eOwn(owned, 'consumer', c.handle);
 *     ...assert...
 *   });
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retireConsumer } from './consumer-retire.mjs';

const KINDS = new Set(['consumer', 'business']);

/** Start a run: an id, a manifest, an empty ledger of owned things. */
export function e2eBegin(label = 'app-web') {
  const runId = `${label}-${Date.now().toString(36)}`;
  const dir = join(tmpdir(), 'banzami-e2e-manifests');
  mkdirSync(dir, { recursive: true });
  // When the runner is driving, the manifest is named for the RUN and JOURNEY
  // so the executor can find it afterwards and claim the resources against
  // them. Ownership then reaches the database from the code that created the
  // resource, rather than being reconstructed later from handles and
  // timestamps — which is how a `tp` prefix nearly sent a repair to the wrong
  // harness.
  const runRef = process.env.BANZAMI_VALIDATION_RUN_REF;
  const journey = process.env.BANZAMI_VALIDATION_JOURNEY;
  const name = runRef && journey ? `run-${runRef}-${journey}` : runId;
  return { runId, runRef: runRef ?? null, journey: journey ?? null,
           manifest: join(dir, `${name}.json`), owned: [] };
}

/**
 * Hand a resource over. Written to disk synchronously — a manifest that only
 * exists in memory is no manifest at all when the process is killed.
 */
export function e2eOwn(run, kind, id, meta = {}) {
  if (!KINDS.has(kind)) throw new Error(`e2eOwn: unknown resource kind ${JSON.stringify(kind)}`);
  if (!id) throw new Error(`e2eOwn: ${kind} handed over with no id`);
  run.owned.push({ kind, id: String(id), meta, at: new Date().toISOString() });
  writeFileSync(run.manifest, JSON.stringify({
    runId: run.runId, runRef: run.runRef, journey: run.journey, owned: run.owned,
  }, null, 2));
  return id;
}

/** Retire everything, newest first. Never throws; reports per resource. */
export async function e2eCleanup(run, { retireBusiness } = {}) {
  const results = [];
  for (const r of [...run.owned].reverse()) {
    try {
      if (r.kind === 'consumer') {
        const out = retireConsumer(r.id, { runId: run.runId, reason: `app-web fixture cleanup (${run.runId})` });
        results.push({ ...r, ok: !!out.ok, detail: `retire-funds ${out.fundsStatus} suspend ${out.suspendStatus}` });
      } else if (r.kind === 'business') {
        if (!retireBusiness) { results.push({ ...r, ok: false, detail: 'no retireBusiness supplied' }); continue; }
        const out = await retireBusiness(r.id);
        results.push({ ...r, ok: out !== false, detail: String(out) });
      }
    } catch (e) {
      results.push({ ...r, ok: false, detail: String(e.message).slice(0, 160) });
    }
  }
  const failed = results.filter((r) => !r.ok);
  return {
    result: run.owned.length === 0 ? 'NOT_REQUIRED' : failed.length ? 'FAILED' : 'VERIFIED',
    detail: failed.length
      ? `${failed.length} of ${results.length} resource(s) did not retire: ${failed.map((f) => `${f.kind} ${f.id}`).join(', ')}`
      : `${results.length} resource(s) retired`,
    results,
  };
}

/**
 * Run the scenario, then clean up whatever it handed over — however it exits.
 *
 * The original error is rethrown with `.cleanup` attached, so a cleanup failure
 * can never overwrite the functional failure that came first, and can never be
 * silently dropped either.
 */
export async function withOwnedFixtures(run, fn, opts = {}) {
  let functional = { ok: true, error: null };
  try {
    const value = await fn();
    const cleanup = await e2eCleanup(run, opts);
    return { functional, cleanup, value };
  } catch (e) {
    functional = { ok: false, error: e };
    const cleanup = await e2eCleanup(run, opts);
    e.cleanup = cleanup;
    throw e;
  }
}
