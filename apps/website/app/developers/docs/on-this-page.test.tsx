// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { activeSection, OnThisPage } from './DocsSearch';

afterEach(cleanup);

/**
 * "Nesta página" follows the reader: the entry of the section being read is the
 * highlighted one (aria-current="location"), the last one at the very bottom of
 * the page, and the one just clicked straight away.
 */
describe('activeSection — which section the reader is in', () => {
  const line = 120;
  it('is the first section before any heading reaches the reading line', () => {
    expect(activeSection([400, 900, 1500], line, false)).toBe(0);
  });
  it('is the last heading that has passed the reading line', () => {
    expect(activeSection([-800, -200, 100, 700], line, false)).toBe(2);
    expect(activeSection([-800, 121, 700], line, false)).toBe(0);
  });
  it('is the last section at the bottom of the page, even if it never reaches the line', () => {
    expect(activeSection([-900, -300, 500], line, true)).toBe(2);
  });
  it('is nothing when the page has no sections', () => {
    expect(activeSection([], line, false)).toBe(-1);
  });
});

describe('OnThisPage — the highlighted entry', () => {
  function page(tops: Record<string, number>) {
    const root = document.createElement('div');
    root.id = 'docs-content';
    for (const [id, top] of Object.entries(tops)) {
      const h = document.createElement('h2');
      h.id = id;
      h.textContent = id;
      h.getBoundingClientRect = () => ({ top, bottom: top + 30, left: 0, right: 0, width: 0, height: 30, x: 0, y: top, toJSON: () => ({}) });
      root.appendChild(h);
    }
    document.body.appendChild(root);
    return root;
  }
  afterEach(() => document.getElementById('docs-content')?.remove());

  it('marks the section under the reading line, and moves with the scroll', async () => {
    const root = page({ arquitetura: -400, percurso: 60, webhook: 800 });
    render(<OnThisPage lang="pt" variant="rail" />);
    await act(async () => {});
    expect(screen.getByRole('link', { name: 'percurso' }).getAttribute('aria-current')).toBe('location');
    expect(screen.getByRole('link', { name: 'arquitetura' }).getAttribute('aria-current')).toBeNull();

    // The reader scrolls: the webhook section passes the line.
    (root.querySelector('#percurso') as HTMLElement).getBoundingClientRect = () => ({ top: -500, bottom: -470, left: 0, right: 0, width: 0, height: 30, x: 0, y: -500, toJSON: () => ({}) });
    (root.querySelector('#webhook') as HTMLElement).getBoundingClientRect = () => ({ top: 90, bottom: 120, left: 0, right: 0, width: 0, height: 30, x: 0, y: 90, toJSON: () => ({}) });
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(screen.getByRole('link', { name: 'webhook' }).getAttribute('aria-current')).toBe('location');
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current')).length).toBe(1);
  });

  it('marks the entry that was clicked straight away', async () => {
    page({ um: 50, dois: 700, tres: 1400 });
    render(<OnThisPage lang="pt" variant="rail" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('link', { name: 'tres' }));
    expect(screen.getByRole('link', { name: 'tres' }).getAttribute('aria-current')).toBe('location');
  });
});
