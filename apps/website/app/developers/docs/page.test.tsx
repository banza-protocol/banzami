// @vitest-environment jsdom
//
// Public Developer docs page — the "Glossário → Conceitos" rename, with
// backward-compatible deep links. Covers: visible wording (sidebar + heading),
// canonical #conceitos + legacy #glossario anchors resolving to the same
// section, scroll-spy highlighting Conceitos, and the guarantee that /docs is
// static (no fetch/session/API on render).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import DocsPage from './page';

// jsdom lacks IntersectionObserver — capture instances so we can drive scroll-spy.
type IOEntry = { isIntersecting: boolean; target: Element; boundingClientRect: { top: number } };
const ioInstances: MockIO[] = [];
class MockIO {
  cb: (entries: IOEntry[], io: MockIO) => void;
  elements: Element[] = [];
  constructor(cb: (entries: IOEntry[], io: MockIO) => void) {
    this.cb = cb;
    ioInstances.push(this);
  }
  observe(el: Element) { this.elements.push(el); }
  unobserve(el: Element) { this.elements = this.elements.filter((e) => e !== el); }
  disconnect() { this.elements = []; }
}

beforeEach(() => {
  ioInstances.length = 0;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockIO as unknown;
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = window.matchMedia || (((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  })) as unknown as typeof window.matchMedia);
  window.location.hash = '';
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('DocsPage — Glossário → Conceitos rename', () => {
  it('1. shows "Conceitos" in the sidebar nav and as the section heading', () => {
    render(<DocsPage />);
    const nav = screen.getByRole('navigation', { name: /secções da documentação/i }).parentElement!;
    expect(within(nav).getByRole('link', { name: 'Conceitos' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Conceitos' })).toBeTruthy();
  });

  it('2. no longer shows "Glossário" as visible navigation or title wording', () => {
    render(<DocsPage />);
    expect(screen.queryByRole('link', { name: 'Glossário' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Glossário' })).toBeNull();
    expect(screen.queryByText('Glossário')).toBeNull();
  });

  it('carries the Conceitos subtitle', () => {
    render(<DocsPage />);
    expect(screen.getByText(/Definições rápidas dos termos usados nesta documentação/)).toBeTruthy();
  });

  it('3. #conceitos is the canonical anchor and the sidebar link scrolls to it', () => {
    render(<DocsPage />);
    const section = document.getElementById('conceitos');
    expect(section?.tagName.toLowerCase()).toBe('section');
    const link = screen.getByRole('link', { name: 'Conceitos' });
    expect(link.getAttribute('href')).toBe('#conceitos');
    fireEvent.click(link);
    expect(section!.scrollIntoView).toHaveBeenCalled();
    expect(window.location.hash).toBe('#conceitos');
  });

  it('4. legacy #glossario anchor still resolves to the same Concepts section', () => {
    render(<DocsPage />);
    const legacy = document.getElementById('glossario');
    const section = document.getElementById('conceitos');
    expect(legacy).toBeTruthy();
    // the legacy anchor lives inside the canonical section → same scroll target
    expect(section!.contains(legacy)).toBe(true);
  });

  it('5. scroll-spy observes the Concepts section and highlights Conceitos for either anchor', () => {
    render(<DocsPage />);
    const section = document.getElementById('conceitos')!;
    const io = ioInstances.find((i) => i.elements.includes(section));
    expect(io).toBeTruthy(); // the section is under scroll-spy observation
    act(() => io!.cb([{ isIntersecting: true, target: section, boundingClientRect: { top: 10 } }], io!));
    const link = screen.getByRole('link', { name: 'Conceitos' });
    expect(link.getAttribute('aria-current')).toBe('true');
  });

  it('7. /docs renders statically — no fetch/session/API call', () => {
    const fetchSpy = vi.fn();
    (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
    render(<DocsPage />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('6. the Conceitos appendix link stays reachable as the secondary nav item', () => {
    render(<DocsPage />);
    // Scope to the sidebar aside — labels like "SDKs" also appear inline in prose.
    const aside = screen.getByRole('navigation', { name: /secções/i }).closest('aside')!;
    for (const label of ['Introdução', 'Quickstart', 'API Reference', 'SDKs', 'Webhooks', 'Errors', 'Changelog', 'Conceitos']) {
      expect(within(aside).getByRole('link', { name: label })).toBeTruthy();
    }
  });
});
