/**
 * Migration 0125: one definition of a Business's public identity, the fields a
 * proof needs to say what a payment was, and a proof whose financial facts
 * cannot be edited.
 *
 *   DATABASE_URL=postgres://localhost:5432/postgres node --test tests/ops/migration-0125-payment-receipt-semantics.test.mjs
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

function business(name, handle) {
  const id = randomUUID();
  psql(`INSERT INTO merchants (id, name, email, status) VALUES ('${id}', '${name}', '${id}@example.test', 'ACTIVE')`);
  if (handle) psql(`INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('${handle}', 'MERCHANT', '${id}')`);
  return id;
}
function approvedApplication(businessName, handle) {
  psql(`INSERT INTO merchant_applications (id, origin, status, resolution, environment, desired_handle, business_name, email)
        VALUES (gen_random_uuid(), 'STANDALONE_BUSINESS', 'APPROVED', 'PROVISIONED_NEW', 'SANDBOX', '${handle}', '${businessName}', '${randomUUID()}@example.test')`);
}
const identity = (id) => psql(`SELECT coalesce(handle,'') || '|' || display_name FROM business_public_identities WHERE merchant_id = '${id}'`);

describe('migration 0125', () => {
  before(() => {
    db = `bz_0125_${process.pid}`;
    url = ADMIN.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
    execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]);
    execFileSync('psql', [ADMIN, '-Atc', `CREATE DATABASE ${db}`]);
    migrate(125);
  });
  after(() => { try { execFileSync('psql', [ADMIN, '-Atc', `DROP DATABASE IF EXISTS ${db}`]); } catch { /* best effort */ } });

  it('a Business named after a Project presents the name its handle was approved under', () => {
    const doa = business('Sandbox · Doa-Sandbox', 'doaprobe');
    approvedApplication('Doa', 'doaprobe');
    assert.equal(identity(doa), 'doaprobe|Doa');
  });

  it('its own public profile name wins over everything', () => {
    const b = business('Sandbox · Loja-Projeto', 'lojaprobe');
    approvedApplication('Loja Reviewed', 'lojaprobe');
    psql(`INSERT INTO merchant_profiles (merchant_id, handle, display_name, public) VALUES ('${b}', 'lojaprobe', 'Loja Pública', false)`);
    assert.equal(identity(b), 'lojaprobe|Loja Pública');
  });

  it('two approved applications for one handle are ambiguous: the account name stands, nothing is guessed', () => {
    const b = business('Conta Original', 'ambiprobe');
    approvedApplication('Nome A', 'ambiprobe');
    approvedApplication('Nome B', 'ambiprobe');
    assert.equal(identity(b), 'ambiprobe|Conta Original');
  });

  it('a Business with no handle keeps its account name and no handle', () => {
    const b = business('Sem Handle Lda', null);
    assert.equal(identity(b), '|Sem Handle Lda');
  });

  describe('proofs', () => {
    let proof;
    before(() => {
      proof = psql(`INSERT INTO transaction_proofs (proof_reference, transaction_id, environment, amount_minor, currency, status, payer_subject_id, confirmed_at)
        VALUES ('BZM-TEST-0125-AAAA-BBBB-CCCC-DDDD', '${randomUUID()}', 'SANDBOX', 200000, 'AOA', 'CONFIRMED', '${randomUUID()}', now()) RETURNING id`).split('\n')[0];
    });

    it('its display snapshot can be corrected', () => {
      psql(`UPDATE transaction_proofs SET payee_display_name='Doa', payee_handle='doa', payee_subject_type='merchant',
              operation_kind='PAYMENT', channel='PAYMENT_LINK', funding_source='BANZAMI_BALANCE' WHERE id='${proof}'`);
      assert.equal(psql(`SELECT operation_kind||'|'||channel||'|'||payee_handle FROM transaction_proofs WHERE id='${proof}'`), 'PAYMENT|PAYMENT_LINK|doa');
    });

    for (const [col, value] of [
      ['proof_reference', `'BZM-TEST-0125-EEEE-FFFF-GGGG-HHHH'`],
      ['amount_minor', '199999'],
      ['currency', `'USD'`],
      ['confirmed_at', `now() - interval '1 hour'`],
      ['transaction_id', `'${randomUUID()}'`],
      ['environment', `'LIVE'`],
    ]) {
      it(`its ${col} cannot`, () => {
        assert.throws(() => psql(`UPDATE transaction_proofs SET ${col} = ${value} WHERE id='${proof}'`), /immutable/);
      });
    }

    it('unknown operation kinds, channels and funding sources are refused', () => {
      assert.throws(() => psql(`UPDATE transaction_proofs SET operation_kind='TRANSFER' WHERE id='${proof}'`), /operation_kind_check/);
      assert.throws(() => psql(`UPDATE transaction_proofs SET channel='@banza' WHERE id='${proof}'`), /channel_check/);
      assert.throws(() => psql(`UPDATE transaction_proofs SET funding_source='CARD' WHERE id='${proof}'`), /funding_source_check/);
    });

    it('corrections are recorded once and never edited or deleted', () => {
      psql(`INSERT INTO transaction_proof_corrections (proof_id, correction_batch, field, previous_value, corrected_value, reason)
            VALUES ('${proof}', 'probe', 'payee_handle', NULL, 'doa', 'test')`);
      assert.throws(() => psql(`INSERT INTO transaction_proof_corrections (proof_id, correction_batch, field, reason) VALUES ('${proof}', 'probe', 'payee_handle', 'again')`), /corrections_once/);
      assert.throws(() => psql(`UPDATE transaction_proof_corrections SET corrected_value='x' WHERE proof_id='${proof}'`), /append-only/);
      assert.throws(() => psql(`DELETE FROM transaction_proof_corrections WHERE proof_id='${proof}'`), /append-only/);
    });
  });
});
