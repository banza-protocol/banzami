/**
 * Live application-submit capacity, read from the limiter that actually refuses.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * The count of rows in `merchant_applications` is NOT this number. The limiter
 * is a Redis sliding window that records every ATTEMPT, including submissions
 * that never became a row — so the database read this was standing in for said
 * 26 used while the limiter held 28, and a capacity gate was reported with two
 * more slots than existed.
 *
 * It is also PER IP, and a Validation Run spends from two different buckets: a
 * node proof submits from wherever the runner runs, a phase-0 shell harness
 * submits from the Sandbox VM. Twelve free slots summed across both is not
 * twelve free slots for a run that needs eleven from one of them.
 *
 * Read-only throughout: ZCOUNT over a window, never a write, and never a probe
 * of the submitting endpoint — polling the thing you are waiting for consumes
 * the slot you are waiting for.
 */
import { execFileSync } from 'node:child_process';

const HOST = process.env.BANZAMI_SANDBOX_HOST || 'root@217.160.9.248';
const REDIS = process.env.BANZAMI_SANDBOX_REDIS || 'bzsandbox-20260708184104-1708617-23807-redis-1';

/** The limiter's own numbers (services/api-gateway/internal/server/server.go). */
export const SUBMIT_LIMIT = 30;
export const SUBMIT_WINDOW_SECONDS = 24 * 60 * 60;

const KEY_PREFIX = 'rl:application-submit:ip:';

const ssh = (cmd) =>
  execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, cmd], { encoding: 'utf8', maxBuffer: 1 << 22 });

/**
 * Every bucket the limiter is currently tracking, with what each has spent.
 * `vm` is the Sandbox host's own address — where shell harnesses submit from.
 */
export function submitCapacity() {
  const now = Date.now();
  const cutoff = now - SUBMIT_WINDOW_SECONDS * 1000;
  const keys = ssh(`docker exec ${REDIS} redis-cli --scan --pattern '${KEY_PREFIX}*' 2>/dev/null`)
    .split('\n').map((l) => l.trim()).filter(Boolean);

  const buckets = [];
  for (const key of keys) {
    const used = Number(ssh(
      `docker exec ${REDIS} redis-cli ZCOUNT '${key}' ${cutoff} ${now} 2>/dev/null`).trim());
    if (!Number.isFinite(used)) continue;
    // The oldest entry in the window is the next slot to come back.
    const oldest = ssh(
      `docker exec ${REDIS} redis-cli ZRANGEBYSCORE '${key}' ${cutoff} ${now} WITHSCORES LIMIT 0 1 2>/dev/null`)
      .split('\n').map((l) => l.trim()).filter(Boolean);
    const oldestMs = oldest.length >= 2 ? Number(oldest[1]) : null;
    buckets.push({
      ip: key.slice(KEY_PREFIX.length),
      used,
      free: Math.max(0, SUBMIT_LIMIT - used),
      nextFreeAt: oldestMs ? new Date(oldestMs + SUBMIT_WINDOW_SECONDS * 1000).toISOString() : null,
      isVM: key.endsWith(HOST.split('@').pop()),
    });
  }
  return buckets;
}

/**
 * The bucket a run's NODE harnesses spend from — the one that gates a run.
 *
 * It is whichever non-VM bucket the limiter has seen, because that is this
 * machine as the edge sees it. If the limiter has never seen this machine there
 * is nothing to report and the caller must say so rather than assume a full
 * window: an unknown bucket is not an empty one.
 */
export function runnerBucket(buckets = submitCapacity()) {
  const candidates = buckets.filter((b) => !b.isVM);
  if (!candidates.length) return null;
  // The busiest non-VM bucket is the one this machine has been spending from.
  return candidates.sort((a, b) => b.used - a.used)[0];
}

export function vmBucket(buckets = submitCapacity()) {
  return buckets.find((b) => b.isVM) ?? null;
}

/**
 * Does running this harness spend an application-submit slot, and from where?
 *
 * ONE definition, used by the plan tool and by the runner, because two
 * derivations of "what this run will cost" is two chances to disagree — and
 * they did: a heuristic that treated a harness as free when its source merely
 * MENTIONED BZ_BIZ_HANDLE reported GOLDEN at 3 slots when it spends 4.
 *
 * Fixture reuse is something an operator does by hand while diagnosing. A
 * Validation Run always provisions, so calling provisionBusiness is the whole
 * test and a mention in prose is not a call.
 */
