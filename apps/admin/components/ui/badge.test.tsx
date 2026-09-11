// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Badge, STATUS_LABEL_PT, statusLabelPt } from './badge';

afterEach(() => cleanup());

// Every status the console's own types declare (lib/admin-api.ts) plus the
// ones Core returns in pass-through lists.
const SHOWN = [
  // applications
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUIRED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PROVISIONING_FAILED',
  // accounts / operators
  'ACTIVE', 'SUSPENDED', 'CLOSED', 'INVITED',
  // payouts
  'PENDING', 'PROCESSING', 'SENT', 'CONFIRMED', 'FAILED', 'RETURNED',
  // settlements, wallet payments, app settlements, fees, recon runs
  'SETTLED', 'COMPLETED', 'REVERSED', 'CREATED', 'APPLIED', 'RUNNING',
  // documents
  'PENDING_UPLOAD', 'UPLOADED', 'ACCEPTED', 'DELETED', 'EXPIRED',
];

describe('status labels', () => {
  it('every status the console shows has a Portuguese label', () => {
    for (const s of SHOWN) {
      expect(STATUS_LABEL_PT[s], s).toBeTruthy();
      expect(statusLabelPt(s), s).not.toBe(s);
    }
  });

  it('SUBMITTED is "Submetida" — never the same word as PENDING', () => {
    expect(statusLabelPt('SUBMITTED')).toBe('Submetida');
    expect(statusLabelPt('PENDING')).toBe('Pendente');
    expect(statusLabelPt('SUBMITTED')).not.toBe(statusLabelPt('PENDING'));
  });

  it('no two codes share a label unless they mean the same thing', () => {
    const byLabel = new Map<string, string[]>();
    for (const [code, label] of Object.entries(STATUS_LABEL_PT)) byLabel.set(label, [...(byLabel.get(label) ?? []), code]);
    const shared = [...byLabel.entries()].filter(([, codes]) => codes.length > 1);
    // SENT (a payout sent to the bank) and UPLOADED (a document sent) both read "Enviado".
    expect(shared).toEqual([['Enviado', ['SENT', 'UPLOADED']]]);
  });

  it('a translated label keeps its colour', () => {
    render(<><Badge label={statusLabelPt('SUBMITTED')} /><Badge label={statusLabelPt('REVERSED')} /><Badge label={statusLabelPt('COMPLETED')} /></>);
    expect((screen.getByText('Submetida') as HTMLElement).style.color).toBe('rgb(58, 91, 208)');  // info
    expect((screen.getByText('Revertido') as HTMLElement).style.color).toBe('rgb(181, 16, 31)');  // danger
    expect((screen.getByText('Concluído') as HTMLElement).style.color).toBe('rgb(31, 157, 87)');  // success
  });

  it('an unknown code stays visible as itself', () => {
    expect(statusLabelPt('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(statusLabelPt(null)).toBe('—');
  });
});
