// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import type { AttentionSummary } from '@/lib/attention';

vi.mock('next/navigation', () => ({
  usePathname: () => '/merchants',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/lib/admin-env', () => ({
  ENV_CHANGE_EVENT: 'banzadmin:env',
  useAdminEnv: () => ({ env: 'SANDBOX', setEnv: () => true, liveAvailable: false, ready: true }),
}));

import { AttentionProvider } from './attention-provider';
import { Sidebar } from './sidebar';
import { ATTENTION_MUTATION_EVENT } from '@/lib/admin-api';

function summary(counts: Record<string, number>, env: 'SANDBOX' | 'LIVE' = 'SANDBOX'): AttentionSummary {
  return {
    environment: env,
    generated_at: new Date().toISOString(),
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    categories: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, { count: v }])),
  };
}

async function renderWith(fetcher: (env: 'LIVE' | 'SANDBOX') => Promise<AttentionSummary>, now = () => Date.now()) {
  const utils = render(
    <AttentionProvider fetcher={fetcher} pollMs={1_000_000} now={now}>
      <Sidebar />
    </AttentionProvider>,
  );
  await act(async () => { await Promise.resolve(); });
  return utils;
}

const link = (name: RegExp) => screen.getByRole('link', { name });
const rowBadge = (el: HTMLElement) => el.querySelector('[data-attention-badge="row"]');
const iconBadge = (el: HTMLElement) => el.querySelector('[data-attention-badge="icon"]');

afterEach(() => cleanup());

describe('Sidebar attention badges', () => {
  it.each([
    [1, '1', 'Candidaturas, 1 item requer atenção'],
    [9, '9', 'Candidaturas, 9 itens requerem atenção'],
    [99, '99', 'Candidaturas, 99 itens requerem atenção'],
    [100, '99+', 'Candidaturas, 100 itens requerem atenção'],
  ])('%i → badge "%s", accessible name "%s"', async (n, text, name) => {
    await renderWith(async () => summary({ business_applications: n }));
    const a = screen.getByRole('link', { name });
    expect(rowBadge(a)?.textContent).toBe(text);
    expect(iconBadge(a)?.textContent).toBe(text); // collapsed rail / phone placement
    expect(rowBadge(a)?.getAttribute('aria-hidden')).toBe('true');
    expect(a.getAttribute('title')).toBe(name.replace('Candidaturas, ', ''));
    expect(a.getAttribute('href')).toBe('/merchants?attention=1');
  });

  it('shows no badge at 0', async () => {
    await renderWith(async () => summary({ business_applications: 0 }));
    const a = link(/^Candidaturas$/);
    expect(rowBadge(a)).toBeNull();
    expect(iconBadge(a)).toBeNull();
    expect(a.getAttribute('href')).toBe('/merchants');
  });

  it('shows nothing while loading', async () => {
    await renderWith(() => new Promise<AttentionSummary>(() => {}));
    expect(document.querySelectorAll('[data-attention-badge]')).toHaveLength(0);
  });

  it('shows nothing — never a zero — when the summary fails', async () => {
    await renderWith(async () => { throw new Error('502'); });
    expect(document.querySelectorAll('[data-attention-badge]')).toHaveLength(0);
    expect(link(/^Candidaturas$/)).toBeTruthy();
  });

  it('hides a category the server did not return (role cannot open it)', async () => {
    await renderWith(async () => summary({ business_applications: 3 }));
    expect(rowBadge(link(/^Disputas$/))).toBeNull();
    expect(rowBadge(link(/^Pagamentos$/))).toBeNull();
  });

  it('never badges menus that are not queues', async () => {
    await renderWith(async () => summary({ business_applications: 3, payouts: 2, disputes: 1 }));
    for (const name of [/^Visão geral$/, /^Negócios$/, /^Consumidores$/, /^Comprovativos$/, /^Operadores$/]) {
      for (const a of screen.getAllByRole('link', { name })) expect(rowBadge(a)).toBeNull();
    }
  });

  it('refreshes right after a mutation', async () => {
    let n = 4;
    const fetcher = vi.fn(async () => summary({ business_applications: n }));
    await renderWith(fetcher);
    expect(rowBadge(link(/Candidaturas, 4/))?.textContent).toBe('4');
    n = 3; // the operator rejected one
    await act(async () => { window.dispatchEvent(new Event(ATTENTION_MUTATION_EVENT)); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(rowBadge(link(/Candidaturas, 3/))?.textContent).toBe('3');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refreshes on focus and makes one request for many triggers at once', async () => {
    let resolve!: (s: AttentionSummary) => void;
    const fetcher = vi.fn(() => new Promise<AttentionSummary>((r) => { resolve = r; }));
    await renderWith(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event(ATTENTION_MUTATION_EVENT));
      window.dispatchEvent(new Event(ATTENTION_MUTATION_EVENT));
    });
    expect(fetcher).toHaveBeenCalledTimes(1); // still in flight: coalesced
    await act(async () => { resolve(summary({ business_applications: 1 })); await Promise.resolve(); await Promise.resolve(); });
    expect(fetcher).toHaveBeenCalledTimes(2); // exactly one follow-up
  });

  it('follows an environment switch and never shows the old environment’s counts', async () => {
    const fetcher = vi.fn(async (env: 'LIVE' | 'SANDBOX') =>
      env === 'SANDBOX' ? summary({ business_applications: 7 }) : summary({ business_applications: 2 }, 'LIVE'));
    await renderWith(fetcher);
    expect(rowBadge(link(/Candidaturas, 7/))).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('banzadmin:env', { detail: 'LIVE' }));
      await Promise.resolve(); await Promise.resolve();
    });
    expect(fetcher).toHaveBeenLastCalledWith('LIVE');
    expect(rowBadge(link(/Candidaturas, 2/))?.textContent).toBe('2');
  });

  it('drops badges once the last good summary is too old', async () => {
    let t = 1_000_000;
    let fail = false;
    const fetcher = vi.fn(async () => { if (fail) throw new Error('down'); return summary({ business_applications: 5 }); });
    await renderWith(fetcher, () => t);
    expect(rowBadge(link(/Candidaturas, 5/))).toBeTruthy();
    fail = true;
    t += 60_000; // within the window: keep the last good count
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); await Promise.resolve(); });
    expect(rowBadge(link(/Candidaturas, 5/))).toBeTruthy();
    t += 2 * 60_000; // past it
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); await Promise.resolve(); });
    expect(document.querySelectorAll('[data-attention-badge]')).toHaveLength(0);
  });

  it('keeps every menu a keyboard-reachable link with its name', async () => {
    await renderWith(async () => summary({ business_applications: 4, inbox: 12 }));
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    const links = within(nav).getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(20);
    for (const a of links) {
      expect(a.tagName).toBe('A');
      expect(a.getAttribute('tabindex')).not.toBe('-1');
      expect(a.getAttribute('aria-label')).toBeTruthy();
    }
    expect(link(/^Inbox, 12 itens requerem atenção$/)).toBeTruthy();
  });
});

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});
