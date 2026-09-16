/**
 * Retire a consumer this run created, through the CANONICAL Core lifecycle —
 * exactly the two postings tools/ops/retire-synthetic-residue.sh uses for a
 * synthetic consumer, but scoped to a single known id rather than the broad,
 * owner-gated classifier sweep:
 *
 *   1. POST core /internal/v1/sandbox/retire-funds  (CONSUMER) — a BALANCED
 *      posting that returns any fictitious balance to transit. No value created
 *      or destroyed; the book stays at zero.
 *   2. POST core /internal/v1/consumers/{id}/suspend — the consumer leaves
 *      ACTIVE, so it is no longer synthetic residue.
 *
 * No SQL mutation. The id is resolved read-only from the handle. Core internal
 * routes live on localhost inside the core-api container; we reach them the same
 * way the retire script does (docker exec curl), never from outside.
 */
import { execFileSync } from 'node:child_process';

const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';
const ssh = (cmd) => execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, cmd], { encoding: 'utf8', timeout: 60000 }).trim();

function consumerId(handle) {
  const h = String(handle).replace(/[^a-z0-9_]/gi, '');
  const out = ssh(
    `PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); ` +
    `PW=$(cat /root/.banzami/operator_db_url | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#'); ` +
    `docker exec -e PGPASSWORD=$PW -e PGOPTIONS='-c default_transaction_read_only=on' ` +
    `$PG psql -U bl_app_runtime -d banzami_staging -At -c "SELECT id FROM consumers WHERE handle='${h}'"`);
  return out || null;
}

// One Core internal POST via the core-api container (localhost:8081), body on stdin.
function corePost(path, bodyObj) {
  const body = JSON.stringify(bodyObj).replace(/'/g, `'\\''`);
  return ssh(
    `CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1); ` +
    `printf '%s' '${body}' | docker exec -i "$CORE" curl -s -o /dev/null -w '%{http_code}' ` +
    `-X POST -H 'Content-Type: application/json' --data @- 'http://localhost:8081${path}'`);
}

/**
 * Retire one consumer by handle. Returns { id, fundsStatus, suspendStatus, ok }.
 * `ok` is true when both postings returned a 2xx (or an idempotent repeat).
 */
export function retireConsumer(handle, { runId = 'appweb', reason = 'WEB-E2E-RUNNER-001 cleanroom cleanup' } = {}) {
  const id = consumerId(handle);
  if (!id) return { id: null, ok: false, detail: 'consumer not found' };
  const fundsStatus = corePost('/internal/v1/sandbox/retire-funds', {
    owner_type: 'CONSUMER', owner_id: id, reason,
    retired_by: 'web-e2e-runner', idempotency_key: `${runId}-c-${id}`,
  });
  const suspendStatus = corePost(`/internal/v1/consumers/${id}/suspend`, { notes: reason });
  const ok = /^2\d\d$/.test(fundsStatus) && /^2\d\d$/.test(suspendStatus);
  return { id, fundsStatus, suspendStatus, ok };
}
