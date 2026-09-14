import { describe, expect, it } from 'vitest';
import { needsExternalEvidence, payoutActions } from './payouts';

// Core's PayoutStatus::can_transition_to (core/payouts/src/lib.rs), restated as
// (from, to) pairs. An action is offered iff Core accepts its transition.
const CORE_TRANSITIONS: [string, string][] = [
  ['PENDING', 'PROCESSING'], ['PENDING', 'FAILED'],
  ['PROCESSING', 'SENT'], ['PROCESSING', 'FAILED'],
  ['SENT', 'CONFIRMED'], ['SENT', 'FAILED'], ['SENT', 'RETURNED'],
];
const TARGET = { process: 'PROCESSING', sent: 'SENT', confirm: 'CONFIRMED', return: 'RETURNED', fail: 'FAILED' } as const;
const ALL = ['PENDING', 'PROCESSING', 'SENT', 'CONFIRMED', 'FAILED', 'RETURNED'];

describe('payoutActions', () => {
  it('offers exactly the transitions Core accepts', () => {
    for (const from of ALL) {
      const offered = payoutActions(from).map((a) => TARGET[a]).sort();
      const accepted = CORE_TRANSITIONS.filter(([f]) => f === from).map(([, t]) => t).sort();
      expect(offered, from).toEqual(accepted);
    }
  });

  it('never offers Confirmar or Devolver before the payout was sent', () => {
    for (const s of ['PENDING', 'PROCESSING']) {
      expect(payoutActions(s)).not.toContain('confirm');
      expect(payoutActions(s)).not.toContain('return');
    }
  });

  it('offers nothing on a terminal or unknown status', () => {
    for (const s of ['CONFIRMED', 'FAILED', 'RETURNED', 'SOMETHING_NEW', '']) {
      expect(payoutActions(s)).toEqual([]);
    }
  });
});

describe('needsExternalEvidence', () => {
  it('asks for the rail’s reference exactly where the rail may have executed', () => {
    expect(needsExternalEvidence({ status: 'SENT' }, 'fail')).toBe(true);
    expect(needsExternalEvidence({ status: 'SENT' }, 'return')).toBe(true);
    expect(needsExternalEvidence({ status: 'PENDING' }, 'fail')).toBe(false);
    expect(needsExternalEvidence({ status: 'PROCESSING' }, 'fail')).toBe(false);
    expect(needsExternalEvidence({ status: 'SENT' }, 'confirm')).toBe(false);
  });
});
