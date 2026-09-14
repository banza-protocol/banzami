/**
 * What every ACTIVE Business on the Public Sandbox is, decided from structure.
 *
 * On 2026-09-14 the residue scanner reported "synthetic merchants active 0" and
 * the canonical-resource gate "0 unclassified" while 165 ACTIVE synthetic test
 * Businesses stood behind archived harness Projects. The scanner matched
 * Businesses by display name and e-mail shape, and the self-service shape
 * (`Sandbox · <project name>`, ADR-060) was not on its list; the gate did not
 * look at Businesses at all. Each tool was blind to a class it claimed to
 * cover, and both agreed with each other rather than with the database.
 *
 * So the class is read from evidence, never from the name:
 *
 *   synthetic            merchant_compliance.kyb_status = SANDBOX_SYNTHETIC and a
 *                        sandbox_businesses row — Core provisioned it for a
 *                        Project's Financial Setup; nobody reviewed it
 *   live project         an ACTIVE binding from an ACTIVE Project
 *   project authority    ACTIVE developer keys on any Project bound to it or owning it
 *
 * and every ACTIVE Business ends in exactly one class:
 *
 *   CANONICAL             declared in ops/canonical-resources.yaml AND bound to a
 *                         live Project that is itself declared — a declaration
 *                         cannot make residue canonical
 *   SYNTHETIC_RETIREABLE  synthetic, no live project, no project authority,
 *                         owning Project ARCHIVED / DELETING / DELETED
 *   UNCLASSIFIED          anything else — a failure, never a silent survivor
 *
 * The only way to retire a SYNTHETIC_RETIREABLE Business is Core's own Project
 * retirement (POST /internal/v1/sandbox/projects/retire), which closes its value
 * through balanced postings.
 */
import { execFileSync } from 'node:child_process';

/** One JSON array: evidence for every ACTIVE merchant (or the ids given). */
export function businessEvidenceSql({ ids } = {}) {
  const only = ids?.length ? `AND m.id IN (${ids.map((id) => `'${uuid(id)}'`).join(',')})` : '';
  return `
SELECT coalesce(json_agg(x ORDER BY x.created_at), '[]'::json)::jsonb::text FROM (
  SELECT m.id AS business_id, m.name, m.status, m.created_at,
         c.kyb_status,
         sb.project_id AS owner_project_id, op.status AS owner_project_status, op.workspace_id AS owner_workspace_id,
         (c.kyb_status = 'SANDBOX_SYNTHETIC' AND sb.project_id IS NOT NULL) AS synthetic,
         EXISTS (SELECT 1 FROM developer.dev_project_sandbox_binding b JOIN developer.dev_projects p ON p.id = b.project_id
                  WHERE b.merchant_id = m.id AND b.state = 'ACTIVE' AND p.status = 'ACTIVE') AS live_binding,
         coalesce((SELECT array_agg(DISTINCT p.name) FROM developer.dev_project_sandbox_binding b JOIN developer.dev_projects p ON p.id = b.project_id
                    WHERE b.merchant_id = m.id AND b.state = 'ACTIVE' AND p.status = 'ACTIVE'), '{}') AS live_projects,
         (SELECT count(*) FROM developer.dev_api_keys k
           WHERE k.status = 'ACTIVE' AND (k.project_id = sb.project_id
              OR k.project_id IN (SELECT b.project_id FROM developer.dev_project_sandbox_binding b WHERE b.merchant_id = m.id))) AS active_keys,
         (SELECT count(*) FROM webhook_endpoints e WHERE e.merchant_id = m.id AND e.active) AS active_webhooks,
         (SELECT count(*) FROM sandbox_test_payers t
           WHERE t.retired_at IS NULL AND (t.project_id = sb.project_id
              OR t.project_id IN (SELECT b.project_id FROM developer.dev_project_sandbox_binding b WHERE b.merchant_id = m.id))) AS unretired_payers,
         coalesce((SELECT sum(abs(bal)) FROM (
            SELECT (SELECT coalesce(sum(CASE e.entry_type WHEN 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END), 0)
                      FROM ledger_entries e WHERE e.account_id = a.account_id) AS bal
              FROM (SELECT available_account_id AS account_id FROM wallets WHERE merchant_id = m.id
                    UNION SELECT reserved_account_id FROM wallets WHERE merchant_id = m.id
                    UNION SELECT account_id FROM wallet_accounts WHERE merchant_id = m.id) a) v), 0) AS value_minor,
         EXISTS (SELECT 1 FROM sandbox_retired_projects r WHERE r.project_id = sb.project_id) AS core_retired
    FROM merchants m
    LEFT JOIN merchant_compliance c ON c.merchant_id = m.id
    LEFT JOIN sandbox_businesses sb ON sb.merchant_id = m.id
    LEFT JOIN developer.dev_projects op ON op.id = sb.project_id
   WHERE m.status = 'ACTIVE' ${only}
) x`;
}

