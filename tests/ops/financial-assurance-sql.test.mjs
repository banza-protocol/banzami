/**
 * tools/assurance/sandbox-financial-assurance.sql reports zero on a clean
 * database — and non-zero for each defect it exists to catch. A counter that
 * cannot move is not evidence of anything.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/financial-assurance-sql.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const ADMIN = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const MIG = join(REPO, 'db/migrations');
const SQL = join(REPO, 'tools/assurance/sandbox-financial-assurance.sql');
let db; let url;
const psql = (sql) => execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const counts = () => Object.fromEntries(
  execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-At', '-f', SQL], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .trim().split('\n').map((l) => { const [k, v] = l.split('|'); return [k, Number(v)]; }));

const ZERO = [
  'LEDGER_POSTINGS_WITHOUT_BOTH_LEGS', 'LEDGER_POSTINGS_UNBALANCED', 'LEDGER_ENTRY_ACCOUNT_CURRENCY_MISMATCH',
  'LEDGER_TOTAL_DEBITS_MINUS_CREDITS', 'NEGATIVE_BUSINESS_WALLET_ACCOUNT_BALANCES',
  'NEGATIVE_BUSINESS_WALLET_AVAILABLE_BALANCES', 'NEGATIVE_CONSUMER_WALLET_AVAILABLE_BALANCES',
  'COMPLETED_TRANSFERS_WITHOUT_POSTING', 'TRANSFER_AMOUNT_DIFFERS_FROM_POSTING', 'PROOFS_UNSIGNED',
  'PROOFS_OF_MISSING_TRANSFERS', 'PROOF_AMOUNT_DIFFERS_FROM_TRANSFER', 'PROOF_DESCRIPTION_DIFFERS_FROM_TRANSFER',
  'PROOF_REFERENCES_DUPLICATED', 'LIVE_DEFAULTED_ENVIRONMENT_COLUMNS', 'BUSINESS_LOGIN_NOT_OWNING_ITS_HANDLE',
  'APPROVED_APPLICATIONS_WITHOUT_RESOLUTION', 'APPLICATION_HOLDS_OF_CLOSED_APPLICATIONS',
  'HANDLES_WITH_MORE_THAN_ONE_OWNER', 'WEBHOOK_EVENTS_DELIVERED_TWICE_TO_ONE_ENDPOINT',
  'WEBHOOK_ATTEMPTS_BEYOND_DELIVERY_COUNT',
];

describe('financial assurance counters', () => {
  before(() => {
    db = `bz_assure_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]);
    execFileSync('psql', [ADMIN, '-Atc', `CREATE DATABASE ${db}`]);
    execFileSync('sqlx', ['migrate', 'run', '--source', MIG, '-D', url], { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
  });
  after(() => { try { execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]); } catch { /* best effort */ } });

  it('a clean, fully migrated database reports zero on every counter', () => {
    const c = counts();
    for (const k of ZERO) assert.equal(c[k], 0, `${k} = ${c[k]}`);
  });

  it('a posting with one leg is caught', () => {
    psql(`INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES
            ('a0000000-0000-4000-8000-000000000001','LIABILITY','t1','AOA'),
            ('a0000000-0000-4000-8000-000000000002','ASSET','t2','AOA');
          INSERT INTO ledger_postings (id, description, idempotency_key) VALUES ('b0000000-0000-4000-8000-000000000001','one leg','one-leg');
          INSERT INTO ledger_entries (posting_id, account_id, entry_type, amount_minor, currency)
            VALUES ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','DEBIT',100,'AOA')`);
    const c = counts();
    assert.equal(c.LEDGER_POSTINGS_WITHOUT_BOTH_LEGS, 1);
    assert.equal(c.LEDGER_POSTINGS_UNBALANCED, 1);
    assert.notEqual(c.LEDGER_TOTAL_DEBITS_MINUS_CREDITS, 0);
  });

  it('an unsigned proof and a proof of nothing are caught', () => {
    psql(`INSERT INTO transaction_proofs (proof_reference, transaction_id, transfer_id, environment, amount_minor, currency)
          VALUES ('BZM-TEST-0001', 't', '00000000-0000-4000-8000-00000000dead', 'SANDBOX', 100, 'AOA')`);
    const c = counts();
    assert.equal(c.PROOFS_UNSIGNED, 1);
    assert.equal(c.PROOFS_OF_MISSING_TRANSFERS, 1);
  });

  it('a login that does not own its handle is caught', () => {
    psql(`INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('assurance_shop','MERCHANT','c0000000-0000-4000-8000-000000000001');
          INSERT INTO merchant_app_credentials (merchant_id, environment, handle) VALUES ('c0000000-0000-4000-8000-000000000002','SANDBOX','assurance_shop')`);
    assert.equal(counts().BUSINESS_LOGIN_NOT_OWNING_ITS_HANDLE, 1);
  });
});
