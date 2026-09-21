/**
 * What a journey OWNS, mapped to the financial accounts that carry its value.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase B3).
 *
 * B2 made ownership reach the runner. It did not make it mean anything: the
 * attribution engine resolved `consumers.handle` and nothing else, so
 * S06-COL-002 arrived with a perfectly good manifest, one owned BUSINESS, and
 * an exposure verdict of UNKNOWN. Thirty-three journeys declaring ownership
 * into a resolver that understands one resource type is thirty-two silences
 * with extra steps.
 *
 * THREE SCOPES, AND STRUCTURAL IS NOT UNKNOWN
 *
 *   FINANCIAL   contributes one or more authoritative ledger accounts
 *   STRUCTURAL  genuinely owned, genuinely carries no balance of its own
 *   UNKNOWN     financial relevance cannot be established — fails closed
 *
 * The difference between STRUCTURAL and UNKNOWN is the difference between "we
 * checked and it holds nothing" and "we do not know what this is". Collapsing
 * them would turn an unrecognised resource into a zero, which is the exact
 * shape of the defect this whole phase exists to remove.
 *
 * EVERY CLASSIFICATION BELOW WAS CHECKED AGAINST THE SCHEMA
 *
 * Not assumed from the name. api_keys, webhook endpoints and
 * merchant_applications have no account, wallet or available_account column at
 * all. payment_links and payment_sessions DO carry wallet_id /
 * wallet_account_id — and are still STRUCTURAL, because those columns point at
 * an account owned by the merchant or wallet_account resource beside them.
 * Resolving a link would count the merchant's wallet twice.
 *
 * THE UNIT IS THE ACCOUNT, NOT THE RECORD
 *
 * A journey that owns a BUSINESS and a MERCHANT resolving to one wallet holds
 * one balance, not two. A TEST_PAYER is keyed by consumer_id — verified: it is
 * the primary key of sandbox_test_payers — so a test payer and its backing
 * consumer are the same account and must be counted once. Deduplication
 * happens on the canonical account id, after resolution, never on the
 * ownership record before it.
 */

/**
 * The registry. One table, so the validator, the resolver and the reporter
 * cannot drift into three different opinions about what is ownable.
 *
 * `sql` is injected rather than imported, so every branch here is provable
 * without a database.
 */