const RETIRED_PROJECT_STATES = new Set(['ARCHIVED', 'DELETING', 'DELETED']);

/**
 * @param row evidence row from businessEvidenceSql
 * @param canonical { businesses: Set<string>, projects: Set<string> } — names declared in ops/canonical-resources.yaml
 * @returns {{ class: 'CANONICAL'|'SYNTHETIC_RETIREABLE'|'UNCLASSIFIED', reason: string }}
 */
export function classifyBusiness(row, canonical) {
  const declared = canonical.businesses.has(row.name);
  const liveDeclared = (row.live_projects ?? []).some((p) => canonical.projects.has(p));
  if (declared && row.live_binding && liveDeclared) {
    return { class: 'CANONICAL', reason: `declared, bound to declared live project ${(row.live_projects ?? []).join(', ')}` };
  }
  if (declared) {
    return { class: 'UNCLASSIFIED', reason: 'declared canonical but not bound to a declared live Project — a declaration does not make residue canonical' };
  }
  if (row.synthetic && !row.live_binding && Number(row.active_keys) === 0 && RETIRED_PROJECT_STATES.has(row.owner_project_status)) {
    return { class: 'SYNTHETIC_RETIREABLE', reason: `synthetic, owning Project ${row.owner_project_status}, no live Project, no active key` };
  }
  const why = !row.synthetic ? 'not a synthetic Sandbox Business and not declared'
    : row.live_binding ? `synthetic but bound to a live Project that is not declared (${(row.live_projects ?? []).join(', ')})`
    : Number(row.active_keys) > 0 ? `synthetic with ${row.active_keys} active key(s)`
    : `synthetic with owning Project ${row.owner_project_status ?? 'missing'}`;
  return { class: 'UNCLASSIFIED', reason: why };
}

/** The invariants a Business must satisfy, at the moment of retirement, to be retired automatically. */
export function retirementEligibility(row, canonical) {
  const failures = [];
  const c = classifyBusiness(row, canonical);
  if (row.status !== 'ACTIVE') failures.push(`status ${row.status}`);
  if (c.class !== 'SYNTHETIC_RETIREABLE') failures.push(`class ${c.class}: ${c.reason}`);
  if (!row.synthetic) failures.push('not synthetic');
  if (canonical.businesses.has(row.name)) failures.push('declared canonical');
  if (row.live_binding) failures.push('live Project binding');
  if (Number(row.active_keys) !== 0) failures.push(`${row.active_keys} active key(s)`);
  if (!row.owner_project_id) failures.push('no owning Project');
  if (!RETIRED_PROJECT_STATES.has(row.owner_project_status)) failures.push(`owning Project ${row.owner_project_status}`);
  return { eligible: failures.length === 0, failures };
}

/** The names each section of ops/canonical-resources.yaml declares. */
export function declaredNames(yamlText, section) {
  const body = yamlText.split(new RegExp(`\\n${section}:\\n`))[1];
  if (body === undefined) return null;
  const stop = body.search(/\n[a-z_]+:\n/);
  const chunk = stop === -1 ? body : body.slice(0, stop);
  return `\n${chunk}`.split(/\n {2}- /).slice(1).map((e) => /^resource:\s*(.+)/.exec(e)?.[1]?.trim()).filter(Boolean);
}

export function canonicalSets(yamlText) {
  return {
    businesses: new Set(declaredNames(yamlText, 'businesses') ?? []),
    projects: new Set(declaredNames(yamlText, 'projects') ?? []),
  };
}

export function uuid(v) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(v))) throw new Error(`not an id: ${String(v).slice(0, 40)}`);
  return v;
}

/** Read-only query on the deployed Sandbox, as the operator role, over one ssh call. */
export function readSandbox(sql, remote = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248') {
  const psql = "PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); "
    + "PW=$(sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#' /root/.banzami/operator_db_url); "
    + "docker exec -i -e PGPASSWORD=\"$PW\" -e PGOPTIONS='-c default_transaction_read_only=on' \"$PG\" "
    + "psql -q -X -U bl_app_runtime -d banzami_staging -At -v ON_ERROR_STOP=1";
  return execFileSync('ssh', ['-o', 'BatchMode=yes', remote, psql], { input: sql, encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 26 }).trim();
}

/** The same query against a local database (selftests). */
export function readLocal(sql, databaseUrl) {
  return execFileSync('psql', [databaseUrl, '-q', '-X', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', timeout: 60000 }).trim();
}
