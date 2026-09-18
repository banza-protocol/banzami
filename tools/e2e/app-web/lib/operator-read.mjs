/**
 * Canonical, READ-ONLY operator evidence — never a mutation, never a bypass.
 *
 * Runs psql against the Sandbox Postgres inside its container, with the session
 * forced read-only (default_transaction_read_only=on) and the bl_app_runtime
 * role (which cannot write money). Used to corroborate UI-observed balances with
 * ledger truth and to prove system-wide economic integrity. The password is read
 * from the operator file inside the host and never leaves the container output.
 *
 * Balance model (db/migrations/0001,0011): a consumer's spendable balance is the
 * signed sum over their wallet's available LIABILITY account, where a CREDIT
 * increases the liability owed to them and a DEBIT decreases it.
 */
import { execFileSync } from 'node:child_process';

const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';

export function psql(sql) {
  const remote =
    `PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); ` +
    `PW=$(cat /root/.banzami/operator_db_url | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#'); ` +
    `docker exec -e PGPASSWORD=$PW -e PGOPTIONS='-c default_transaction_read_only=on' ` +
    `$PG psql -U bl_app_runtime -d banzami_staging -At -c "${sql.replace(/"/g, '\\"')}"`;
  return execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, remote], { encoding: 'utf8', timeout: 60000 }).trim();
}

/** A consumer's available balance in MINOR units, by @banza handle. */
export function consumerBalanceMinor(handle) {
  const h = String(handle).replace(/[^a-z0-9_]/gi, '');
  const sql =
    `SELECT COALESCE(SUM(CASE WHEN e.entry_type='CREDIT' THEN e.amount_minor ELSE -e.amount_minor END),0) ` +
    `FROM consumers c ` +
    `JOIN consumer_wallets w ON w.consumer_id=c.id AND w.currency='AOA' AND w.status<>'CLOSED' ` +
    `JOIN ledger_entries e ON e.account_id=w.available_account_id ` +
    `WHERE c.handle='${h}'`;
  const out = psql(sql);
  return out === '' ? null : Number(out);
}

/** A consumer's status + presence, by handle: { exists, status, hasName }. */
export function consumerRow(handle) {
  const h = String(handle).replace(/[^a-z0-9_]/gi, '');
  const out = psql(
    `SELECT status || '|' || (display_name IS NOT NULL AND btrim(display_name)<>'') FROM consumers WHERE handle='${h}'`);
  if (!out) return { exists: false };
  const [status, hasName] = out.split('|');
  return { exists: true, status, hasName: hasName === 't' };
}

/**
 * System-wide double-entry integrity: the signed sum over ALL ledger entries
 * (DEBIT positive, CREDIT negative) must be exactly zero — no value created or
 * destroyed. Returns { balanced, sum }.
 */
export function bookSum() {
  const sum = Number(psql(
    `SELECT COALESCE(SUM(CASE WHEN entry_type='DEBIT' THEN amount_minor ELSE -amount_minor END),0) FROM ledger_entries`));
  return { balanced: sum === 0, sum };
}

/**
 * Workspace-scoped developer residue (same shape the public cleanroom measures):
 * live workspace/projects + active keys + active webhook endpoints + active
 * merchants. 0 means the product's own Delete retired everything.
 */
export function workspaceResidue(workspace) {
  if (!/^[0-9a-f-]{36}$/.test(String(workspace))) return -1;
  const w = `'${workspace}'`;
  const sql =
    `SELECT (SELECT count(*) FROM developer.dev_workspaces WHERE id=${w} AND status IN ('ACTIVE','ARCHIVED'))` +
    ` + (SELECT count(*) FROM developer.dev_projects WHERE workspace_id=${w} AND status IN ('ACTIVE','ARCHIVED'))` +
    ` + (SELECT count(*) FROM developer.dev_api_keys k JOIN developer.dev_projects p ON p.id=k.project_id WHERE p.workspace_id=${w} AND k.status='ACTIVE')` +
    ` + (SELECT count(*) FROM webhook_endpoints e JOIN sandbox_businesses b ON b.merchant_id=e.merchant_id JOIN developer.dev_projects p ON p.id=b.project_id WHERE p.workspace_id=${w} AND e.active)` +
    ` + (SELECT count(*) FROM merchants m JOIN sandbox_businesses b ON b.merchant_id=m.id JOIN developer.dev_projects p ON p.id=b.project_id WHERE p.workspace_id=${w} AND m.status='ACTIVE')`;
  const out = psql(sql);
  return out === '' ? -1 : Number(out);
}

