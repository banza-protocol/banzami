import { describe, expect, it } from 'vitest';
import { confirmedTitle, fmtWAT, partyLabel, proofRows } from './proof-view';
import type { ProofResult } from './api';

const REF = 'BZM-BMJN-CFAF-00ZT-ADSF-P4N7-FB0T';

const payment: ProofResult = {
  exists: true, status: 'CONFIRMED', amount: 200000, currency: 'AOA',
  payer_display: undefined, payer_handle: 'fm65',
  payee_display: 'Doa', payee_handle: 'doa', payee_kind: 'BUSINESS',
  operation_kind: 'PAYMENT', channel: 'PAYMENT_LINK', funding_source: 'BANZAMI_BALANCE',
  merchant_reference: 'DOA-55791091', display_context: 'Vaquinha · Jornada economica fresca',
  method: 'Saldo Banzami', description: '', confirmed_at: '2026-09-10T19:13:27Z',
  network: 'banza', operator: 'banzami',
};

const row = (rows: ReturnType<typeof proofRows>, label: string) => rows.find((r) => r.label === label)?.value;

describe('public verifier rows', () => {
  it('a payment names the Business, the operation, the channel and the funding source separately', () => {
    const rows = proofRows(payment, REF);
    expect(row(rows, 'De')).toBe('@fm65');
    expect(row(rows, 'Para')).toBe('@doa');
    expect(row(rows, 'Referência')).toBe(REF);
    expect(row(rows, 'Operação')).toBe('Pagamento · Link de pagamento');
    expect(row(rows, 'Fonte')).toBe('Saldo Banzami');
    expect(row(rows, 'Referência do comerciante')).toBe('DOA-55791091');
    expect(row(rows, 'Finalidade')).toBe('Vaquinha · Jornada economica fresca');
    expect(row(rows, 'Método')).toBeUndefined();
    expect(row(rows, 'Descrição')).toBeUndefined(); // absent, not dashed
  });

  it('19:13 UTC is shown as Luanda time, and says so', () => {
    expect(fmtWAT('2026-09-10T19:13:27Z')).toBe('10/09/2026, 20:13 (WAT)');
    expect(row(proofRows(payment, REF), 'Confirmado em')).toBe('10/09/2026, 20:13 (WAT)');
  });

  it('never shows a technical link id, a Project name or an empty payee', () => {
    const text = proofRows(payment, REF).map((r) => `${r.label}:${r.value}`).join('|');
    for (const bad of ['Payment link:', 'd7c27a5585a4', 'Doa-Sandbox', 'Para:—', '@banza']) {
      expect(text).not.toContain(bad);
    }
  });

  it('titles by operation', () => {
    expect(confirmedTitle('PAYMENT')).toBe('Pagamento verificado');
    expect(confirmedTitle('P2P_TRANSFER')).toBe('Transferência verificada');
    expect(confirmedTitle(undefined)).toBe('Comprovativo verificado');
  });

  it('a person is shown by @handle when the proof withholds their name', () => {
    expect(partyLabel(undefined, 'ana')).toBe('@ana');
    expect(partyLabel('Doa', 'doa')).toBe('Doa · @doa');
    expect(partyLabel(undefined, undefined)).toBeNull();
  });

  it('a legacy proof (no operation yet) keeps its method line', () => {
    const legacy = { ...payment, operation_kind: null, channel: null, funding_source: null, method: 'Transferência Banzami · @banza' };
    expect(row(proofRows(legacy, REF), 'Método')).toBe('Transferência Banzami · @banza');
  });
});
