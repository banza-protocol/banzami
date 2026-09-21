/**
 * Workspace capacity — two resources, never one number.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001).
 *
 * BZV-20260921-0001 was ABANDONED with the shared fixture actor at 20/20
 * workspace creations, and `validation-owner-readiness.mjs` printed
 * OWNER_GATE = OPEN throughout — not because its numbers were wrong, but
 * because it had no workspace gate at all. Three scarce resources were gated
 * and a fourth was invisible.
 *
 * TWO RESOURCES, TWO FORMULAS
 *
 *   ACTIVE        current_active + max_concurrent_additional <= active_limit
 *   24H CREATION  created_24h + planned + retry_reserve      <= creation_limit
 *
 * They are NOT interchangeable. Archiving a workspace frees an ACTIVE place and
 * gives back NOTHING in the rolling creation window — which is why retiring the
 * five rail-* workspaces would have mutated real financial state to buy
 * capacity that does not exist. A plan that creates nine workspaces one after
 * another, each retired before the next, needs nine CREATION slots and may need
 * one ACTIVE slot.
 *
 * EVERYTHING IS PER ACTOR
 *
 * The limiter counts per `created_by`. Some harnesses build their tenant under
 * the shared fixture actor; others mint a fresh UUID per execution and so never
 * contend with anything. A global workspace counter would be wrong in both
 * directions at once.
 *
 * UNKNOWN IS NOT ZERO
 *
 * A limit that cannot be read, an actor that cannot be resolved and a plan
 * whose consumption cannot be derived each close the gate. An unmeasured
 * resource and an empty one are different claims.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ── the limits, read from the service that enforces them ────────────────── */

const LIMITS_SOURCE = 'services/developer-api/internal/developer/limits.go';

/**
 * The live workspace limits.
 *
 * Read from the Go constants rather than restated here: a limit this file
 * declared would drift from the one that refuses, and the drift would be
 * invisible until a run died against the real number. Unreadable is UNKNOWN.
 */
export function workspaceLimits({ readSource = null } = {}) {
  let src;
  try {
    src = readSource ? readSource(LIMITS_SOURCE) : readFileSync(join(ROOT, LIMITS_SOURCE), 'utf8');
  } catch {
    return { verdict: 'UNKNOWN', detail: `cannot read ${LIMITS_SOURCE}` };
  }
  const active = src.match(/MaxActiveWorkspacesPerUser\s*=\s*(\d+)/);
  const created = src.match(/MaxWorkspacesCreatedPerDay\s*=\s*(\d+)/);
  if (!active || !created) {
    return { verdict: 'UNKNOWN', detail: `${LIMITS_SOURCE} no longer declares both limits` };
  }
  // The window is the limiter's own: WorkspaceCreationCounts is called with
  // time.Now().Add(-24*time.Hour). Read it rather than assume it.
  const window = src.match(/Add\(-(\d+)\s*\*\s*time\.Hour\)/);
  return {
    verdict: 'READ',
    activeLimit: Number(active[1]),
    creationLimit24h: Number(created[1]),
    windowHours: window ? Number(window[1]) : 24,
    source: LIMITS_SOURCE,
  };
}

/* ── who a creation is charged to ────────────────────────────────────────── */

/** The fixture actor tests/phase0/lib/synthetic-tenant.sh defaults to. */
export const SHARED_FIXTURE_ACTOR = '11111111-2222-4333-8444-555555555555';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/**
 * A value that is minted at execution time is a DIFFERENT actor every run.
 *
 * `e2e_ephemeral_actor` is the ONE canonical primitive (tests/phase0/lib/
 * e2e-run.sh); the raw kernel/uuidgen spellings are recognised too because a
 * harness that reintroduces one must still be classified correctly rather than
 * falling through to UNKNOWN and silently closing the gate on a false alarm.
 */