export function submitCost(harnessRelPath, src) {
  const spends = /provisionBusiness\s*\(/.test(src) || /\/v1\/merchant\/applications/.test(src);
  if (!spends) return null;
  // A phase-0 shell harness runs ON the Sandbox VM, so its submit is charged to
  // the VM's address, not to whichever machine is driving the run.
  return { bucket: harnessRelPath.endsWith('.sh') ? 'vm' : 'runner' };
}

/* ── the OTHER scarce resource: aggregate synthetic funds ─────────────────── */

/**
 * The Sandbox's aggregate-funds cap, and why it is not the credit ceiling.
 *
 * `max_credit_volume_minor` limits money MOVED. This limits money HELD: every
 * synthetic consumer a run creates is funded, and that balance sits against a
 * shared 50 000 000 cap until the run gives it back. A run can move very little
 * and still exhaust it — which is exactly what happened, when proof 15 funded a
 * consumer 500 000 per run and never retired it. Forty-two runs held 79% of the
 * cap and the next funding call was refused as INSUFFICIENT_FUNDS, a message
 * that reads like a product fault and is not one.
 */
export const AGGREGATE_FUNDS_CAP = 50_000_000;

/** Sandbox consumer registration AUTO-GRANTS this much (public-api auth.go). */
export const REGISTRATION_GRANT = 1_000_000;

/** Live aggregate funded value across merchant and consumer wallets. Read-only. */
export function aggregateFunds() {
  const out = ssh(
    `U=$(cat /root/.banzami/operator_db_url); ` +
    `docker exec ${process.env.BANZAMI_SANDBOX_PG || 'bzsandbox-20260708184104-1708617-23807-postgres-1'} ` +
    `psql "$U" -tAc "SELECT SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END) ` +
    `FROM ledger_entries WHERE account_id IN (SELECT available_account_id FROM wallets ` +
    `UNION SELECT available_account_id FROM consumer_wallets)"`).trim();
  const used = Number(out);
  if (!Number.isFinite(used)) throw new Error(`unreadable aggregate funds: ${JSON.stringify(out)}`);
  return { cap: AGGREGATE_FUNDS_CAP, used, available: Math.max(0, AGGREGATE_FUNDS_CAP - used) };
}

/**
 * The most funded value a plan may hold at once, before cleanup.
 *
 * A CEILING derived from the harnesses, not a prediction: every consumer a
 * journey registers receives the automatic grant whether the journey wanted it
 * or not, plus whatever it funds explicitly. Peak rather than sum, because a
 * journey returns its funding on the way out — but a FAILED journey may strand
 * it, so the model does not assume cleanup ran.
 *
 * KNOWN IMPRECISION, stated rather than papered over: this counts the literal
 * register call, and a harness that wraps it in a helper and calls the helper
 * three times reads as one. The count is therefore a FLOOR, and under-counting
 * a ceiling is the dangerous direction — so the runner does not rely on it
 * alone. It measures the ACTUAL peak against the same live source during the
 * run and reports any divergence from this number as an observation to
 * investigate, which is the only way an imprecise model stays honest.
 */
export function plannedPeakFunds(plan, readSource) {
  let registrations = 0, explicit = 0;
  for (const p of plan) {
    if (!p.harness) continue;
    let src; try { src = readSource(p.harness); } catch { continue; }
    registrations += (src.match(/auth\/register/g) ?? []).length;
    for (const m of src.matchAll(/sandbox\/fund['"`\s,{]*[^}]*?amount_minor:\s*(\d+)/g)) explicit += Number(m[1]);
    for (const m of src.matchAll(/amount_minor:\s*(\d+)[^}]*\}\s*\)?\s*;?\s*\/\/\s*fund/gi)) explicit += Number(m[1]);
  }
  return {
    registrations,
    grantExposure: registrations * REGISTRATION_GRANT,
    explicit,
    peak: registrations * REGISTRATION_GRANT + explicit,
  };
}