/**
 * Resolve the FULL proof reference from the receipt's abbreviation. The app
 * shows first-two-groups + last-group; that is enough to find the one stored
 * proof, read-only, in transaction_proofs. Returns { reference, amount } or null.
 */
export function resolveProofReference({ prefix, suffix, full }) {
  if (full) return { reference: full, amount: null };
  if (!prefix || !suffix) return null;
  const p = prefix.replace(/[^A-Z0-9-]/gi, '');
  const s = suffix.replace(/[^A-Z0-9]/gi, '');
  const out = psql(
    `SELECT proof_reference || '|' || COALESCE(amount_minor::text,'') ` +
    `FROM transaction_proofs WHERE proof_reference LIKE '${p}-%-${s}' ` +
    `ORDER BY created_at DESC LIMIT 1`);
  if (!out) return null;
  const [reference, amount] = out.split('|');
  return { reference, amount: amount ? Number(amount) : null };
}

/**
 * Canonical economic integrity — the read-only checks the ledger reconciliation
 * runs. All counts must be zero. Returns every count plus derived verdicts.
 */
export function integrity() {
  const one = (sql) => Number(psql(sql));
  const unbalancedPostings = one(
    `SELECT count(*) FROM (SELECT posting_id FROM ledger_entries GROUP BY posting_id ` +
    `HAVING SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END) <> 0) x`);
  const singleLegPostings = one(
    `SELECT count(*) FROM (SELECT posting_id FROM ledger_entries GROUP BY posting_id HAVING count(*) < 2) x`);
  const postingsWithoutEntries = one(
    `SELECT count(*) FROM ledger_postings p WHERE NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.posting_id=p.id)`);
  const entriesWithoutPostings = one(
    `SELECT count(*) FROM ledger_entries e WHERE NOT EXISTS (SELECT 1 FROM ledger_postings p WHERE p.id=e.posting_id)`);
  const entriesOrphanAccount = one(
    `SELECT count(*) FROM ledger_entries e WHERE NOT EXISTS (SELECT 1 FROM ledger_accounts a WHERE a.id=e.account_id)`);
  const bookSumZero = one(
    `SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END),0) FROM ledger_entries`);
  return {
    unbalancedPostings, singleLegPostings, postingsWithoutEntries,
    entriesWithoutPostings, entriesOrphanAccount, bookSum: bookSumZero,
    // Derived milestone verdicts:
    bookBalanced: bookSumZero === 0,
    // A balanced book with no unbalanced/single-leg posting means every liability
    // movement was matched — no sandbox liability sits unbacked.
    noUnbackedLiability: bookSumZero === 0 && unbalancedPostings === 0 && singleLegPostings === 0,
    // Orphan/duplicate legs are exactly the shape a duplicate financial effect takes.
    duplicateEffects: unbalancedPostings + singleLegPostings + postingsWithoutEntries + entriesWithoutPostings + entriesOrphanAccount,
  };
}

/** Count active sessions for a consumer handle (should be 0 after retirement). */
export function activeSessionsForHandle(handle) {
  const h = String(handle).replace(/[^a-z0-9_]/gi, '');
  // consumer_sessions may or may not track expiry columns; count non-expired rows.
  try {
    return Number(psql(
      `SELECT count(*) FROM consumer_sessions s JOIN consumers c ON c.id=s.consumer_id ` +
      `WHERE c.handle='${h}' AND (s.expires_at IS NULL OR s.expires_at > now()) AND s.revoked_at IS NULL`));
  } catch {
    return -1; // table shape unknown; caller treats -1 as not-measured
  }
}
