#!/usr/bin/env node
/**
 * validation-volume-preflight.mjs — VALIDATION_VOLUME_BUDGET_PREFLIGHT.
 *
 * Decides whether a Validation Run should START. It does not, and cannot,
 * permit an operation the runtime policy would refuse: the rolling windows in
 * core/compliance are the authority, this only asks whether beginning a run is
 * likely to be a waste of the Sandbox's capacity.
 *
 *     estimated worst-case run volume
 *   + current rolling-window usage
 *   + safety margin
 *   <= the cap, for EVERY window and EVERY participating merchant
 *
 * The distinction matters. A run that dies halfway through a Full Validation
 * because the 24h window closed leaves half a certification and a burnt budget.
 * Refusing to start it is capacity planning; nothing here is a bypass, and
 * VALIDATION_VOLUME_PREFLIGHT_POLICY_BYPASS=0 is asserted by the fact that this
 * file writes nothing and calls no enforcement path.
 *
 *   node tools/validation-volume-preflight.mjs --run-type FULL
 *   node tools/validation-volume-preflight.mjs --run-type GOLDEN --json
 *
 * Exit 0 HEALTHY/DEGRADED, 1 UNHEALTHY (do not start).
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const RUN_TYPE = (arg('--run-type', 'FULL') || 'FULL').toUpperCase();
const JSON_OUT = argv.includes('--json');
const REMOTE = arg('--remote', 'root@217.160.9.248');

// Caps are READ from the policy, never restated: a re-sizing must not leave the
// preflight quoting numbers the runtime no longer enforces.
const pilot = readFileSync(resolve(ROOT, 'core/compliance/src/pilot.rs'), 'utf8');
const cap = (n) => {
  const m = pilot.match(new RegExp(`pub const ${n}: i64 = ([0-9_]+);`));
  if (!m) throw new Error(`${n} is not in pilot.rs — the preflight and the policy have diverged`);
  return Number(m[1].replace(/_/g, ''));
};
const CAPS = {
  global_24h: cap('GLOBAL_ROLLING_24H_MINOR'),
  global_30d: cap('GLOBAL_ROLLING_30D_MINOR'),
  merchant_24h: cap('MERCHANT_ROLLING_24H_MINOR'),
  merchant_30d: cap('MERCHANT_ROLLING_30D_MINOR'),
};

/**
 * Worst-case merchant-credit volume per run type, in minor units.
 *
 * Calibrated against the Sandbox's own history rather than guessed: the
 * heaviest day ever recorded is 31 165 620 over 509 credits, and a comparable
 * multi-suite day (2026-09-11) cost 16 460 000 over 229. FULL uses the heaviest
 * day as its worst case, not its mean — a preflight that plans for the average
 * is a preflight that fails halfway through the bad run.
 */
const RUN_COST = {
  TARGETED: 1_100_000,
  REGRESSION: 5_000_000,
  FULL: 31_165_620,
  REPAIR: 45_000_000,     // a Full Run plus reruns of the change-impact closure
  GOLDEN: 31_165_620,
};
const SAFETY_MARGIN = 0.20;   // 20% — repair reruns, retries, concurrent DOA traffic

if (!(RUN_TYPE in RUN_COST)) {
  console.error(`unknown --run-type ${RUN_TYPE}; one of ${Object.keys(RUN_COST).join(', ')}`);
  process.exit(2);
}
const estimate = Math.round(RUN_COST[RUN_TYPE] * (1 + SAFETY_MARGIN));

// Participating merchants: the provisioned Business actors. Before B10 there are
// none, and the per-merchant windows are reported as not-applicable rather than
// silently passing.
const actors = JSON.parse(execFileSync('python3',
  ['-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
   resolve(ROOT, 'quality/validation/actors.yaml')], { encoding: 'utf8' }));
const businesses = (actors.actors ?? [])
  .filter((a) => a.type === 'business')
  .map((a) => ({ id: a.id, handle: a.handle, merchant_id: a.product_ids?.merchant_id ?? null }))
  .filter((b) => b.merchant_id);

