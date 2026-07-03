// @vitest-environment jsdom
//
// Public Refunds documentation correctness (typed-source contract, BANZA ADR-030).
// Guards the public /docs Refunds section and the Developers overview refund
// example against ever teaching the obsolete/internal contract:
//   - never accept transaction_id / payment_id as a refund input;
//   - never expose the internal Core token TRANSACTION as a public source type;
//   - always present the public typed-source fields;
//   - Refunds badge is "Disponível em Sandbox";
//   - the page stays static (no login, no Developer API fetch).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DocsPage from './page';

const DOCS = readFileSync(join(process.cwd(), 'app/developers/docs/page.tsx'), 'utf8');
const OVERVIEW = readFileSync(join(process.cwd(), 'app/developers/page.tsx'), 'utf8');

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Refunds docs — typed-source public contract (ADR-030)', () => {
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
    // scope to the reembolsos section (from its anchor to the next H2/H3)
    const start = DOCS.indexOf('id="reembolsos"');
    const rest = DOCS.slice(start);
    const end = rest.indexOf('id="sdks"');
    const section = end > 0 ? rest.slice(0, end) : rest;
    for (const token of ['ACQUIRING_PAYMENT', 'WALLET_PAYMENT', 'source_id', 'amount_minor', 'currency', 'idempotency_key']) {
      expect(section.includes(token)).toBe(true);
    }
  });

  it('the overview refund snippet uses the public typed-source fields only', () => {
    for (const token of ['ACQUIRING_PAYMENT', 'source_id', 'amount_minor', 'currency', 'idempotency_key']) {
      expect(OVERVIEW.includes(token)).toBe(true);
    }
  });

  it('the Refunds badge is "Disponível em Sandbox"', () => {
    // section badge
    expect(/id="reembolsos">\s*Reembolsos\s*<Badge tone="ok"/.test(DOCS)).toBe(true);
    // rendered: the label appears (capability card + section)
    render(<DocsPage />);
    expect(screen.getAllByText('Disponível em Sandbox').length).toBeGreaterThan(0);
  });

  it('the public docs make no network fetch and expose no Developer API / login-gated refund data', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = render(<DocsPage />);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const a of Array.from(container.querySelectorAll('a[href]'))) {
      expect(a.getAttribute('href') ?? '').not.toContain('developer-api.banzami.com');
    }
  });
});
