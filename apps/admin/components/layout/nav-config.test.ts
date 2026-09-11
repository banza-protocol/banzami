import { describe, expect, it } from 'vitest';
import { ATTENTION_KEYS } from '@/lib/attention';
import { navItems } from './nav-config';

describe('nav → attention mapping', () => {
  const items = navItems();

  it('maps every attention category to exactly one menu', () => {
    const used = items.flatMap((i) => (i.attentionKey ? [i.attentionKey] : []));
    expect([...used].sort()).toEqual([...ATTENTION_KEYS].sort());
  });

  it('badges the queues', () => {
    const byLabel = Object.fromEntries(items.map((i) => [`${i.href}`, i.attentionKey]));
    expect(byLabel).toMatchObject({
      '/compliance/inbox': 'inbox',
      '/merchants': 'business_applications',
      '/merchant-kyb': 'kyb_documents',
      '/consumer-kyc': 'kyc_documents',
      '/settlements': 'settlements',
      '/payments': 'payouts',
      '/reconciliation': 'reconciliation',
      '/disputes': 'disputes',
      '/risk': 'risk_flags',
      '/application-settlements': 'application_settlements',
    });
  });

  it('never badges a place to look things up or configure', () => {
    for (const href of ['/', '/businesses', '/consumers', '/proofs', '/wallet-payments', '/operators',
      '/platform-mode', '/finance', '/pricing-rules', '/pricing-profiles', '/fee-policies', '/operator-fees']) {
      const item = items.find((i) => i.href === href);
      expect(item, href).toBeDefined();
      expect(item?.attentionKey, href).toBeUndefined();
    }
  });
});

describe('nav labels', () => {
  it('payouts are "Levantamentos" — money leaving a wallet — never "Pagamentos"', () => {
    const items = navItems();
    expect(items.find((i) => i.href === '/payments')?.label).toBe('Levantamentos');
    expect(items.find((i) => i.href === '/wallet-payments')?.label).toBe('Pagamentos recebidos');
  });
});