const MINTED = /e2e_ephemeral_actor|uuidgen|random\/uuid|randomUUID\s*\(/i;

/**
 * Resolve the actor a `created_by` reference names.
 *
 * An EPHEMERAL actor is generated per execution, so at gate time it has spent
 * nothing and holds nothing — but it is still subject to the same per-actor
 * limits, so it is modelled as an actor with zero usage rather than ignored.
 *
 * A reference this cannot resolve is UNKNOWN and closes the gate. Guessing
 * "probably the shared one" would be a plausible proxy standing in for a
 * measurement, which is the failure mode this whole programme is about.
 */
export function resolveActor(ref, src) {
  const name = String(ref ?? '').replace(/^\$\{?|\}?$/g, '').trim();
  if (!name) return { kind: 'UNKNOWN', ref, why: 'no created_by reference' };
  if (UUID.test(name)) return { kind: 'SHARED', id: name.match(UUID)[0].toLowerCase(), why: 'literal' };
  if (name === 'ST_ACTOR') {
    const override = src.match(/^\s*ST_ACTOR=([^\n]*)$/m);
    if (!override) return { kind: 'SHARED', id: SHARED_FIXTURE_ACTOR, why: 'synthetic-tenant default' };
    if (MINTED.test(override[1])) return { kind: 'EPHEMERAL', id: `ephemeral:${name}`, why: 'minted per run' };
    const lit = override[1].match(UUID);
    if (lit) return { kind: 'SHARED', id: lit[0].toLowerCase(), why: 'harness override' };
    return { kind: 'UNKNOWN', ref: name, why: 'ST_ACTOR overridden with something unreadable' };
  }
  // A shell or node assignment of the same name, anywhere in the harness.
  const assign = src.match(new RegExp(`^\\s*(?:const|let|var)?\\s*${name}\\s*=\\s*([^\\n]*)$`, 'm'));
  if (!assign) return { kind: 'UNKNOWN', ref: name, why: 'no assignment found' };
  if (MINTED.test(assign[1])) return { kind: 'EPHEMERAL', id: `ephemeral:${name}`, why: 'minted per run' };
  const lit = assign[1].match(UUID);
  if (lit) return { kind: 'SHARED', id: lit[0].toLowerCase(), why: 'literal' };
  return { kind: 'UNKNOWN', ref: name, why: `unreadable assignment: ${assign[1].trim().slice(0, 40)}` };
}

/* ── what running one harness costs ──────────────────────────────────────── */

/**
 * Does running this harness create Developer workspaces, how many, and whose?
 *
 * ONE definition, used by the plan, the readiness gate and the runner's final
 * enforcement — because two derivations of "what this will cost" is two chances
 * to disagree, and the application-submit classifier already proved that.
 *
 * Every workspace a validation harness creates arrives through exactly one
 * door: developer-api's CreateFixtureProject, which calls CreateWorkspace and
 * is therefore quota-checked per actor. Harnesses reach it either through
 * `synthetic_tenant` or by POSTing /internal/v1/fixture-projects directly, and
 * a harness may do both several times.
 *
 * PRECISION. This counts CALL SITES. A site inside a loop is one site and many
 * creations, so the count is a floor there — and a floor must never authorise
 * an execution. Loops around a creation site are therefore detected and
 * reported as UNKNOWN rather than counted, for the same reason the plan's
 * assertion estimate refuses to be read as a count.
 */
export function workspaceCost(harnessRelPath, src) {
  const sites = [];
  const unresolved = [];
  const lines = String(src ?? '').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line) || /^\s*\/\//.test(line)) continue;

    // `synthetic_tenant <label> …` — a Workspace, a Project, a key, a Business.
    if (/(^|[;&|]\s*)synthetic_tenant\s+\S/.test(line)) {
      sites.push({ line: i + 1, actor: resolveActor('ST_ACTOR', src), via: 'synthetic_tenant' });
      continue;
    }
    // A direct fixture-project POST. `retire` is the counterpart route and
    // creates nothing; matching it would charge a slot for giving one back.
    if (/\/internal\/v1\/fixture-projects(?![/\w-])/.test(line) && !/retire/.test(line)) {
      if (!/\bPOST\b/.test(line) && !/devInternal\s*\(/.test(line)) continue;
      const m = line.match(/created_by\\?["']?\s*:\s*\\?["']?([^"'\\,}\s]+)/);
      const actor = resolveActor(m ? m[1] : null, src);
      if (actor.kind === 'UNKNOWN') unresolved.push({ line: i + 1, why: actor.why });
      sites.push({ line: i + 1, actor, via: 'fixture-projects' });
    }
  }
  if (!sites.length) return null;

  // A creation site inside a loop is a floor, not a count.
  const looped = sites.filter((s) => insideLoop(lines, s.line - 1));
  return {
    harness: harnessRelPath,
    sites,
    unresolved,
    looped,
    precision: unresolved.length || looped.length ? 'UNKNOWN' : 'SITE_COUNT',
  };
}

