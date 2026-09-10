/**
 * Migration 0119 keeps every webhook delivery attempt as it happened.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0119-webhook-delivery-attempts.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const MIG = join(REPO, 'db/migrations');
const FILE = join(MIG, '0119_webhook_delivery_attempts.sql');
let db; let url;
const psql = (target, sql) => execFileSync('psql', [target, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const D = '44444444-4444-4444-8444-444444444444';

describe('migration 0119', () => {
  before(() => {
    db = `bz_0119_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    psql(ADMIN, `DROP DATABASE IF EXISTS ${db}`);
    psql(ADMIN, `CREATE DATABASE ${db}`);
    execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', '118', '-D', url], { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
    psql(url, `INSERT INTO webhook_endpoints (id, merchant_id, url, events, active, secret, environment)
                 VALUES ('55555555-5555-4555-8555-555555555555', gen_random_uuid(), 'https://example.test/h', ARRAY['*'], true, 's', 'SANDBOX');
               INSERT INTO webhook_events (id, merchant_id, event_type, payload, idempotency_key)
                 VALUES ('66666666-6666-4666-8666-666666666666', gen_random_uuid(), 'payment.succeeded', '{}', 'k');
               INSERT INTO webhook_deliveries (id, event_id, endpoint_id)
                 VALUES ('${D}', '66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555')`);
    execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', FILE], { stdio: ['ignore', 'pipe', 'pipe'] });
  });
  after(() => { try { psql(ADMIN, `DROP DATABASE IF EXISTS ${db}`); } catch { /* best effort */ } });

  it('records a refused attempt and a delivered one', () => {
    psql(url, `INSERT INTO webhook_delivery_attempts (delivery_id, attempt_number, outcome, status_code, error_class, attempted_at)
               VALUES ('${D}', 1, 'FAILED', 500, 'http_status', now()), ('${D}', 2, 'SUCCESS', 200, NULL, now())`);
    assert.equal(psql(url, `SELECT string_agg(attempt_number||':'||outcome, ',' ORDER BY attempt_number) FROM webhook_delivery_attempts`).trim(), '1:FAILED,2:SUCCESS');
  });
  it('an attempt number happens once per delivery', () => {
    assert.throws(() => psql(url, `INSERT INTO webhook_delivery_attempts (delivery_id, attempt_number, outcome, status_code, error_class, attempted_at)
                                    VALUES ('${D}', 1, 'FAILED', 500, 'http_status', now())`), /duplicate key/);
  });
  it('a success must be an HTTP answer below 400, and a failure must name why', () => {
    assert.throws(() => psql(url, `INSERT INTO webhook_delivery_attempts (delivery_id, attempt_number, outcome, status_code, attempted_at)
                                    VALUES ('${D}', 3, 'SUCCESS', 500, now())`), /outcome_coherent/);
    assert.throws(() => psql(url, `INSERT INTO webhook_delivery_attempts (delivery_id, attempt_number, outcome, attempted_at)
                                    VALUES ('${D}', 3, 'FAILED', now())`), /outcome_coherent/);
    assert.throws(() => psql(url, `INSERT INTO webhook_delivery_attempts (delivery_id, attempt_number, outcome, error_class, attempted_at)
                                    VALUES ('${D}', 3, 'FAILED', 'the receiver said no', now())`), /check constraint/);
  });
  it('history is append-only', () => {
    assert.throws(() => psql(url, `UPDATE webhook_delivery_attempts SET status_code = 200`), /append-only/);
  });
  it('retiring a delivery takes its history with it', () => {
    psql(url, `DELETE FROM webhook_deliveries WHERE id = '${D}'`);
    assert.equal(psql(url, `SELECT count(*) FROM webhook_delivery_attempts`).trim(), '0');
  });
  it('is re-runnable', () => {
    execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', FILE], { stdio: ['ignore', 'pipe', 'pipe'] });
  });
});
