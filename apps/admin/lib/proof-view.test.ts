import { describe, expect, it } from 'vitest';
import { channelLabel, confirmedTitle, operationLabel, operationRows, proofStatusLabel } from './proof-view';

// The same words as the public verifier (apps/website/lib/proof-view.ts).
describe('proof wording — as the public verifier says it', () => {
  it('names the operation, the channel and the source', () => {
    expect(operationLabel('PAYMENT')).toBe('Pagamento');
    expect(operationLabel('P2P_TRANSFER')).toBe('Transferência');
    expect(channelLabel('PAYMENT_LINK')).toBe('Link de pagamento');
    expect(channelLabel('QR')).toBe('Código QR Banzami');
    expect(channelLabel('HANDLE')).toBe('Endereço @banza');
    expect(confirmedTitle('PAYMENT')).toBe('Pagamento verificado');
    expect(confirmedTitle('P2P_TRANSFER')).toBe('Transferência verificada');
    expect(confirmedTitle(undefined)).toBe('Comprovativo verificado');
    expect(proofStatusLabel('REVERSED')).toBe('Revertido');
  });

  it('the drawer rows: Operação + Fonte, or the legacy Método', () => {
    expect(operationRows({ operation_kind: 'PAYMENT', channel: 'QR', funding_source: 'BANZAMI_BALANCE', method: 'x' }))
      .toEqual([['Operação', 'Pagamento · Código QR Banzami'], ['Fonte', 'Saldo Banzami']]);
    expect(operationRows({ operation_kind: 'P2P_TRANSFER', channel: 'HANDLE' }))
      .toEqual([['Operação', 'Transferência · Endereço @banza']]);
    expect(operationRows({ method: 'Carteira' })).toEqual([['Método', 'Carteira']]);
  });
});
