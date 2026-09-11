/**
 * Migration 0128: a session whose link was paid (USED) is PAID, and its dynamic
 * QR stops being payable. An unpaid session, and another session's QR, are
 * left alone.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0128-sessions-paid-on-hosted-rail.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

function session(linkStatus, sessionStatus) {
  const merchant = randomUUID(); const wallet = randomUUID(); const link = randomUUID(); const qr = randomUUID(); const s = randomUUID();
  const acct = () => psql(`INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES (gen_random_uuid(),'LIABILITY','a','AOA') RETURNING id`).split('\n')[0];
  psql(`INSERT INTO merchants (id, name, email, status) VALUES ('${merchant}','M','${merchant}@example.test','ACTIVE')`);
  psql(`INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id) VALUES ('${wallet}','${merchant}','AOA','ACTIVE','${acct()}','${acct()}')`);
  const wa = psql(`SELECT id FROM wallet_accounts WHERE wallet_id = '${wallet}'`);
  psql(`INSERT INTO payment_links (id, merchant_id, wallet_id, slug, amount_minor, currency, status, environment, wallet_account_id)
        VALUES ('${link}','${merchant}','${wallet}','s-${link.slice(0, 8)}',1000,'AOA','${linkStatus}','SANDBOX','${wa}')`);
  psql(`INSERT INTO qr_codes (id, owner_id, owner_type, qr_type, amount_minor, currency, status, expires_at, environment, wallet_account_id)
        VALUES ('${qr}','${merchant}','MERCHANT','DYNAMIC',1000,'AOA','ACTIVE', now() + interval '89 days','SANDBOX','${wa}')`);
  psql(`INSERT INTO payment_sessions (id, merchant_id, wallet_id, wallet_account_id, amount_minor, currency, status, payment_link_id, qr_code_id)
        VALUES ('${s}','${merchant}','${wallet}','${wa}',1000,'AOA','${sessionStatus}','${link}','${qr}')`);
  return { s, qr };
}
const status = (table, id) => psql(`SELECT status FROM ${table} WHERE id = '${id}'`);

describe('migration 0128', () => {
  let paidByLink; let unpaid; let alreadyPaid;
  before(() => {
    db = `bz_0128_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]);
    execFileSync('psql', [ADMIN, '-Atc', `CREATE DATABASE ${db}`]);
    migrate(127);
    paidByLink = session('USED', 'ACTIVE');
    unpaid = session('ACTIVE', 'ACTIVE');
    alreadyPaid = session('USED', 'PAID');
    migrate(128);
  });
  after(() => execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]));

  it('a session whose link was paid is PAID and its QR expired', () => {
    assert.equal(status('payment_sessions', paidByLink.s), 'PAID');
    assert.equal(status('qr_codes', paidByLink.qr), 'EXPIRED');
  });
  it('an unpaid session keeps its QR payable', () => {
    assert.equal(status('payment_sessions', unpaid.s), 'ACTIVE');
    assert.equal(status('qr_codes', unpaid.qr), 'ACTIVE');
  });
  it('nothing financial is touched', () => {
    assert.equal(psql('SELECT count(*) FROM ledger_postings'), '0');
  });
});