// The query is collapsed to ONE LINE before quoting. JSON.stringify on a
// multi-line template emits literal \n escapes, which the shell passes through
// to psql verbatim and psql reads as a syntax error at a backslash.
const sql = (q) => execFileSync('ssh', ['-o', 'ConnectTimeout=25', '-o', 'BatchMode=yes', REMOTE,
  `U=$(cat /root/.banzami/operator_db_url); docker exec bzsandbox-20260708184104-1708617-23807-postgres-1 psql "$U" -tAc ${JSON.stringify(q.replace(/\s+/g, ' ').trim())}`],
  { encoding: 'utf8' }).trim();

const globalWindow = (iv) => Number(sql(
  `SELECT COALESCE(SUM(amount_minor),0)::bigint FROM ledger_entries
    WHERE entry_type='CREDIT' AND created_at >= now() - interval '${iv}'
      AND account_id IN (SELECT available_account_id FROM wallets)`));

const merchantWindow = (mid, iv) => Number(sql(
  `SELECT COALESCE(SUM(le.amount_minor),0)::bigint FROM ledger_entries le
     JOIN wallets w ON w.available_account_id = le.account_id
    WHERE le.entry_type='CREDIT' AND le.created_at >= now() - interval '${iv}'
      AND w.merchant_id = '${mid}'`));

const windows = [];
const check = (name, used, capValue, scope) => {
  const headroom = capValue - used;
  const fits = used + estimate <= capValue;
  windows.push({ window: name, scope, used, cap: capValue, headroom, estimate, fits });
};

check('global 24h', globalWindow('24 hours'), CAPS.global_24h, 'sandbox');
check('global 30d', globalWindow('30 days'), CAPS.global_30d, 'sandbox');

// Per-merchant: the run's volume does not land on one Business, it spreads over
// the participating ones. Dividing is the honest model, but a run CAN
// concentrate, so the worst case charges each merchant the full share.
const perMerchantEstimate = businesses.length ? Math.ceil(estimate / businesses.length) : 0;
for (const b of businesses) {
  const used24 = merchantWindow(b.merchant_id, '24 hours');
  const used30 = merchantWindow(b.merchant_id, '30 days');
  const fits24 = used24 + perMerchantEstimate <= CAPS.merchant_24h;
  const fits30 = used30 + perMerchantEstimate <= CAPS.merchant_30d;
  windows.push({ window: 'merchant 24h', scope: b.handle ?? b.id, used: used24, cap: CAPS.merchant_24h,
                 headroom: CAPS.merchant_24h - used24, estimate: perMerchantEstimate, fits: fits24 });
  windows.push({ window: 'merchant 30d', scope: b.handle ?? b.id, used: used30, cap: CAPS.merchant_30d,
                 headroom: CAPS.merchant_30d - used30, estimate: perMerchantEstimate, fits: fits30 });
}

const failed = windows.filter((w) => !w.fits);
const state = failed.length ? 'UNHEALTHY' : businesses.length ? 'HEALTHY' : 'DEGRADED';
const note = businesses.length
  ? `${businesses.length} provisioned Business actor(s)`
  : 'no Business actor is provisioned yet — per-merchant windows not evaluated (B10 pending)';

const result = {
  generated_at: new Date().toISOString(),
  run_type: RUN_TYPE,
  estimated_worst_case_minor: RUN_COST[RUN_TYPE],
  safety_margin: SAFETY_MARGIN,
  estimate_with_margin_minor: estimate,
  caps_minor: CAPS,
  participating_merchants: businesses.length,
  windows,
  state,
  note,
  policy_bypass: 0,
};

if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Validation volume budget preflight — ${RUN_TYPE}\n`);
  console.log(`  worst-case run ${RUN_COST[RUN_TYPE].toLocaleString('pt-PT')} +${SAFETY_MARGIN * 100}% margin = ${estimate.toLocaleString('pt-PT')} minor\n`);
  for (const w of windows) {
    console.log(`  ${w.fits ? '✓' : '✗'} ${w.window.padEnd(13)} ${String(w.scope).padEnd(10)} ` +
      `used ${String(w.used).padStart(10)} / cap ${String(w.cap).padStart(10)} · headroom ${String(w.headroom).padStart(10)}`);
  }
  console.log(`\n  ${note}`);
  console.log(`\n  VALIDATION_VOLUME_BUDGET_PREFLIGHT=${state}`);
  console.log('  VALIDATION_VOLUME_PREFLIGHT_POLICY_BYPASS=0  (this reads; the runtime policy decides)');
}
process.exit(state === 'UNHEALTHY' ? 1 : 0);