export const RESOURCE_SCOPE = new Map([
  // ── FINANCIAL ────────────────────────────────────────────────────────────
  ['consumer', {
    scope: 'FINANCIAL',
    account: 'consumer_wallets.available_account_id',
    // Handle OR id: the app-web harnesses hand over a @banza, the shell ones
    // a uuid, and both are the same resource.
    // Echo back the key that MATCHED, not the row's own id. Returning c.id for
    // a manifest that named a handle made every consumer resolve to an account
    // and simultaneously count as unresolved — the accounts were right and the
    // verdict was UNKNOWN.
    query: (ids) => `SELECT DISTINCT
                            (CASE WHEN lower(c.handle) IN (${ids}) THEN lower(c.handle)
                                  ELSE c.id::text END),
                            cw.available_account_id::text
                       FROM consumers c
                       JOIN consumer_wallets cw ON cw.consumer_id = c.id
                      WHERE (lower(c.handle) IN (${ids}) OR c.id::text IN (${ids}))
                        AND cw.available_account_id IS NOT NULL`,
  }],
  ['business', {
    scope: 'FINANCIAL',
    account: 'wallets.available_account_id',
    query: (ids) => `SELECT DISTINCT w.merchant_id::text, w.available_account_id::text
                       FROM wallets w WHERE w.merchant_id::text IN (${ids})
                        AND w.available_account_id IS NOT NULL`,
  }],
  ['merchant', {
    scope: 'FINANCIAL',
    account: 'wallets.available_account_id',
    query: (ids) => `SELECT DISTINCT w.merchant_id::text, w.available_account_id::text
                       FROM wallets w WHERE w.merchant_id::text IN (${ids})
                        AND w.available_account_id IS NOT NULL`,
  }],
  ['test_payer', {
    scope: 'FINANCIAL',
    account: 'consumer_wallets.available_account_id',
    // sandbox_test_payers is keyed by consumer_id — checked, it is the table's
    // primary key. A test payer IS a consumer, so this resolves to the same
    // account as the CONSUMER record would and dedup does the rest.
    query: (ids) => `SELECT DISTINCT t.consumer_id::text, cw.available_account_id::text
                       FROM sandbox_test_payers t
                       JOIN consumer_wallets cw ON cw.consumer_id = t.consumer_id
                      WHERE t.consumer_id::text IN (${ids})
                        AND cw.available_account_id IS NOT NULL`,
  }],
  ['wallet_account', {
    scope: 'FINANCIAL',
    account: 'wallet_accounts.account_id',
    // Already a canonical financial identity: resolved directly, never bounced
    // through a name.
    query: (ids) => `SELECT DISTINCT wa.id::text, wa.account_id::text
                       FROM wallet_accounts wa WHERE wa.id::text IN (${ids})
                        AND wa.account_id IS NOT NULL`,
  }],
  ['fixture_project', {
    // CONDITIONALLY financial, and the condition is in the schema.
    //
    // A developer project is not a merchant — verified: a project id matches
    // developer.dev_project_sandbox_binding.project_id and matches
    // wallets.merchant_id zero times. Its value lives in the wallet its
    // Sandbox binding names.
    //
    // A project with NO binding never ran financial-setup: no merchant, no
    // wallet, and no way to hold funds. Classifying it FINANCIAL made three
    // journeys report UNKNOWN in BZV-20260921-0001 — S11-DEV-001, S11-DEV-002
    // and S13-WHK-001 each owned one unbound project, and "a financial
    // resource that mapped to no account" is what the resolver correctly said
    // about a resource that cannot have one.
    //
    // So the scope is asked of the binding, not assumed from the kind.
    // Unbound is STRUCTURAL: it contributes zero accounts, which is a
    // measurement, not an omission. Bound resolves through the binding — and
    // frequently to the SAME account as the BUSINESS owned beside it, which
    // account-level deduplication already handles.
    scope: 'CONDITIONAL',
    account: 'the wallet its Sandbox binding names, when it has one',
    /** Which of these ids are bound, answered by the schema. */
    condition: (ids) => `SELECT DISTINCT b.project_id::text
                           FROM developer.dev_project_sandbox_binding b
                           JOIN wallets w ON w.merchant_id = b.merchant_id
                          WHERE b.project_id::text IN (${ids})
                            AND w.available_account_id IS NOT NULL`,
    query: (ids) => `SELECT DISTINCT b.project_id::text, w.available_account_id::text
                       FROM developer.dev_project_sandbox_binding b
                       JOIN wallets w ON w.merchant_id = b.merchant_id
                      WHERE b.project_id::text IN (${ids})
                        AND w.available_account_id IS NOT NULL`,
  }],

  // ── STRUCTURAL ───────────────────────────────────────────────────────────
  // Owned, cleaned up, kept in validation_run_resources for provenance and
  // orphan detection. They contribute zero accounts, which is a measurement,
  // not an omission.
  ['fixture_workspace', { scope: 'STRUCTURAL', why: 'a workspace holds no wallet; its projects do' }],
  ['fixture_key', { scope: 'STRUCTURAL', why: 'api_keys has no account, wallet or available_account column' }],
  ['webhook_endpoint', { scope: 'STRUCTURAL', why: 'no financial column on the endpoint tables' }],
  ['merchant_application', { scope: 'STRUCTURAL', why: 'merchant_applications carries no account column' }],
  ['payment_link', { scope: 'STRUCTURAL', why: 'its wallet_id points at the merchant wallet owned beside it; resolving both would double-count' }],
  ['payment_session', { scope: 'STRUCTURAL', why: 'its wallet_account_id points at an account owned as wallet_account or via the merchant' }],
  ['rail_state', { scope: 'STRUCTURAL', why: 'external rail configuration, not a balance' }],
]);

/** The scope of a kind, or UNKNOWN for one nothing has classified. */
export function scopeOf(kind) {
  return RESOURCE_SCOPE.get(String(kind).toLowerCase())?.scope ?? 'UNKNOWN';
}

/** Kinds that MAY be financial — for static readiness, where instances are unknown. */
export const mayBeFinancial = (kind) => ['FINANCIAL', 'CONDITIONAL'].includes(scopeOf(kind));

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

/**
 * Resolve a manifest to the set of accounts whose balances ARE this journey's
 * exposure.
 *
 * Returns UNKNOWN rather than a number whenever anything is unclassified or a
 * FINANCIAL resource cannot be mapped: a resolver that quietly drops what it
 * does not understand reports a smaller exposure than the truth, which is the
 * one direction a safety bound must never fail in.
 */