/** Is this line inside a shell/JS loop body? Cheap, structural, conservative. */
function insideLoop(lines, idx) {
  let depth = 0;
  for (let i = idx; i >= 0 && i > idx - 40; i--) {
    const l = lines[i];
    if (/^\s*done\b|^\s*\}\s*$/.test(l)) depth++;
    if (/^\s*(for|while|until)\b/.test(l) || /\b(for|while)\s*\(/.test(l)) {
      if (depth === 0) return true;
      depth--;
    }
  }
  return false;
}

/* ── what running the whole plan costs, per actor ────────────────────────── */

/**
 * Per-actor workspace consumption for a profile's plan.
 *
 * `planned` is cumulative: every creation spends a slot in the rolling window
 * and archiving gives none of them back.
 *
 * `maxConcurrentAdditional` is NOT the same number, and deriving it from
 * `planned` would be the exact defect this module exists to prevent. It comes
 * from the EXECUTION MODEL:
 *
 *   the runner executes journeys one after another (a single loop over the
 *   plan — there is no concurrency in the executor), and
 *
 *   with the cleanup barrier armed (VD-009 / migration 0161) every journey is
 *   proven back at baseline before the next one starts, so at no instant is
 *   more than ONE journey's workspaces outstanding → the max per journey;
 *
 *   without the barrier a journey may leave its workspaces behind → the sum.
 *
 * This mirrors plannedPeakFunds exactly, and for the same reason: which bound
 * applies is a property of the RUNNER, never of the numbers.
 */
export function workspaceConsumption(plan, { readSource = null, barrier = false } = {}) {
  const read = readSource ?? ((rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : null));
  const byActor = new Map();
  const unknown = [];
  const inert = [];

  const bump = (id, kind, field, n) => {
    if (!byActor.has(id)) byActor.set(id, { actor: id, kind, planned: 0, perJourneyMax: 0, journeys: [] });
    byActor.get(id)[field] += n;
  };

  for (const p of plan) {
    const harness = p.harness ?? null;
    if (!harness) { inert.push(p.journey ?? '?'); continue; }
    let src;
    try { src = read(harness); } catch { src = null; }
    if (src === null || src === undefined) {
      // A harness the plan names and the tree does not have cannot execute; the
      // runner marks exactly these UNAVAILABLE. Zero here is derived from that
      // same property, not assumed from an absent file.
      inert.push(p.journey ?? harness);
      continue;
    }
    const cost = workspaceCost(harness, src);
    if (!cost) continue;
    if (cost.precision === 'UNKNOWN') {
      unknown.push(`${p.journey ?? harness}: ${cost.unresolved.map((u) => u.why).join('; ') ||
        `${cost.looped.length} creation site(s) inside a loop`}`);
      continue;
    }
    const perActor = new Map();
    for (const s of cost.sites) {
      const id = s.actor.kind === 'EPHEMERAL' ? `${s.actor.id}@${p.journey}` : s.actor.id;
      perActor.set(id, { kind: s.actor.kind, n: (perActor.get(id)?.n ?? 0) + 1 });
    }
    for (const [id, { kind, n }] of perActor) {
      bump(id, kind, 'planned', n);
      const rec = byActor.get(id);
      rec.kind = kind;
      rec.perJourneyMax = Math.max(rec.perJourneyMax, n);
      rec.journeys.push({ journey: p.journey ?? harness, creations: n });
    }
  }

  for (const rec of byActor.values()) {
    rec.maxConcurrentAdditional = barrier ? rec.perJourneyMax : rec.planned;
  }
  return { byActor, unknown, inert, barrier };
}

/* ── the reserve, from declared policy only ──────────────────────────────── */

