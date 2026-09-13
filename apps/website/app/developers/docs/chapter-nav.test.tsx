// @vitest-environment jsdom
//
// Chapter navigation guards. The prev/next chapter controls at the bottom of
// every docs page derive from the single AREAS order (shell.tsx) — the same
// order as the sidebar groups. Verified on the first page (home: next only), a
// middle page (prev + next), and the last page (changelog: prev only), in PT
// and EN, with the destination title shown.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AREAS_PT, AREAS_EN } from './shell';

import DocsHomePt from './page';
import PtSdkPage from './sdk/page';
import PtChangelogPage from './changelog/page';
import DocsHomeEn from './en/page';
import EnSdkPage from './en/sdk/page';
import EnChangelogPage from './en/changelog/page';

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
      'Início', 'Quickstart', 'Como o Banzami funciona', 'Aceitar pagamentos', 'Webhooks', 'Reembolsos', 'Liquidações', 'Comprovativos',
      'Contas e transferências', 'Construir como o DOA', 'A Consola', 'Referência da API', 'Eventos', 'Erros', 'SDKs', 'Artefactos',
      'Testar no Sandbox', 'Do Sandbox ao Live', 'Segurança', 'Glossário', 'Resolução de problemas', 'Suporte', 'Changelog',
    ]);
  });
  it('home (first) shows only Próximo capítulo → Quickstart', () => {
    render(<DocsHomePt />);
    const nav = navOf(/Navegação de capítulos/i);
    expect(within(nav).queryByText(/Capítulo anterior/)).toBeNull();
    expect(within(nav).getByText(/Próximo capítulo/)).toBeTruthy();
    const nextLink = within(nav).getByRole('link');
    expect(nextLink.getAttribute('href')).toBe('/docs/get-started');
    expect(within(nextLink).getByText('Quickstart')).toBeTruthy();
  });
  it('sdk (middle) shows prev → Erros and next → Artefactos', () => {
    render(<PtSdkPage />);
    const nav = navOf(/Navegação de capítulos/i);
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/docs/errors');
    expect(within(links[0]).getByText('Erros')).toBeTruthy();
    expect(links[1].getAttribute('href')).toBe('/docs/artifacts');
    expect(within(links[1]).getByText('Artefactos')).toBeTruthy();
  });
  it('changelog (last) shows only Capítulo anterior → Suporte', () => {
    render(<PtChangelogPage />);
    const nav = navOf(/Navegação de capítulos/i);
    expect(within(nav).queryByText(/Próximo capítulo/)).toBeNull();
    const prevLink = within(nav).getByRole('link');
    expect(prevLink.getAttribute('href')).toBe('/docs/support');
    expect(within(prevLink).getByText('Suporte')).toBeTruthy();
  });
});

describe('Chapter navigation — EN', () => {
  it('order matches the canonical AREAS_EN sequence and mirrors PT by index', () => {
    expect(AREAS_EN.map((a) => a.label)).toEqual([
      'Home', 'Quickstart', 'How Banzami works', 'Accept payments', 'Webhooks', 'Refunds', 'Settlements', 'Receipts',
      'Accounts and transfers', 'Build like DOA', 'The Console', 'API reference', 'Events', 'Errors', 'SDKs', 'Artifacts',
      'Sandbox testing', 'From Sandbox toward Live', 'Security', 'Glossary', 'Troubleshooting', 'Support', 'Changelog',
    ]);
    expect(AREAS_EN.map((a) => a.slug)).toEqual(AREAS_PT.map((a) => a.slug));
  });
  it('home (first) shows only Next chapter → Quickstart', () => {
    render(<DocsHomeEn />);
    const nav = navOf(/Chapter navigation/i);
    expect(within(nav).queryByText(/Previous chapter/)).toBeNull();
    const nextLink = within(nav).getByRole('link');
    expect(nextLink.getAttribute('href')).toBe('/docs/en/get-started');
    expect(within(nextLink).getByText('Quickstart')).toBeTruthy();
  });
  it('sdk (middle) shows prev → Errors and next → Artifacts', () => {
    render(<EnSdkPage />);
    const nav = navOf(/Chapter navigation/i);
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/docs/en/errors');
    expect(links[1].getAttribute('href')).toBe('/docs/en/artifacts');
  });
  it('changelog (last) shows only Previous chapter → Support', () => {
    render(<EnChangelogPage />);
    const nav = navOf(/Chapter navigation/i);
    expect(within(nav).queryByText(/Next chapter/)).toBeNull();
    const prevLink = within(nav).getByRole('link');
    expect(prevLink.getAttribute('href')).toBe('/docs/en/support');
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
