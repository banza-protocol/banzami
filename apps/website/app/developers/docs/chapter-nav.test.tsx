// @vitest-environment jsdom
//
// Chapter navigation guards. The prev/next chapter controls at the bottom of
// every docs page derive from the single AREAS order (shell.tsx) — the same
// order as the sidebar and landing cards. Verified on the first page (home:
// next only), a middle page (prev + next), and the last page (glossary: prev
// only), in PT and EN, with the destination section title shown.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AREAS_PT, AREAS_EN } from './shell';

import DocsHomePt from './page';
import PtSdkPage from './sdk/page';
import PtGlossaryPage from './glossary/page';
import DocsHomeEn from './en/page';
import EnSdkPage from './en/sdk/page';
import EnGlossaryPage from './en/glossary/page';

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const navOf = (name: RegExp) => screen.getByRole('navigation', { name });

describe('Chapter navigation — PT', () => {
  it('order matches the canonical AREAS_PT sequence', () => {
    expect(AREAS_PT.map((a) => a.label)).toEqual([
      'Início', 'Começar', 'SDKs', 'Guias', 'Referência API', 'Testar no Sandbox', 'Confiança e prontidão', 'Artefactos', 'Changelog', 'Glossário',
    ]);
  });
  it('home (first) shows only Próximo capítulo → Começar', () => {
    render(<DocsHomePt />);
    const nav = navOf(/Navegação de capítulos/i);
    expect(within(nav).queryByText(/Capítulo anterior/)).toBeNull();
    expect(within(nav).getByText(/Próximo capítulo/)).toBeTruthy();
    const nextLink = within(nav).getByRole('link');
    expect(nextLink.getAttribute('href')).toBe('/docs/get-started');
    expect(within(nextLink).getByText('Começar')).toBeTruthy();
  });
  it('sdk (middle) shows prev → Começar and next → Guias', () => {
    render(<PtSdkPage />);
    const nav = navOf(/Navegação de capítulos/i);
    expect(within(nav).getByText(/Capítulo anterior/)).toBeTruthy();
    expect(within(nav).getByText(/Próximo capítulo/)).toBeTruthy();
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/docs/get-started');
    expect(within(links[0]).getByText('Começar')).toBeTruthy();
    expect(links[1].getAttribute('href')).toBe('/docs/guides');
    expect(within(links[1]).getByText('Guias')).toBeTruthy();
  });
  it('glossary (last) shows only Capítulo anterior → Changelog', () => {
    render(<PtGlossaryPage />);
    const nav = navOf(/Navegação de capítulos/i);
    expect(within(nav).queryByText(/Próximo capítulo/)).toBeNull();
    expect(within(nav).getByText(/Capítulo anterior/)).toBeTruthy();
    const prevLink = within(nav).getByRole('link');
    expect(prevLink.getAttribute('href')).toBe('/docs/changelog');
    expect(within(prevLink).getByText('Changelog')).toBeTruthy();
  });
});

describe('Chapter navigation — EN', () => {
  it('order matches the canonical AREAS_EN sequence and mirrors PT by index', () => {
    expect(AREAS_EN.map((a) => a.label)).toEqual([
      'Home', 'Get started', 'SDKs', 'Guides', 'API Reference', 'Sandbox testing', 'Trust and readiness', 'Artifacts', 'Changelog', 'Glossary',
    ]);
    expect(AREAS_EN.map((a) => a.slug)).toEqual(AREAS_PT.map((a) => a.slug));
  });
  it('home (first) shows only Next chapter → Get started', () => {
    render(<DocsHomeEn />);
    const nav = navOf(/Chapter navigation/i);
    expect(within(nav).queryByText(/Previous chapter/)).toBeNull();
    const nextLink = within(nav).getByRole('link');
    expect(nextLink.getAttribute('href')).toBe('/docs/en/get-started');
    expect(within(nextLink).getByText('Get started')).toBeTruthy();
  });
  it('sdk (middle) shows prev → Get started and next → Guides', () => {
    render(<EnSdkPage />);
    const nav = navOf(/Chapter navigation/i);
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/docs/en/get-started');
    expect(links[1].getAttribute('href')).toBe('/docs/en/guides');
    expect(within(links[1]).getByText('Guides')).toBeTruthy();
  });
  it('glossary (last) shows only Previous chapter → Changelog', () => {
    render(<EnGlossaryPage />);
    const nav = navOf(/Chapter navigation/i);
    expect(within(nav).queryByText(/Next chapter/)).toBeNull();
    const prevLink = within(nav).getByRole('link');
    expect(prevLink.getAttribute('href')).toBe('/docs/en/changelog');
    expect(within(prevLink).getByText('Changelog')).toBeTruthy();
  });
});

describe('Chapter navigation — integrity', () => {
  it('no loops or broken order: every neighbour link resolves to a real area route', () => {
    const slugs = new Set(AREAS_PT.map((a) => a.slug));
    for (const arr of [AREAS_PT, AREAS_EN]) {
      arr.forEach((a, i) => {
        if (i > 0) expect(slugs.has(arr[i - 1].slug)).toBe(true);
        if (i < arr.length - 1) expect(slugs.has(arr[i + 1].slug)).toBe(true);
        // a page never links to itself.
        expect(arr[i - 1]?.slug).not.toBe(a.slug);
        expect(arr[i + 1]?.slug).not.toBe(a.slug);
      });
    }
  });
});