const loadYaml = (rel) => JSON.parse(execFileSync('python3', [
  '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(ROOT, rel)], { encoding: 'utf8', maxBuffer: 1 << 24 }));

/**
 * The declared retry reserve for a profile.
 *
 * Policy only. A reserve derived from what happens to fit is not a reserve, and
 * a profile with no declared policy is UNKNOWN — which closes the gate rather
 * than defaulting to zero.
 */
export function retryReserve(profileID, { policy = null } = {}) {
  let doc;
  try { doc = policy ?? loadYaml('quality/validation/capacity-policy.yaml'); }
  catch { return { verdict: 'UNKNOWN', detail: 'capacity-policy.yaml is unreadable' }; }
  const entry = (doc.profiles ?? []).find((p) => p.id === profileID);
  const ws = entry?.workspace;
  if (!ws || !ws.retry_reserve_model) {
    return { verdict: 'UNKNOWN', detail: `no workspace retry policy declared for ${profileID}` };
  }
  const known = new Set((doc.models ?? []).map((m) => m.id));
  if (!known.has(ws.retry_reserve_model)) {
    return { verdict: 'UNKNOWN', detail: `unknown reserve model ${ws.retry_reserve_model}` };
  }
  const retries = ws.permitted_retries;
  if (!Number.isInteger(retries) || retries < 0) {
    return { verdict: 'UNKNOWN', detail: `permitted_retries is not a whole number for ${profileID}` };
  }
  return { verdict: 'DECLARED', model: ws.retry_reserve_model, permittedRetries: retries };
}

/** Apply the declared model to one actor's planned consumption. */
export function reserveFor(reserve, planned) {
  if (reserve.verdict !== 'DECLARED') return null;
  if (reserve.model === 'one_full_retry') return reserve.permittedRetries * planned;
  return null;
}

/* ── the two gates ───────────────────────────────────────────────────────── */

/**
 * The two families, named once. They are constants rather than literals at the
 * call sites for the same reason the Go side has them: one name for two
 * resources is how a run gets abandoned against a limit nobody was watching.
 */
export const FAMILY_ACTIVE = 'WORKSPACE_ACTIVE_CAPACITY';
export const FAMILY_CREATION = 'WORKSPACE_24H_CREATION_CAPACITY';

/**
 * ACTIVE: concurrency now, plus the most this run will hold at once.
 *
 * The run's own residual is NOT assumed to be cleaned: a reserve that assumed
 * cleanup would be assuming the cleanup of a run that just failed.
 */
export function activeHeadroom({ usage, consumption, limits, reserve }) {
  return perActor({ usage, consumption, limits, reserve,
    field: 'maxConcurrentAdditional', limitField: 'activeLimit', usedField: 'active',
    name: FAMILY_ACTIVE });
}

/**
 * 24H CREATION: everything created inside the window, plus this run, plus the
 * retry it earns. Archiving reduces none of it.
 */
export function creationHeadroom({ usage, consumption, limits, reserve }) {
  return perActor({ usage, consumption, limits, reserve,
    field: 'planned', limitField: 'creationLimit24h', usedField: 'created24h',
    name: FAMILY_CREATION });
}

function perActor({ usage, consumption, limits, reserve, field, limitField, usedField, name }) {
  if (limits.verdict !== 'READ') {
    return { name, verdict: 'CLOSED', reason: 'UNKNOWN_CAPACITY', detail: limits.detail, actors: [] };
  }
  if (consumption.unknown.length) {
    return { name, verdict: 'CLOSED', reason: 'UNKNOWN_CAPACITY',
      detail: `plan consumption not derivable: ${consumption.unknown.join(' | ')}`, actors: [] };
  }
  if (reserve.verdict !== 'DECLARED') {
    return { name, verdict: 'CLOSED', reason: 'UNKNOWN_CAPACITY', detail: reserve.detail, actors: [] };
  }
  const limit = limits[limitField];
  const actors = [];
  for (const rec of consumption.byActor.values()) {
    // An EPHEMERAL actor does not exist until the run mints it, so its usage is
    // zero BY DERIVATION — not by an unavailable reading defaulting to zero.
    const live = rec.kind === 'EPHEMERAL'
      ? { active: 0, created24h: 0, derived: true }
      : usage.get(rec.actor);
    if (!live) {
      return { name, verdict: 'CLOSED', reason: 'UNKNOWN_CAPACITY',
        detail: `no usage reading for actor ${rec.actor}`, actors };
    }
    const need = rec[field];
    // The reserve applies to the CUMULATIVE resource and to the concurrent one
    // alike: both ask what is left after this run fails and the retry runs.
    const res = reserveFor(reserve, field === 'planned' ? rec.planned : rec.maxConcurrentAdditional);
    const required = need + res;
    const used = live[usedField];
    const free = Math.max(0, limit - used);
    actors.push({
      actor: rec.actor, kind: rec.kind, used, limit, free,
      planned: rec.planned, maxConcurrentAdditional: rec.maxConcurrentAdditional,
      need, reserve: res, required, ok: free >= required,
      journeys: rec.journeys,
    });
  }
  const blocked = actors.filter((a) => !a.ok);
  return {
    name,
    verdict: blocked.length ? 'CLOSED' : 'OPEN',
    reason: blocked.length ? 'INSUFFICIENT_CAPACITY' : null,
    detail: blocked.length
      ? blocked.map((a) => `${short(a.actor)} free ${a.free} < required ${a.required} (${a.need}+${a.reserve})`).join(' | ')
      : actors.map((a) => `${short(a.actor)} ${a.free} free ≥ ${a.required} required`).join(' · ') || 'no actor consumes this resource',
    actors,
  };
}

const short = (a) => (a.startsWith('ephemeral:') ? a : `${a.slice(0, 8)}…`);

/* ── when, if closed, it would open on its own ───────────────────────────── */

/**
 * The earliest instant at which free ≥ required, assuming NOTHING else is
 * created. INFORMATIONAL ONLY — the window slides, and the number that governs
 * is the one read at the moment of the gate, not this forecast.
 */
export function earliestSufficient({ creations, used, limit, required, windowHours = 24 }) {
  const free = Math.max(0, limit - used);
  if (free >= required) return { already: true, at: null, releases: 0 };
  const need = required - free;
  const expiries = [...creations].sort()
    .map((t) => new Date(new Date(t).getTime() + windowHours * 3600 * 1000));
  if (expiries.length < need) return { already: false, at: null, releases: expiries.length, insufficient: true };
  return { already: false, at: expiries[need - 1].toISOString(), releases: need, nextAt: expiries[0]?.toISOString() ?? null };
}

/* ── live usage, per actor ───────────────────────────────────────────────── */

/**
 * What each actor currently holds and has spent, read with the LIMITER'S OWN
 * query (services/developer-api/internal/developer/store_pg.go,
 * WorkspaceCreationCounts) so the gate and the thing that refuses cannot
 * disagree about what a used slot is:
 *
 *   active   count(*) FILTER (WHERE status = 'ACTIVE')
 *   created  count(*) FILTER (WHERE created_at >= now() - 24h)
 *
 * Note what `created` does NOT filter on: status. Archiving a workspace changes
 * status and leaves created_at exactly where it was, which is the whole reason
 * these are two resources.
 *
 * `sql` is injected so this can be driven from a fixture in the selftest
 * without reaching the Sandbox.
 */
export function workspaceUsage({ sql, windowHours = 24 }) {
  const rows = sql(`
    SELECT created_by::text,
           count(*) FILTER (WHERE status = 'ACTIVE')::text,
           count(*) FILTER (WHERE created_at >= now() - interval '${windowHours} hours')::text,
           coalesce(string_agg(
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ','
             ORDER BY created_at) FILTER (WHERE created_at >= now() - interval '${windowHours} hours'), '')
      FROM developer.dev_workspaces
     GROUP BY created_by;`);
  const usage = new Map();
  for (const [actor, active, created, stamps] of rows) {
    usage.set(String(actor).toLowerCase(), {
      active: Number(active),
      created24h: Number(created),
      creations: stamps ? String(stamps).split(',').filter(Boolean) : [],
    });
  }
  return usage;
}

/**
 * An actor the plan names that the database has never seen has spent nothing —
 * a DERIVED zero, from a successful reading that returned no row, not an
 * unavailable measurement coerced to zero. The distinction is the difference
 * between `usage.get()` returning undefined because the query failed and
 * because the actor is new, and only one of those may proceed.
 */
export function withKnownActors(usage, consumption) {
  const out = new Map(usage);
  for (const rec of consumption.byActor.values()) {
    if (rec.kind === 'EPHEMERAL') continue;
    if (!out.has(rec.actor)) out.set(rec.actor, { active: 0, created24h: 0, creations: [], neverSeen: true });
  }
  return out;
}
