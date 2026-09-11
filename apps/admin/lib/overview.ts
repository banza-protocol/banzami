// The overview's figures, computed from what each source actually returned.
//
// Three things the page used to get wrong, and this module exists to keep right:
//  - "Volume liquidado hoje" counted settlements CREATED today in the browser's
//    zone. A settlement is settled when settled_at says so, and "today" is the
//    Luanda (WAT) day.
//  - A source that failed to load was shown as 0 — "no disputes", "nothing
//    pending" — which is a claim, not an absence. A failed source is null here
//    and the page shows it as unknown.
//  - "KYC pendentes" counted Business applications, which are KYB. The figures
//    are named for what they count.
// Amounts are totalled per currency and never added across currencies.

import type { MerchantApplication, Payout, Settlement } from '@/lib/admin-api';
import { formatTotals, totalsByCurrency } from '@/lib/format';
import { isTodayWAT } from '@/lib/time';

export interface OverviewSources {
  /** null = the source failed to load (unknown), never "empty". */
  applications:   MerchantApplication[] | null;
  openDisputes:   number | null;
  pendingPayouts: Payout[] | null;
  settled:        Settlement[] | null;
}

export interface OverviewFigures {
  settledToday:   { count: number; volume: string } | null;
  applicationsToReview: { total: number; underReview: number } | null;
  newApplications: number | null;
  openDisputes:   number | null;
  pendingPayouts: { count: number; volume: string } | null;
}

export function overviewFigures(s: OverviewSources, now: Date = new Date()): OverviewFigures {
  const settledToday = s.settled
    ? s.settled.filter((x) => x.status === 'SETTLED' && isTodayWAT(x.settled_at, now))
    : null;
  const apps = s.applications;
  return {
    settledToday: settledToday && {
      count: settledToday.length,
      volume: formatTotals(totalsByCurrency(settledToday, (x) => x.net_amount?.amount_minor, (x) => x.net_amount?.currency ?? x.currency)),
    },
    applicationsToReview: apps && {
      total: apps.filter((a) => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW').length,
      underReview: apps.filter((a) => a.status === 'UNDER_REVIEW').length,
    },
    newApplications: apps && apps.filter((a) => a.status === 'SUBMITTED').length,
    openDisputes: s.openDisputes,
    pendingPayouts: s.pendingPayouts && {
      count: s.pendingPayouts.length,
      volume: formatTotals(totalsByCurrency(s.pendingPayouts, (p) => p.amount?.amount_minor, (p) => p.amount?.currency)),
    },
  };
}
