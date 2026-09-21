/**
 * Attributable funded exposure — the maximum a journey's OWN resources ever
 * held at the same moment.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * WHY NOT THE FINAL BALANCE
 *
 * S05-LNK-002 registers a consumer, which the Sandbox grants 1 000 000 minor,
 * and the journey then spends 350 000 of it. Its historical residual was
 * 650 000. Reading the final balance as the peak would report 650 000 for a
 * journey that held 1 000 000 — and would pass a declaration of 700 000 that
 * the journey actually breached.
 *
 * WHY NOT THE SUM OF PER-RESOURCE MAXIMA
 *
 * A journey with two fixtures that each peak at 1 000 000, an hour apart,
 * never held 2 000 000. Summing maxima invents concurrency. What the shared
 * 50 000 000 cap cares about is how much was outstanding AT ONCE.
 *
 * SO: sum across resources at every authoritative event boundary, and take the
 * maximum of those sums. An event boundary is any moment a balance changed —
 * a grant, a funding, a payment in or out, a retirement posting.
 *
 * GLOBAL IS A DIFFERENT NUMBER
 *
 * The aggregate samples in validation_run_funds_samples protect the shared
 * cap and move with unrelated Sandbox traffic — this Sandbox also carries
 * DOA's production. That must never make a journey look under-declared, which
 * is why declaration enforcement uses THIS number and not that one.
 */

/**
 * @param {Array<{resource: string, at: number|string, delta: number}>} events
 *        Signed balance changes. `at` is a timestamp; ties are resolved by
 *        applying every event at the same instant before measuring, so a
 *        transfer between two owned resources never shows a phantom spike.
 * @returns {{peak: number, resources: number, events: number, timeline: Array}}
 */
export function attributablePeak(events) {
  const rows = [...events].map((e, i) => ({
    ...e,
    t: new Date(e.at).getTime(),
    // Financial atomicity, where the ledger can tell us: both legs of a
    // posting land together or the transfer reads as an arrival with no
    // departure. Falling back to the timestamp keeps the old behaviour for
    // callers that cannot supply one.
    group: e.posting != null ? `p:${e.posting}` : `t:${new Date(e.at).getTime()}`,
    seq: e.seq != null ? Number(e.seq) : i,
  }));
  if (rows.some((r) => !Number.isFinite(r.t))) throw new Error('attributablePeak: unreadable event timestamp');
  // Deterministic: time, then posting, then the authoritative sequence. Two
  // runs over the same events must produce the same peak, or the number is not
  // evidence.
  rows.sort((a, b) => a.t - b.t || (a.group < b.group ? -1 : a.group > b.group ? 1 : 0) || a.seq - b.seq);

  // AMBIGUITY, reported rather than hidden. Distinct postings sharing an
  // instant are applied in group order here; if the caller has no authoritative
  // sequence, that order is this function's choice and not the ledger's, and a
  // transient peak between them could be an artefact either way.
  const perInstant = new Map();
  for (const r of rows) {
    if (!perInstant.has(r.t)) perInstant.set(r.t, []);
    perInstant.get(r.t).push(r);
  }
  // An instant is ambiguous when more than one event lands on it and we cannot
  // tell whether they are one posting or several. WITHOUT posting ids that is
  // exactly the unknowable case: two legs of a transfer and two unrelated
  // movements look identical, and grouping them either way is an assumption.
  // Collapsing them silently would hide a real transient peak; splitting them
  // silently would invent one.
  const ambiguousInstants = [...perInstant.values()].filter((evs) =>
    evs.length > 1 && (evs.some((e) => e.posting == null)
                       || new Set(evs.map((e) => e.group)).size > 1)).length;
  const ordering = ambiguousInstants === 0 ? 'DETERMINISTIC' : 'AMBIGUOUS';

  const balance = new Map();
  const timeline = [];
  let peak = 0;
  let peakAt = null, peakGroup = null, peakAccounts = null;
  let i = 0;
  while (i < rows.length) {
    const g = rows[i].group;
    const t = rows[i].t;
    // Apply EVERY event of this posting before measuring. Otherwise moving
    // 100 from one owned resource to another reads as a momentary +100.
    while (i < rows.length && rows[i].group === g) {
      const r = rows[i];
      balance.set(r.resource, (balance.get(r.resource) ?? 0) + Number(r.delta));
      i++;
    }
    let sum = 0;
    for (const v of balance.values()) sum += v;
    timeline.push({ at: new Date(t).toISOString(), concurrent: sum });
    if (sum > peak) {
      peak = sum;
      peakAt = new Date(t).toISOString();
      peakGroup = g;
      peakAccounts = [...balance.entries()].filter(([, v]) => v !== 0).map(([k, v]) => ({ account: k, balance: v }));
    }
  }
  return {
    peak, resources: balance.size, events: rows.length, timeline,
    ordering, ambiguousInstants,
    // Provenance: enough to reconstruct the number without rerunning anything.
    peakAt, peakGroup, peakAccounts: peakAccounts ?? [], totalAtPeak: peak,
  };
}

/**
 * The declaration is a pre-execution conservative upper bound. Runtime
 * validates it; runtime never redefines it — raising a declaration to match
 * what was observed turns the bound into a record of the past.
 */
export function exposureVerdict({ declared, actual, ownershipKnown = true, fundingCapable = true }) {
  if (!fundingCapable) return { verdict: 'VERIFIED', detail: 'journey creates no funded resource' };
  if (!ownershipKnown) {
    return { verdict: 'UNKNOWN', detail: 'ownership of the journey\'s resources could not be established' };
  }
  if (typeof declared !== 'number' || !Number.isFinite(declared)) {
    return { verdict: 'UNKNOWN', detail: 'the journey declares no funded-exposure bound' };
  }
  if (typeof actual !== 'number' || !Number.isFinite(actual)) {
    return { verdict: 'UNKNOWN', detail: 'no attributable exposure could be measured' };
  }
  if (actual > declared) {
    return {
      verdict: 'UNDER_DECLARED',
      detail: `held ${actual.toLocaleString('pt-PT')} minor at peak against a declared bound of ${declared.toLocaleString('pt-PT')}`,
    };
  }
  return {
    verdict: 'VERIFIED',
    detail: `peak ${actual.toLocaleString('pt-PT')} within the declared ${declared.toLocaleString('pt-PT')}`,
  };
}
