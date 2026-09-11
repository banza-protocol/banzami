/**
 * Migration 0131: the proof of a wallet payment refunded in full reads REVERSED;
 * a partially refunded one, and every other proof, is left as it was.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0131-refunded-wallet-payment-proofs.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const MIG = join(REPO, 'db/migrations');
let db; let url;
const psql = (sql) => execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const migrate = (v) => execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '--target-version', String(v), '-D', url],
  { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const status = (ref) => psql(`SELECT status || '|' || COALESCE(to_char(reversed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), '') FROM transaction_proofs WHERE proof_reference = '${ref}'`);

describe('migration 0131', () => {
  before(() => {
    db = `bz_0131_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]);
    execFileSync('psql', [ADMIN, '-Atc', `CREATE DATABASE ${db}`]);
    migrate(130);
    const wp = (n) => `f0000000-0000-4000-8000-00000000000${n}`;
    const tr = (n) => `f0000000-0000-4000-8000-00000000010${n}`;
    psql(`INSERT INTO wallet_payments (id, transfer_id, merchant_id, consumer_id, amount_minor, currency, status, trace_id, environment) VALUES
            ('${wp(1)}','${tr(1)}',gen_random_uuid(),gen_random_uuid(),1000,'AOA','COMPLETED','t','SANDBOX'),
            ('${wp(2)}','${tr(2)}',gen_random_uuid(),gen_random_uuid(),1000,'AOA','COMPLETED','t','SANDBOX'),
            ('${wp(3)}','${tr(3)}',gen_random_uuid(),gen_random_uuid(),1000,'AOA','COMPLETED','t','SANDBOX');
          INSERT INTO transaction_proofs (proof_reference, transaction_id, environment, amount_minor, currency, status) VALUES
            ('BZM-full-transfer','${tr(1)}','SANDBOX',1000,'AOA','CONFIRMED'),
            ('BZM-full-legacy','${wp(1)}','SANDBOX',1000,'AOA','CONFIRMED'),
            ('BZM-partial','${tr(2)}','SANDBOX',1000,'AOA','CONFIRMED'),
            ('BZM-unrefunded','${tr(3)}','SANDBOX',1000,'AOA','CONFIRMED');
          INSERT INTO restitution_allocations (source_type, source_id, origin, origin_id, amount_minor, currency, idempotency_key, posting_id, created_at) VALUES
            ('WALLET_PAYMENT','${wp(1)}','REFUND',gen_random_uuid(),300,'AOA','a',gen_random_uuid(),'2026-09-01T10:00:00Z'),
            ('WALLET_PAYMENT','${wp(1)}','REFUND',gen_random_uuid(),700,'AOA','b',gen_random_uuid(),'2026-09-02T10:00:00Z'),
            ('WALLET_PAYMENT','${wp(2)}','REFUND',gen_random_uuid(),999,'AOA','c',gen_random_uuid(),'2026-09-02T10:00:00Z')`);
    migrate(131);
  });
  after(() => execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]));

  it('reverses both keys of a fully refunded payment, dated by the refund that completed it', () => {
    assert.match(status('BZM-full-transfer'), /^REVERSED\|2026-09-02 10:00:00/);
    assert.match(status('BZM-full-legacy'), /^REVERSED\|2026-09-02 10:00:00/);
  });
  it('leaves a partially refunded payment and an unrefunded one confirmed', () => {
    assert.equal(status('BZM-partial'), 'CONFIRMED|');
    assert.equal(status('BZM-unrefunded'), 'CONFIRMED|');
  });
});
