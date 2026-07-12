// @vitest-environment jsdom
//
// Concepts/Glossary guards after the P3A information architecture. The
// pre-P3A suite guarded the single-page "Glossário → Conceitos" rename with
// scroll-spy anchors; P3A moves the concepts to a dedicated /docs/glossary
// route (nav label "Glossário" per the P3A IA, with "Conceitos" as the section
// heading), so these tests FOLLOW THE MOVE: same content, same anchors
// (#conceitos canonical + legacy #glossario preserved), same static guarantee.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import DocsHomePt from './page';
import PtGlossaryPage from './glossary/page';
import { GLOSSARY } from './glossary';

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Glossary route — Conceitos content preserved (P3A)', () => {
  it('the home sidebar links "Glossário" to the dedicated glossary route', () => {
    render(<DocsHomePt />);
    const nav = screen.getByRole('navigation', { name: /Secções da documentação/i });
    const link = within(nav).getByRole('link', { name: 'Glossário' });
    expect(link.getAttribute('href')).toBe('/docs/glossary');
  });
  it('the glossary page shows the Conceitos heading and subtitle', () => {
    render(<PtGlossaryPage />);
    expect(screen.getByRole('heading', { name: 'Conceitos' })).toBeTruthy();
    expect(screen.getByText(/Definições rápidas dos termos usados/)).toBeTruthy();
  });
  it('renders every canonical glossary term with its definition', () => {
    render(<PtGlossaryPage />);
    for (const e of GLOSSARY) {
      expect(screen.getAllByText(e.term).length, `missing term ${e.term}`).toBeGreaterThan(0);
    }
  });
  it('#conceitos is the canonical anchor and the legacy #glossario anchor is preserved', () => {
    const { container } = render(<PtGlossaryPage />);
    expect(container.querySelector('#conceitos')).toBeTruthy();
    expect(container.querySelector('#glossario')).toBeTruthy();
    // Per-term deep links kept for back-compat.
    expect(container.querySelector('#glossario-sandbox')).toBeTruthy();
    expect(container.querySelector('#glossario-idempotencia')).toBeTruthy();
  });
  it('the glossary route is static — no fetch, no session, no developer-api', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<PtGlossaryPage />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
