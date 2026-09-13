// @vitest-environment jsdom
//
// Public Refunds documentation correctness (typed-source contract, BANZA ADR-017).
// Guards the public /docs Refunds section and the Developers overview refund
// example against ever teaching the obsolete/internal contract:
//   - never accept transaction_id / payment_id as a refund input;
//   - never expose the internal Core token TRANSACTION as a public source type;
//   - always present the public typed-source fields;
//   - the Refunds badge is whatever the assurance manifest's evidence says it is;
//   - the page stays static (no login, no Developer API fetch).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DocsPage from './page';
import PtRefundsPage from './refunds/page';
// The badge is not allowed to have an opinion of its own: it is read back from
// the assurance manifest, so evidence drives the badge rather than the reverse.
import { capability, isReleased } from './assurance-manifest';

// Refunds content lives in the PT content module (the refunds route).
const DOCS = readFileSync(join(process.cwd(), 'app/developers/docs/content-pt.tsx'), 'utf8');
const OVERVIEW = readFileSync(join(process.cwd(), 'app/developers/page.tsx'), 'utf8');

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Refunds docs — typed-source public contract (ADR-017)', () => {
  it('no public docs/overview example accepts transaction_id as a refund input', () => {
    expect(DOCS.includes('transaction_id')).toBe(false);
    expect(OVERVIEW.includes('transaction_id')).toBe(false);
  });

  it('no public docs/overview teaches the obsolete payment_id refund input', () => {
    expect(OVERVIEW.includes('payment_id')).toBe(false);
    expect(OVERVIEW).not.toContain('payment_id: payment.id');
  });

  it('no public docs/overview exposes the internal TRANSACTION source token', () => {
    expect(DOCS.includes('TRANSACTION')).toBe(false);
    expect(OVERVIEW.includes('TRANSACTION')).toBe(false);
  });

  it('the Refunds docs section names every public typed-source field', () => {
    // scope to the reembolsos section (from its anchor to the next section)
    const start = DOCS.indexOf('export function PtRefunds(');
    const rest = DOCS.slice(start);
    const end = rest.indexOf('export function PtSettlements(');
    // The page and the refund example it renders.
    const sample = /const SAMPLE_REFUND = `[\s\S]*?`;/.exec(DOCS)?.[0] ?? '';
    const section = (end > 0 ? rest.slice(0, end) : rest) + sample;
    for (const token of ['ACQUIRING_PAYMENT', 'WALLET_PAYMENT', 'source_id', 'amount_minor', 'currency', 'idempotency_key']) {
      expect(section.includes(token)).toBe(true);
    }
  });

  it('the overview refund snippet uses the public typed-source fields only', () => {
    for (const token of ['ACQUIRING_PAYMENT', 'source_id', 'amount_minor', 'currency', 'idempotency_key']) {
      expect(OVERVIEW.includes(token)).toBe(true);
    }
  });

  it('the Refunds badge matches the manifest disposition, in both directions', () => {
    // The manifest is the source: only a capability released on deployed E2E
    // evidence may claim "Disponível em Sandbox". Anything short of released
    // must read "Em validação contínua no Sandbox" instead. Asserting both
    // directions means neither an over-claim nor a stale under-claim can pass.
    const released = isReleased('CAP-REFUND-001');
    if (released) {
      // No badge without a deployed run behind it.
      expect(capability('CAP-REFUND-001').tests.e2e_sandbox.length).toBeGreaterThan(0);
    }
    const CARDS = readFileSync(join(process.cwd(), 'app/developers/docs/CapabilityCards.tsx'), 'utf8');
    expect(/href: \{ pt: '\/docs\/refunds', en: '\/docs\/en\/refunds' \},\s*\n\s*tone: 'ok'/.test(CARDS)).toBe(released);
    expect(/href: \{ pt: '\/docs\/refunds', en: '\/docs\/en\/refunds' \},\s*\n\s*tone: 'val'/.test(CARDS)).toBe(!released);
    render(<PtRefundsPage />);
    expect(screen.getAllByRole('heading', { level: 1, name: 'Reembolsos' }).length).toBe(1);
  });

  it('the public docs make no network fetch and expose no Developer API / login-gated refund data', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = render(<PtRefundsPage />);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const a of Array.from(container.querySelectorAll('a[href]'))) {
      expect(a.getAttribute('href') ?? '').not.toContain('developer-api.banzami.com');
    }
  });
});