export function resolveFinancialAccounts(owned, { sql }) {
  const byKind = new Map();
  const conditional = new Map();
  const unknownKinds = [];
  const structural = [];
  for (const r of owned ?? []) {
    const kind = String(r.kind).toLowerCase();
    const spec = RESOURCE_SCOPE.get(kind);
    if (!spec) { unknownKinds.push({ kind, id: r.id }); continue; }
    if (spec.scope === 'STRUCTURAL') { structural.push({ kind, id: r.id }); continue; }
    // CONDITIONAL kinds are sorted below, once the schema has been asked which
    // instances actually carry an account.
    if (spec.scope === 'CONDITIONAL') {
      if (!conditional.has(kind)) conditional.set(kind, new Set());
      conditional.get(kind).add(String(r.id).toLowerCase());
      continue;
    }
    if (!byKind.has(kind)) byKind.set(kind, new Set());
    byKind.get(kind).add(String(r.id).toLowerCase());
  }

  // Ask the schema which CONDITIONAL instances are financial. The ones that
  // are join the financial set; the ones that are not are structural — and
  // saying so is a measurement, not a shrug.
  for (const [kind, ids] of conditional) {
    const spec = RESOURCE_SCOPE.get(kind);
    const list = [...ids].map(lit).join(',');
    let bound;
    try { bound = new Set(sql(spec.condition(list)).map(([id]) => String(id).toLowerCase())); }
    catch (e) { return unknownResult(`could not establish whether ${kind} is financial: ${String(e.message).slice(0, 100)}`, { structural, unknownKinds }); }
    for (const id of ids) {
      if (bound.has(id)) {
        if (!byKind.has(kind)) byKind.set(kind, new Set());
        byKind.get(kind).add(id);
      } else {
        structural.push({ kind, id, why: 'no Sandbox binding: it never ran financial-setup and cannot hold funds' });
      }
    }
  }

  const accounts = new Set();
  const resolved = [];
  const unresolved = [];
  for (const [kind, ids] of byKind) {
    const spec = RESOURCE_SCOPE.get(kind);
    const list = [...ids].map(lit).join(',');
    let rows;
    try { rows = sql(spec.query(list)); }
    catch (e) { return unknownResult(`resolving ${kind}: ${String(e.message).slice(0, 120)}`, { structural, unknownKinds }); }
    const seen = new Set();
    for (const [resourceID, accountID] of rows) {
      if (!accountID) continue;
      seen.add(String(resourceID).toLowerCase());
      accounts.add(accountID);
      resolved.push({ kind, id: resourceID, account: accountID });
    }
    // A FINANCIAL resource that resolves to nothing is UNKNOWN, not zero. It
    // may have been retired, or it may be a kind whose join is wrong — and
    // those two look identical from here, so neither may be assumed.
    for (const id of ids) {
      const hit = resolved.some((x) => x.kind === kind && String(x.id).toLowerCase() === id)
        || seen.has(id);
      if (!hit) unresolved.push({ kind, id });
    }
  }

  if (unknownKinds.length || unresolved.length) {
    const parts = [];
    if (unknownKinds.length) parts.push(`${unknownKinds.length} unclassified resource type(s): ${[...new Set(unknownKinds.map((u) => u.kind))].join(',')}`);
    if (unresolved.length) parts.push(`${unresolved.length} financial resource(s) mapped to no account: ${unresolved.map((u) => `${u.kind}`).join(',')}`);
    return unknownResult(parts.join('; '), { structural, unknownKinds, unresolved, accounts: [...accounts], resolved });
  }

  return {
    verdict: 'RESOLVED',
    accounts: [...accounts],
    resolved,
    structural,
    unresolved: [],
    unknownKinds: [],
    counts: {
      owned: (owned ?? []).length,
      financial: resolved.length,
      structural: structural.length,
      unknown: 0,
      accounts: accounts.size,
    },
    detail: `${accounts.size} account(s) from ${resolved.length} financial resource(s); ${structural.length} structural`,
  };
}

function unknownResult(detail, extra = {}) {
  const accounts = extra.accounts ?? [];
  return {
    verdict: 'UNKNOWN',
    accounts,
    resolved: extra.resolved ?? [],
    structural: extra.structural ?? [],
    unresolved: extra.unresolved ?? [],
    unknownKinds: extra.unknownKinds ?? [],
    counts: {
      owned: (extra.resolved?.length ?? 0) + (extra.structural?.length ?? 0) + (extra.unknownKinds?.length ?? 0),
      financial: extra.resolved?.length ?? 0,
      structural: extra.structural?.length ?? 0,
      unknown: (extra.unknownKinds?.length ?? 0) + (extra.unresolved?.length ?? 0),
      accounts: accounts.length,
    },
    detail,
  };
}

