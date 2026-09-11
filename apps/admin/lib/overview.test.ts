import { describe, expect, it } from 'vitest';
import type { MerchantApplication, Payout, Settlement } from '@/lib/admin-api';
import { overviewFigures } from './overview';

const now = new Date('2026-09-11T10:00:00Z'); // 11:00 WAT

function settlement(p: Partial<Settlement>): Settlement {
  return {
    id: 's', merchant_id: 'm', wallet_id: 'w', currency: 'AOA', status: 'SETTLED',
    gross_amount: { amount_minor: 0, currency: 'AOA' }, fee_amount: { amount_minor: 0, currency: 'AOA' },
    net_amount: { amount_minor: 100_000, currency: 'AOA' }, transaction_count: 1,
    period_start: '', period_end: '', created_at: '2026-08-01T10:00:00Z', updated_at: '', ...p,
  };
}

describe('overview figures', () => {
  it('"settled today" is by settled_at on the Luanda day, not by created_at', () => {
    const f = overviewFigures({
      applications: [], openDisputes: 0, pendingPayouts: [],
      settled: [
        settlement({ id: 'a', settled_at: '2026-09-10T23:30:00Z' }),                        // 00:30 WAT today
        settlement({ id: 'b', settled_at: '2026-09-10T22:30:00Z' }),                        // 23:30 WAT yesterday
        settlement({ id: 'c', created_at: '2026-09-11T09:00:00Z', settled_at: null }),     // created today, not settled
        settlement({ id: 'd', settled_at: '2026-09-11T08:00:00Z', net_amount: { amount_minor: 5_000, currency: 'USD' }, currency: 'USD' }),
      ],
    }, now);
    expect(f.settledToday).toEqual({ count: 2, volume: '1 000 Kz · 50 USD' });
  });

  it('a source that failed to load is unknown (null), never zero', () => {
    const f = overviewFigures({ applications: null, openDisputes: null, pendingPayouts: null, settled: null }, now);
    expect(f).toEqual({ settledToday: null, applicationsToReview: null, newApplications: null, openDisputes: null, pendingPayouts: null });
  });

  it('counts Business applications (KYB) and pending payouts per currency', () => {
    const apps = [{ status: 'SUBMITTED' }, { status: 'UNDER_REVIEW' }, { status: 'APPROVED' }] as MerchantApplication[];
    const payouts = [
      { amount: { amount_minor: 200_000, currency: 'AOA' } },
      { amount: { amount_minor: 1_000, currency: 'EUR' } },
    ] as Payout[];
    const f = overviewFigures({ applications: apps, openDisputes: 3, pendingPayouts: payouts, settled: [] }, now);
    expect(f.applicationsToReview).toEqual({ total: 2, underReview: 1 });
    expect(f.newApplications).toBe(1);
    expect(f.pendingPayouts).toEqual({ count: 2, volume: '2 000 Kz · 10 EUR' });
    expect(f.settledToday).toEqual({ count: 0, volume: '0 Kz' });
  });
});
