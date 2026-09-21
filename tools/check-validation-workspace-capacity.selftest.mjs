#!/usr/bin/env node
/**
 * Workspace capacity — proven by watching it refuse.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001).
 *
 * Every assertion here exists because the gate it guards was absent when
 * BZV-20260921-0001 was ABANDONED against a limit nothing was watching, and an
 * owner gate printed OPEN the whole time. A capacity gate that has never been
 * seen to close for the right reason is not a gate.
 *
 *   node tools/check-validation-workspace-capacity.selftest.mjs
 */
import {
  workspaceLimits, workspaceCost, resolveActor, workspaceConsumption,
  retryReserve, activeHeadroom, creationHeadroom, earliestSufficient,
  workspaceUsage, withKnownActors, reserveFor, SHARED_FIXTURE_ACTOR,
} from './lib/validation-workspace-capacity.mjs';

let failures = 0;
const check = (t, ok, d = '') => { if (ok) return console.log(`  ✓ ${t}`); console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`); failures++; };

console.log('\nworkspace capacity — two resources, per actor, failing closed\n');

const LIMITS = { verdict: 'READ', activeLimit: 10, creationLimit24h: 20, windowHours: 24, source: 'fixture' };
const RESERVE = { verdict: 'DECLARED', model: 'one_full_retry', permittedRetries: 1 };
const A = SHARED_FIXTURE_ACTOR;

/** A plan of N journeys, each creating `each` workspaces under the shared actor. */
const sharedPlan = (n, each = 1) => ({
  plan: Array.from({ length: n }, (_, i) => ({ journey: `J${i}`, harness: `h${i}.sh` })),
  readSource: () => `ACTOR=${A}\n` + Array.from({ length: each },
    () => `call "$DEV" 8086 POST /internal/v1/fixture-projects "{\\"name\\":\\"x\\",\\"created_by\\":\\"$ACTOR\\"}"`).join('\n'),
});

const usageOf = (active, created24h, creations = []) => new Map([[A, { active, created24h, creations }]]);

/* ── the limits are read, never authored ─────────────────────────────────── */

const live = workspaceLimits();
check('the limits come from the service that enforces them',
  live.verdict === 'READ' && live.activeLimit > 0 && live.creationLimit24h > 0,
  JSON.stringify(live));
check('…and an unreadable limits source is UNKNOWN, not a default',
  workspaceLimits({ readSource: () => { throw new Error('gone'); } }).verdict === 'UNKNOWN');
check('…and a source that no longer declares both limits is UNKNOWN',
  workspaceLimits({ readSource: () => 'MaxActiveWorkspacesPerUser = 10' }).verdict === 'UNKNOWN',
  'half a policy is not a policy');

/* ── A · active concurrency refuses when it is full ──────────────────────── */

{
  const c = workspaceConsumption(sharedPlan(1, 1).plan, { readSource: sharedPlan(1, 1).readSource, barrier: true });
  const g = activeHeadroom({ usage: usageOf(10, 0), consumption: c, limits: LIMITS, reserve: RESERVE });
  check('A. active 10/10 with one more concurrent required → ACTIVE CLOSED',
    g.verdict === 'CLOSED' && g.reason === 'INSUFFICIENT_CAPACITY', `${g.verdict} ${g.detail}`);
}

/* ── B · active is NOT the total number of creations ─────────────────────── */

{
  const p = sharedPlan(9, 1);
  const c = workspaceConsumption(p.plan, { readSource: p.readSource, barrier: true });
  const rec = c.byActor.get(A);
  check('B. nine sequential creations under the barrier are ONE concurrent',
    rec.planned === 9 && rec.maxConcurrentAdditional === 1,
    `planned ${rec.planned} · concurrent ${rec.maxConcurrentAdditional}`);
  const g = activeHeadroom({ usage: usageOf(0, 0), consumption: c, limits: LIMITS, reserve: RESERVE });
  check('B. …so ACTIVE may pass on a limit of 10 that the total would have failed',
    g.verdict === 'OPEN', `${g.verdict} ${g.detail}`);
  // And the premise is a property of the runner, not of the numbers: remove the
  // barrier and every journey may leave its workspaces behind.
  const noBar = workspaceConsumption(p.plan, { readSource: p.readSource, barrier: false });
  check('B. …and WITHOUT the cleanup barrier the concurrent bound becomes the sum',
    noBar.byActor.get(A).maxConcurrentAdditional === 9);
  const g2 = activeHeadroom({ usage: usageOf(0, 0), consumption: noBar, limits: LIMITS, reserve: RESERVE });
  check('B. …which then CLOSES the same gate (9 + 9 reserved > 10)',
    g2.verdict === 'CLOSED', `${g2.verdict} ${g2.detail}`);
}

/* ── C, D · the cumulative window is exact at its boundary ───────────────── */

{
  // created 14 + planned 3 + reserve 3 = 20, exactly the limit.
  const p = sharedPlan(3, 1);
  const c = workspaceConsumption(p.plan, { readSource: p.readSource, barrier: true });
  const g = creationHeadroom({ usage: usageOf(0, 14), consumption: c, limits: LIMITS, reserve: RESERVE });
  check('C. created 14/20 + planned 3 + reserve 3 = exactly 20 → PASS',
    g.verdict === 'OPEN', `${g.verdict} ${g.detail}`);
  const g2 = creationHeadroom({ usage: usageOf(0, 15), consumption: c, limits: LIMITS, reserve: RESERVE });
  check('D. one more already spent → 21 of 20 → CLOSED',
    g2.verdict === 'CLOSED' && g2.reason === 'INSUFFICIENT_CAPACITY', `${g2.verdict} ${g2.detail}`);
  check('D. …and the refusal names both halves of the requirement',
    /3\+3/.test(g2.detail), g2.detail);
}

/* ── E · archiving frees ONE of the two resources ────────────────────────── */

{
  // The same fixture database, read twice: once with a workspace ACTIVE, once
  // after it was archived. created_at does not move, so created24h must not.
  const rowsActive = [[A, '5', '18', '2026-09-21T10:00:00Z']];
  const rowsArchived = [[A, '4', '18', '2026-09-21T10:00:00Z']];
  const uA = workspaceUsage({ sql: () => rowsActive });
  const uB = workspaceUsage({ sql: () => rowsArchived });
  check('E. archiving increases ACTIVE free',
    uB.get(A).active < uA.get(A).active, `${uA.get(A).active} → ${uB.get(A).active}`);
  check('E. …and does NOT increase 24h CREATION free',
    uB.get(A).created24h === uA.get(A).created24h,
    'a slot returns when its creation ages out, never when its workspace is archived');
}

/* ── F · a creation ageing out of the window does free a slot ────────────── */

{
  const inWindow = workspaceUsage({ sql: () => [[A, '0', '18', 'a,b']] });
  const agedOut = workspaceUsage({ sql: () => [[A, '0', '17', 'a']] });
  check('F. a creation falling outside the rolling window frees a creation slot',
    agedOut.get(A).created24h === inWindow.get(A).created24h - 1);
}

/* ── G · per actor, never aggregated ─────────────────────────────────────── */

{
  // Two actors: the shared one is nearly exhausted, a second is empty. Summing
  // them would report ample capacity; the limiter counts per actor and refuses.
  const OTHER = '22222222-2222-4333-8444-555555555555';
  const p = {
    plan: [{ journey: 'J0', harness: 'a.sh' }, { journey: 'J1', harness: 'b.sh' }],
    readSource: (rel) => rel === 'a.sh'
      ? `ACTOR=${A}\ncall "$DEV" 8086 POST /internal/v1/fixture-projects "{\\"created_by\\":\\"$ACTOR\\"}"`
      : `ACTOR=${OTHER}\ncall "$DEV" 8086 POST /internal/v1/fixture-projects "{\\"created_by\\":\\"$ACTOR\\"}"`,
  };
  const c = workspaceConsumption(p.plan, { readSource: p.readSource, barrier: true });
  const usage = new Map([[A, { active: 0, created24h: 19, creations: [] }],
                         [OTHER, { active: 0, created24h: 0, creations: [] }]]);
  const g = creationHeadroom({ usage, consumption: c, limits: LIMITS, reserve: RESERVE });
  check('G. an exhausted actor closes the gate even beside an empty one',
    g.verdict === 'CLOSED' && g.actors.find((x) => x.actor === A)?.ok === false
      && g.actors.find((x) => x.actor === OTHER)?.ok === true,
    'summing 19+0 against 40 would have reported ample capacity');
  const globalUsed = [...usage.values()].reduce((n, u) => n + u.created24h, 0);
  const globalLimit = usage.size * LIMITS.creationLimit24h;
  check('G. …and the aggregated reading really would have passed, which is why it is banned',
    globalLimit - globalUsed >= 4, `global would see ${globalLimit - globalUsed} free`);
}

/* ── H, I · unknown fails closed ─────────────────────────────────────────── */

{
  const p = sharedPlan(1, 1);
  const c = workspaceConsumption(p.plan, { readSource: p.readSource, barrier: true });
  const g = creationHeadroom({ usage: new Map(), consumption: c, limits: LIMITS, reserve: RESERVE });
  check('H. a plan actor with no usage reading → CLOSED · UNKNOWN_CAPACITY',
    g.verdict === 'CLOSED' && g.reason === 'UNKNOWN_CAPACITY', `${g.verdict} ${g.reason}`);
  check('H. …and it is not silently treated as an empty actor',
    !/0 free/.test(g.detail) && /no usage reading/.test(g.detail), g.detail);

  const noPolicy = retryReserve('FULL', { policy: { profiles: [], models: [] } });
  check('I. a profile with no declared workspace retry policy is UNKNOWN',
    noPolicy.verdict === 'UNKNOWN', JSON.stringify(noPolicy));
  const g2 = creationHeadroom({ usage: usageOf(0, 0), consumption: c, limits: LIMITS, reserve: noPolicy });
  check('I. …and an UNKNOWN reserve CLOSES the gate rather than reserving nothing',
    g2.verdict === 'CLOSED' && g2.reason === 'UNKNOWN_CAPACITY', `${g2.verdict} ${g2.reason}`);
  const badModel = retryReserve('FULL', { policy: { profiles: [{ id: 'FULL', workspace: { retry_reserve_model: 'whatever', permitted_retries: 1 } }], models: [] } });
  check('I. …and a reserve model nothing implements is UNKNOWN, not obeyed',
    badModel.verdict === 'UNKNOWN');

  const g3 = creationHeadroom({ usage: usageOf(0, 0), consumption: c,
    limits: { verdict: 'UNKNOWN', detail: 'unreadable' }, reserve: RESERVE });
  check('H. an unreadable LIMIT closes the gate too', g3.verdict === 'CLOSED' && g3.reason === 'UNKNOWN_CAPACITY');
}

/* ── an actor the database has never seen is a derived zero ──────────────── */

{
  const p = sharedPlan(1, 1);
  const c = workspaceConsumption(p.plan, { readSource: p.readSource, barrier: true });
  const filled = withKnownActors(new Map(), c);
  check('an actor absent from a SUCCESSFUL reading is a derived zero',
    filled.get(A)?.created24h === 0 && filled.get(A)?.neverSeen === true,
    'distinct from a reading that never happened, which stays missing and closes');
}

/* ── J · the requirement follows the plan, and is never a literal ────────── */

{
  const small = sharedPlan(2, 1), big = sharedPlan(2, 3);
  const cs = workspaceConsumption(small.plan, { readSource: small.readSource, barrier: true });
  const cb = workspaceConsumption(big.plan, { readSource: big.readSource, barrier: true });
  check('J. changing what the plan creates changes the requirement automatically',
    cs.byActor.get(A).planned === 2 && cb.byActor.get(A).planned === 6,
    `${cs.byActor.get(A).planned} vs ${cb.byActor.get(A).planned}`);
  const gs = creationHeadroom({ usage: usageOf(0, 14), consumption: cs, limits: LIMITS, reserve: RESERVE });
  const gb = creationHeadroom({ usage: usageOf(0, 14), consumption: cb, limits: LIMITS, reserve: RESERVE });
  check('J. …and the same live capacity passes one plan and refuses the other',
    gs.verdict === 'OPEN' && gb.verdict === 'CLOSED', `${gs.verdict} / ${gb.verdict}`);
}

/* ── no hardcoded plan figure anywhere ───────────────────────────────────── */

{
  const { readFileSync } = await import('node:fs');
  const lib = readFileSync(new URL('./lib/validation-workspace-capacity.mjs', import.meta.url), 'utf8');
  // Narrow deliberately. The first spelling of this matched `planned: 0` — the
  // accumulator's own initialiser — which is the recurring mistake of asserting
  // against the shape of one's own code instead of the property. The property
  // is that a count is only ever ACCUMULATED from the plan, never assigned.
  check('the library never assigns a planned count a literal value',
    !/\bplanned\s*[:=]\s*[1-9]/.test(lib),
    'a number typed here is a number that stops following the plan');
  check('…and every count reaches `planned` by accumulation',
    /\[field\]\s*\+=\s*n/.test(lib) && !/planned\s*=\s*(?!0\b)/.test(lib));
}

/* ── a creation site inside a loop is a floor, and a floor may not authorise ─ */

{
  const looped = workspaceCost('loopy.sh',
    `ACTOR=${A}\nfor i in 1 2 3; do\n  call "$DEV" 8086 POST /internal/v1/fixture-projects "{\\"created_by\\":\\"$ACTOR\\"}"\ndone`);
  check('a creation inside a loop is UNKNOWN, never counted as one',
    looped.precision === 'UNKNOWN' && looped.looped.length === 1);
  const c = workspaceConsumption([{ journey: 'L', harness: 'loopy.sh' }],
    { readSource: () => `ACTOR=${A}\nfor i in 1 2 3; do\n  call POST /internal/v1/fixture-projects "{\\"created_by\\":\\"$ACTOR\\"}"\ndone`, barrier: true });
  check('…and it propagates as a plan the gate refuses to derive',
    c.unknown.length === 1);
}

/* ── actor resolution ────────────────────────────────────────────────────── */

check('a minted actor is EPHEMERAL, and never contends',
  resolveActor('OP', 'OP=$(cat /proc/sys/kernel/random/uuid)').kind === 'EPHEMERAL');
check('a literal actor is SHARED',
  resolveActor('ACTOR', `ACTOR=${A}`).kind === 'SHARED');
check('synthetic_tenant defaults to the shared fixture actor',
  resolveActor('ST_ACTOR', 'nothing here').id === SHARED_FIXTURE_ACTOR);
check('an unreadable actor reference is UNKNOWN',
  resolveActor('MYSTERY', 'MYSTERY=$(some_helper)').kind === 'UNKNOWN');
check('the retire route is not charged as a creation',
  workspaceCost('r.sh', 'call POST /internal/v1/fixture-projects/$P/retire "{}"') === null,
  'giving a project back is not taking a slot');

/* ── the forecast is a forecast ──────────────────────────────────────────── */

{
  const e = earliestSufficient({
    creations: ['2026-09-21T10:00:00Z', '2026-09-21T11:00:00Z', '2026-09-21T12:00:00Z'],
    used: 20, limit: 20, required: 2, windowHours: 24 });
  check('the forecast names the instant the SECOND slot returns, not the first',
    e.at === '2026-09-22T11:00:00.000Z' && e.releases === 2, JSON.stringify(e));
  check('…and reports when the window cannot ever supply enough',
    earliestSufficient({ creations: ['2026-09-21T10:00:00Z'], used: 20, limit: 20, required: 5 }).insufficient === true);
  check('…and says so plainly when capacity is already sufficient',
    earliestSufficient({ creations: [], used: 0, limit: 20, required: 5 }).already === true);
}

/* ── the cross-tenant fixtures, moved off the shared actor ───────────────── */
//
// Four "another tenant" fixtures used to be built under the canonical shared
// fixture actor. The property each proves is that the resource belongs to a
// DIFFERENT tenant — never that it belongs to that particular actor — so they
// were moved to per-site ephemeral identities. Nothing below asserts the number
// 7: every figure is re-derived from the plan's own sources.

{
  const { readFileSync } = await import('node:fs');
  const { planFor } = await import('./validation-runner.mjs');
  const realPlan = planFor('FULL').plan;
  const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url).pathname, 'utf8');

  const MOVED = [
    ['tests/phase0/webhook-lifecycle-e2e.sh', 'wh-other-'],
    ['tests/phase0/webhook-lifecycle-e2e.sh', 'wh-unbound-'],
    ['tests/phase0/refund-devkey-e2e.sh', 'refund-other-'],
    ['tests/phase0/refund-published-sdk-e2e.sh', 'rfpub-b-'],
  ];

  // B. the requirement falls, derived from source.
  const now = workspaceConsumption(realPlan, { barrier: true });
  const shared = now.byActor.get(A);
  const reqNow = shared.planned + reserveFor(RESERVE, shared.planned);
  check('B. the shared actor requirement is derived and now fits the limit',
    now.unknown.length === 0 && reqNow <= LIMITS.creationLimit24h,
    `planned ${shared.planned} + retry ${reserveFor(RESERVE, shared.planned)} = ${reqNow} of ${LIMITS.creationLimit24h}`);

  // A. put the four back where they were: the requirement must become
  // structurally impossible again, which is what made the repair necessary.
  const before = workspaceConsumption(realPlan, { barrier: true,
    readSource: (rel) => read(rel).replace(/\$OACTOR/g, '$ACTOR').replace(/\$UACTOR/g, '$ACTOR') });
  const sharedBefore = before.byActor.get(A);
  const reqBefore = sharedBefore.planned + reserveFor(RESERVE, sharedBefore.planned);
  check('A. with the four fixtures back on the shared actor it exceeds the limit again',
    reqBefore > LIMITS.creationLimit24h && sharedBefore.planned > shared.planned,
    `planned ${sharedBefore.planned} → required ${reqBefore} of ${LIMITS.creationLimit24h}`);
  check('A. …and exactly four creations moved, not three and not five',
    sharedBefore.planned - shared.planned === MOVED.length,
    `${sharedBefore.planned - shared.planned} moved`);

  // C. the reserve was never touched to make this fit.
  check('C. the repair needed no change to the retry reserve',
    RESERVE.permittedRetries === retryReserve('FULL').permittedRetries
    && retryReserve('FULL').model === 'one_full_retry',
    'capacity was bought by moving tenants, not by reserving less');

  // D. one fixture slipping back must raise the requirement on its own.
  const slipped = workspaceConsumption(realPlan, { barrier: true,
    readSource: (rel) => (rel.endsWith('refund-devkey-e2e.sh') ? read(rel).replace(/\$OACTOR/g, '$ACTOR') : read(rel)) });
  check('D. one fixture put back on the shared actor raises the requirement automatically',
    slipped.byActor.get(A).planned === shared.planned + 1,
    `${slipped.byActor.get(A).planned} vs ${shared.planned}`);

  // Two foreign tenants inside one harness must not share an identity: two
  // tenants with one actor are one tenant, and the isolation would be vacuous.
  const ephemerals = [...now.byActor.values()].filter((r) => r.kind === 'EPHEMERAL');
  const whk = ephemerals.filter((r) => r.actor.endsWith('@S13-WHK-001'));
  check('the two foreign tenants in one journey are two DISTINCT ephemeral actors',
    whk.length === 2, `${whk.length} ephemeral actor(s) in S13-WHK-001`);
  check('…and no ephemeral actor is assumed to have infinite capacity',
    ephemerals.every((r) => r.planned > 0) &&
    creationHeadroom({ usage: withKnownActors(new Map([[A, { active: 0, created24h: 0, creations: [] }]]), now),
      consumption: now, limits: LIMITS, reserve: RESERVE })
      .actors.filter((x) => x.kind === 'EPHEMERAL').every((x) => x.limit === LIMITS.creationLimit24h),
    'the same service limits apply to an identity nobody has used yet');

  /* E · the cross-tenant guard must fail when the identities coincide ─────── */
  {
    const { execFileSync } = await import('node:child_process');
    // The guard as each harness spells it, exercised both ways.
    const guard = (a, b) => execFileSync('bash', ['-c',
      `ACTOR=${a}; OACTOR=${b}; printf '%s' "$([ -n "$OACTOR" ] && [ "$OACTOR" != "$ACTOR" ] && echo yes)"`],
      { encoding: 'utf8' });
    check('E. distinct identities satisfy the cross-tenant guard', guard('aaa', 'bbb') === 'yes');
    check('E. …and an ephemeral actor EQUAL to the primary fails it',
      guard('aaa', 'aaa') === '', 'a foreign tenant that is the subject proves nothing');
    check('E. …and an empty ephemeral actor fails it too',
      guard('aaa', '') === '', 'a mint that failed must not read as a different tenant');
    for (const [rel] of MOVED) {
      check(`E. ${rel.split('/').pop()} asserts the identities differ before using them`,
        /chk \w*TENANT_ACTOR_DISTINCT/.test(read(rel)));
    }
  }

  /* F · ephemeral ownership is explicit, and its absence is detected ──────── */
  {
    // Every fixture-project created under an ephemeral actor must hand over BOTH
    // the workspace and the project. Recovering the workspace through the
    // project is a join this run may never live to make.
    const owns = (src) => {
      const lines = src.split('\n');
      const out = [];
      for (let i = 0; i < lines.length; i++) {
        if (!/\/internal\/v1\/fixture-projects(?![/\w-])/.test(lines[i])) continue;
        if (/retire/.test(lines[i]) || !/POST/.test(lines[i])) continue;
        if (!/\$\{?[A-Z]*ACTOR/.test(lines[i]) || /\$\{?ACTOR\}?\\/.test(lines[i])) { /* fall through */ }
        const window = lines.slice(i, i + 6).join('\n');
        out.push({ line: i + 1,
          workspace: /e2e_own fixture_workspace/.test(window),
          project: /e2e_own fixture_project/.test(window) });
      }
      return out;
    };
    for (const rel of [...new Set(MOVED.map((m) => m[0]))]) {
      const sites = owns(read(rel));
      check(`F. every fixture-project site in ${rel.split('/').pop()} declares workspace AND project`,
        sites.length > 0 && sites.every((s) => s.workspace && s.project),
        sites.map((s) => `line ${s.line} ws=${s.workspace} proj=${s.project}`).join('; '));
    }
    // And the detector itself refuses a source that forgot the workspace.
    const missing = owns('call POST /internal/v1/fixture-projects "{}"\nP=$(jget project_id)\ne2e_own fixture_project "$P"');
    check('F. …and the detector FAILS a site that owns only the project',
      missing.length === 1 && missing[0].workspace === false && missing[0].project === true,
      'a guard that cannot fail is not a guard');
  }

  // One mechanism, not two: no harness may reintroduce its own inline mint.
  {
    const { readdirSync } = await import('node:fs');
    const dir = new URL('../tests/phase0/', import.meta.url).pathname;
    const offenders = readdirSync(dir).filter((f) => f.endsWith('.sh'))
      .filter((f) => /random\/uuid|\buuidgen\b/.test(read(`tests/phase0/${f}`)));
    check('one canonical ephemeral-actor primitive, and no second spelling',
      offenders.length === 0, offenders.join(', '));
    check('…and the primitive itself exists in the shared lib',
      /e2e_ephemeral_actor\(\)/.test(read('tests/phase0/lib/e2e-run.sh')));
  }
}

/* ── every profile the Studio can run must declare a reserve ─────────────── */

{
  const { execFileSync } = await import('node:child_process');
  const yaml = (rel) => JSON.parse(execFileSync('python3', [
    '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
    new URL(`../${rel}`, import.meta.url).pathname], { encoding: 'utf8', maxBuffer: 1 << 24 }));
  const profiles = (yaml('quality/validation/profiles.yaml').profiles ?? []).map((x) => x.id);
  const missing = profiles.filter((id) => retryReserve(id).verdict !== 'DECLARED');
  check('every runnable profile declares a workspace retry reserve',
    profiles.length > 0 && missing.length === 0,
    missing.length ? `undeclared: ${missing.join(', ')} — a new profile fails closed, but silently` : '');
  check('…and the reserve is never derived from what happens to fit',
    !/free\s*-\s*planned|available\s*-\s*planned/.test(
      (await import('node:fs')).readFileSync(new URL('./lib/validation-workspace-capacity.mjs', import.meta.url), 'utf8')),
    'a reserve computed from headroom is a rationalisation, not a reserve');
}

/* ── the executor's own refusal, watched ─────────────────────────────────── */

{
  const { checkWorkspaceCapacity } = await import('./validation-runner.mjs');
  const p = sharedPlan(3, 1);
  const planRows = p.plan.map((x) => ({ ...x }));
  // workspaceConsumption reads the harness from disk unless the plan carries no
  // harness, so the refusal is driven through the real derivation by handing it
  // a usage map and a plan whose harnesses exist in the fixture reader.
  const consumptionArgs = { plan: planRows, limits: LIMITS, reserve: RESERVE, barrier: true };

  let said = [], failedWith = null;
  const run = (usage) => {
    said = []; failedWith = null;
    checkWorkspaceCapacity('FULL', {
      ...consumptionArgs, usage,
      fail: (m) => { failedWith = m; return 'REFUSED'; },
      say: (m) => said.push(m),
    });
    return failedWith;
  };

  // The plan rows name harnesses that do not exist, so consumption is empty and
  // the gate has nothing to refuse — which is itself the wrong answer to prove
  // against. Use the real FULL plan instead: it is the thing that will run.
  const { planFor } = await import('./validation-runner.mjs');
  const realPlan = planFor('FULL').plan;
  const real = { plan: realPlan, limits: LIMITS, reserve: RESERVE, barrier: true };
  const runReal = (usage) => {
    let out = null;
    checkWorkspaceCapacity('FULL', { ...real, usage,
      fail: (m) => { out = m; return 'REFUSED'; }, say: () => {} });
    return out;
  };

  const exhausted = new Map([[A, { active: 0, created24h: 20, creations: ['2026-09-21T09:00:00Z'] }]]);
  const msg = runReal(exhausted);
  check('the executor refuses BEFORE the claim when the window is spent',
    typeof msg === 'string' && /VALIDATION_WORKSPACE_CAPACITY_INSUFFICIENT/.test(msg),
    String(msg).slice(0, 140));
  check('…and the refusal states the reserve is not negotiable',
    /never lowered to fit/.test(String(msg)));
  check('…and leaves the run unspent',
    /left QUEUED and unspent/.test(String(msg)));

  // A gate that refuses everything protects nothing, so it must be watched
  // ACCEPTING too. The positive case uses a real subset of the real plan rather
  // than a fixture, because the derivation under test is the one that reads
  // actual harness sources.
  const ample = new Map([[A, { active: 0, created24h: 0, creations: [] }]]);
  const smallPlan = realPlan.filter((x) => ['S10-SET-001', 'S12-SDK-001'].includes(x.journey));
  let smallMsg = null;
  checkWorkspaceCapacity('FULL', { plan: smallPlan, limits: LIMITS, reserve: RESERVE, barrier: true,
    usage: ample, fail: (m) => { smallMsg = m; return 'REFUSED'; }, say: () => {} });
  check('…and ACCEPTS a plan that fits, on the same empty window',
    smallPlan.length === 2 && smallMsg === null, String(smallMsg).slice(0, 120));

  // This pin used to assert the opposite, and it was right to: before the
  // cross-tenant fixtures were moved off the shared actor, the FULL plan
  // required 22 creations against a limit of 20 and could not fit an empty
  // window at any hour of any day. It now fits — because the PLAN changed, and
  // not because the reserve was lowered. Test C above holds the reserve, and
  // test A puts the four fixtures back and watches it become impossible again.
  check('the CURRENT FULL plan now fits an empty window, with the reserve intact',
    runReal(ample) === null,
    'if this starts failing, the plan grew — re-derive it rather than reserving less');

  // An unreadable quota is not an empty one.
  let unknownMsg = null;
  checkWorkspaceCapacity('FULL', { plan: realPlan, limits: LIMITS, reserve: RESERVE, barrier: true,
    sql: () => { throw new Error('ssh down'); },
    fail: (m) => { unknownMsg = m; return 'REFUSED'; }, say: () => {} });
  check('an unreadable workspace quota refuses as UNKNOWN, not as zero',
    /VALIDATION_WORKSPACE_CAPACITY_UNKNOWN/.test(String(unknownMsg)), String(unknownMsg).slice(0, 120));
  void run;
}

/* ── and the wiring: enforced before the claim, not after ────────────────── */

{
  const { readFileSync } = await import('node:fs');
  const runner = readFileSync(new URL('./validation-runner.mjs', import.meta.url), 'utf8');
  const callIdx = runner.indexOf('checkWorkspaceCapacity(waiting.profile)');
  const claimIdx = runner.indexOf('const run = claim(cli.run');
  check('the executor checks workspace capacity BEFORE it claims the run',
    callIdx > 0 && claimIdx > 0 && callIdx < claimIdx,
    'refusing after the claim burns an owner authorisation that costs two step-up ceremonies');
}

console.log(failures === 0
  ? `\n✓ VALIDATION_WORKSPACE_CAPACITY=PASS\n`
  : `\n✗ VALIDATION_WORKSPACE_CAPACITY=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