/* ── COMPLETENESS ─────────────────────────────────────────────────────────── */

/**
 * Is the manifest COMPLETE, or merely resolvable?
 *
 * B3 proved every declared resource can be priced. It could not prove that
 * everything worth pricing was declared, and those are different claims.
 * S23-RAIL-001 is the proof that the difference matters: its manifest listed a
 * project and a consumer, every entry resolved perfectly, and 1 200 000 minor
 * sat in a test payer nobody had handed over. A perfectly resolvable manifest
 * reported a peak that was missing its largest component.
 *
 * So completeness is asked of the DATABASE, not of the manifest — the manifest
 * cannot testify to what it omits. For each owned CONTAINER the schema is
 * asked what fundable things belong to it, and anything it names that the
 * manifest does not is a gap.
 *
 * The probes below come from relationships verified against the live schema:
 * sandbox_test_payers.project_id, and wallet_accounts.merchant_id. Names and
 * prefixes are not consulted anywhere.
 */
const COMPLETENESS_PROBES = [
  {
    // A test payer belongs to a project, and is granted on creation.
    container: 'fixture_project',
    missingKind: 'test_payer',
    query: (ids, since) => `SELECT DISTINCT t.consumer_id::text, t.project_id::text
                              FROM sandbox_test_payers t
                             WHERE t.project_id::text IN (${ids})
                               ${since ? `AND t.created_at >= ${since}` : ''}`,
  },
  // A SEGREGATED account belongs to a merchant and holds value of its own.
  //
  // PRIMARY is excluded, and the exclusion is measured rather than assumed:
  // across the live Sandbox, all 1211 PRIMARY wallet_accounts have
  // account_id = wallets.available_account_id — they ARE the wallet's account,
  // so owning the business already attributes them. All 382 CAMPAIGN, and the
  // RESERVE and STORE accounts, carry a DIFFERENT account and are separately
  // fundable. S10's campaign accounts are exactly that case.
  //
  // Demanding a PRIMARY be declared separately was this probe's own false
  // positive: it reported S06-COL-002 INCOMPLETE for failing to hand over an
  // account its BUSINESS declaration already resolved to.
  ...['merchant', 'business'].map((container) => ({
    container,
    missingKind: 'wallet_account',
    query: (ids, since) => `SELECT DISTINCT wa.id::text, wa.merchant_id::text
                              FROM wallet_accounts wa
                              JOIN wallets w ON w.id = wa.wallet_id
                             WHERE wa.merchant_id::text IN (${ids})
                               AND wa.account_id IS DISTINCT FROM w.available_account_id
                               ${since ? `AND wa.created_at >= ${since}` : ''}`,
  })),
];

export function ownershipCompleteness(owned, { sql, since = null } = {}) {
  const have = new Set((owned ?? []).map((r) => `${String(r.kind).toLowerCase()}:${String(r.id).toLowerCase()}`));
  const haveIds = new Set((owned ?? []).map((r) => String(r.id).toLowerCase()));
  const byKind = new Map();
  for (const r of owned ?? []) {
    const k = String(r.kind).toLowerCase();
    if (!byKind.has(k)) byKind.set(k, new Set());
    byKind.get(k).add(String(r.id).toLowerCase());
  }

  const missing = [];
  for (const probe of COMPLETENESS_PROBES) {
    const ids = byKind.get(probe.container);
    if (!ids?.size) continue;
    const list = [...ids].map(lit).join(',');
    let rows;
    try { rows = sql(probe.query(list, since ? lit(since) : null)); }
    catch (e) {
      return { verdict: 'UNKNOWN', missing: [],
               detail: `could not probe ${probe.container} for ${probe.missingKind}: ${String(e.message).slice(0, 100)}` };
    }
    for (const [id, container] of rows) {
      const ref = String(id).toLowerCase();
      // A test payer IS a consumer, so owning it under either kind counts.
      if (have.has(`${probe.missingKind}:${ref}`) || haveIds.has(ref)) continue;
      missing.push({ kind: probe.missingKind, id, container, containerKind: probe.container });
    }
  }

  if (missing.length) {
    return {
      verdict: 'INCOMPLETE', missing,
      detail: `${missing.length} created resource(s) the manifest never declared: ` +
        missing.map((m) => `${m.kind} under ${m.containerKind} ${String(m.container).slice(0, 8)}…`).join(', '),
    };
  }
  return { verdict: 'VERIFIED', missing: [], detail: 'every fundable resource the schema attributes to an owned container is declared' };
}
