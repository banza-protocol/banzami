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
  'PROOFS_OF_MISSING_TRANSFERS', 'PROOF_AMOUNT_DIFFERS_FROM_TRANSFER', 'PROOF_DESCRIPTION_DIFFERS_FROM_OPERATION',
  'PROOF_PRINTS_A_TECHNICAL_LINK_DESCRIPTION', 'PROOF_OF_A_BUSINESS_PAYMENT_WITHOUT_ITS_PAYEE',
  'PROOF_REFERENCES_DUPLICATED', 'LIVE_DEFAULTED_ENVIRONMENT_COLUMNS', 'BUSINESS_LOGIN_NOT_OWNING_ITS_HANDLE',
  'APPROVED_APPLICATIONS_WITHOUT_RESOLUTION', 'APPLICATION_HOLDS_OF_CLOSED_APPLICATIONS',
  'HANDLES_WITH_MORE_THAN_ONE_OWNER', 'VERIFIED_FLAG_DISAGREES_WITH_KYB', 'WEBHOOK_EVENTS_DELIVERED_TWICE_TO_ONE_ENDPOINT',
  'WEBHOOK_ATTEMPTS_BEYOND_DELIVERY_COUNT',
  'LEDGER_ENTRIES_WITHOUT_POSTING', 'POSTINGS_CLAIMED_BY_TWO_OBJECTS', 'OBJECT_POSTINGS_THAT_DO_NOT_EXIST',
  'PAYOUTS_PROCESSED_WITHOUT_POSTING', 'SETTLEMENTS_SETTLED_WITHOUT_POSTING', 'APP_SETTLEMENTS_COMPLETED_WITHOUT_POSTING',
  'DEPOSITS_CONFIRMED_WITHOUT_POSTING', 'RESTITUTIONS_WITHOUT_POSTING', 'PAID_LINKS_WITHOUT_PAYMENT',
  'PAID_SESSIONS_WITHOUT_PAYMENT', 'WALLET_PAYMENTS_WITHOUT_COMPLETED_TRANSFER',
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

  it('a link payment proven the old way — empty payee, generated description — is caught', () => {
    psql(`INSERT INTO consumers (id, handle, status) VALUES ('c0000000-0000-4000-8000-000000000001','payerx','ACTIVE');
          INSERT INTO merchants (id, name, email, status) VALUES ('d0000000-0000-4000-8000-000000000001','Loja','l@x.test','ACTIVE');
          INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES
            ('a0000000-0000-4000-8000-000000000011','LIABILITY','w1','AOA'), ('a0000000-0000-4000-8000-000000000012','LIABILITY','w2','AOA');
          INSERT INTO wallets (id, merchant_id, currency, available_account_id, reserved_account_id)
            VALUES ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','AOA','a0000000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000012');
          INSERT INTO payment_links (id, slug, merchant_id, wallet_id, amount_minor, currency, description, status, environment)
            VALUES ('f0000000-0000-4000-8000-000000000001','f00000000000','d0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001',100,'AOA','ORD-1','USED','SANDBOX');
          INSERT INTO transfers (id, idempotency_key, sender_id, recipient_id, amount_minor, currency, status, description, environment)
            VALUES ('90000000-0000-4000-8000-000000000001','pl-pay-f0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001',100,'AOA','COMPLETED','Payment link: f00000000000','SANDBOX');
          INSERT INTO transaction_proofs (proof_reference, transaction_id, transfer_id, environment, amount_minor, currency, description, payee_subject_type, signature_value, issued_at)
            VALUES ('BZM-TEST-0125','90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','SANDBOX',100,'AOA','Payment link: f00000000000','consumer','sig', now())`);
    const c = counts();
    assert.equal(c.PROOF_DESCRIPTION_DIFFERS_FROM_OPERATION, 1);
    assert.equal(c.PROOF_PRINTS_A_TECHNICAL_LINK_DESCRIPTION, 1);
    assert.equal(c.PROOF_OF_A_BUSINESS_PAYMENT_WITHOUT_ITS_PAYEE, 1);
    // …and the canonical proof of the same payment is clean.
    psql(`UPDATE transaction_proofs SET description='ORD-1', payee_subject_type='merchant', payee_display_name='Loja', operation_kind='PAYMENT' WHERE proof_reference='BZM-TEST-0125'`);
    const d = counts();
    assert.equal(d.PROOF_DESCRIPTION_DIFFERS_FROM_OPERATION, 0);
    assert.equal(d.PROOF_PRINTS_A_TECHNICAL_LINK_DESCRIPTION, 0);
    assert.equal(d.PROOF_OF_A_BUSINESS_PAYMENT_WITHOUT_ITS_PAYEE, 0);
  });

  it('a verification badge that disagrees with the KYB decision is caught', () => {
    // Only reachable around the 0122 triggers — which is exactly what a counter
    // for it has to prove it would see.
    psql(`ALTER TABLE merchants DISABLE TRIGGER merchants_verified_projection;
          INSERT INTO merchants (id,name,email,status,business_account_type,created_at,updated_at,verified)
          VALUES ('e0000000-0000-4000-8000-000000000001','V','v@x.test','ACTIVE','MERCHANT',now(),now(),true);
          ALTER TABLE merchants ENABLE TRIGGER merchants_verified_projection`);
    assert.equal(counts().VERIFIED_FLAG_DISAGREES_WITH_KYB, 1);
  });

  it('money states without the money — phantom paid, processed without a posting, a posting claimed twice — are caught', () => {
    const before = counts();
    psql(`INSERT INTO merchants (id, name, email, status) VALUES ('d0000000-0000-4000-8000-0000000000f8','P','p8@x.test','ACTIVE');
          INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES
            ('a0000000-0000-4000-8000-0000000000f1','LIABILITY','p1','AOA'), ('a0000000-0000-4000-8000-0000000000f2','LIABILITY','p2','AOA');
          INSERT INTO wallets (id, merchant_id, currency, available_account_id, reserved_account_id)
            VALUES ('e0000000-0000-4000-8000-0000000000f8','d0000000-0000-4000-8000-0000000000f8','AOA','a0000000-0000-4000-8000-0000000000f1','a0000000-0000-4000-8000-0000000000f2');
          INSERT INTO payment_links (id, slug, merchant_id, wallet_id, amount_minor, currency, description, status, paid_at, environment)
            VALUES ('f0000000-0000-4000-8000-0000000000f8','f000000000f8','d0000000-0000-4000-8000-0000000000f8','e0000000-0000-4000-8000-0000000000f8',100,'AOA','x','USED',now(),'SANDBOX');
          INSERT INTO payouts (id, merchant_id, wallet_id, idempotency_key, status, amount_minor, currency, bank_account_number, bank_code, account_holder_name, environment)
            VALUES ('b0000000-0000-4000-8000-0000000000f8','d0000000-0000-4000-8000-0000000000f8','e0000000-0000-4000-8000-0000000000f8','po-f8','PROCESSING',100,'AOA','1','1','P','SANDBOX');
          INSERT INTO ledger_postings (id, description, idempotency_key) VALUES ('b0000000-0000-4000-8000-0000000000f9','twice','twice-f9');
          INSERT INTO settlements (id, merchant_id, wallet_id, currency, status, gross_amount_minor, fee_amount_minor, net_amount_minor, transaction_count, period_start, period_end, ledger_posting_id)
            VALUES ('b0000000-0000-4000-8000-0000000000fa','d0000000-0000-4000-8000-0000000000f8','e0000000-0000-4000-8000-0000000000f8','AOA','SETTLED',100,0,100,1,now()-interval '1 day',now(),'b0000000-0000-4000-8000-0000000000f9'),
                   ('b0000000-0000-4000-8000-0000000000fb','d0000000-0000-4000-8000-0000000000f8','e0000000-0000-4000-8000-0000000000f8','AOA','SETTLED',100,0,100,1,now()-interval '1 day',now(),NULL)`);
    const after = counts();
    const delta = (k) => after[k] - before[k];
    assert.equal(delta('PAID_LINKS_WITHOUT_PAYMENT'), 1);
    assert.equal(delta('PAYOUTS_PROCESSED_WITHOUT_POSTING'), 1);
    assert.equal(delta('SETTLEMENTS_SETTLED_WITHOUT_POSTING'), 1);
    // The posting claimed by a settlement is also claimed by nothing else yet…
    assert.equal(delta('POSTINGS_CLAIMED_BY_TWO_OBJECTS'), 0);
    // …until a payout claims it too.
    psql(`UPDATE payouts SET ledger_posting_id = 'b0000000-0000-4000-8000-0000000000f9' WHERE id = 'b0000000-0000-4000-8000-0000000000f8'`);
    const last = counts();
    assert.equal(last.POSTINGS_CLAIMED_BY_TWO_OBJECTS - before.POSTINGS_CLAIMED_BY_TWO_OBJECTS, 1);
    assert.equal(last.PAYOUTS_PROCESSED_WITHOUT_POSTING - before.PAYOUTS_PROCESSED_WITHOUT_POSTING, 0);
  });

  it('a login that does not own its handle is caught', () => {
    psql(`INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('assurance_shop','MERCHANT','c0000000-0000-4000-8000-000000000001');
          INSERT INTO merchant_app_credentials (merchant_id, environment, handle) VALUES ('c0000000-0000-4000-8000-000000000002','SANDBOX','assurance_shop')`);
    assert.equal(counts().BUSINESS_LOGIN_NOT_OWNING_ITS_HANDLE, 1);
  });
});
