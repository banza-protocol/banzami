// @vitest-environment jsdom
//
// Focused tests for the public Developer Documentation page (/docs), rebuilt to
// the handoff §11 design. Verifies: public/static (no fetch, no developer-api),
// the designed 7-item sidebar, the 2×2 cards with "Em breve" badges, the cURL
// preview block framing, the blush support card, the public back links, and that
// the previously invented 8-section article is gone.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DocsPage from './page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DOC_NAV = ['Introdução', 'Quickstart', 'API Reference', 'SDKs', 'Webhooks', 'Errors', 'Changelog'];

describe('Public Developer Docs (/docs) — handoff §11', () => {
  it('renders publicly with the designed "Introdução" opening', () => {
    render(<DocsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Introdução' })).toBeTruthy();
    expect(
      screen.getByText(/Comece a integrar Banzami em poucos minutos\. Todas as chamadas usam o ambiente Sandbox por defeito\./i),
    ).toBeTruthy();
  });

  it('shows the seven designed sidebar items', () => {
    render(<DocsPage />);
    for (const item of DOC_NAV) {
      expect(screen.getAllByText(item).length).toBeGreaterThan(0);
    }
  });

  it('shows the four designed cards, each marked "Em breve"', () => {
    render(<DocsPage />);
    expect(screen.getByText('Criar cobrança')).toBeTruthy();
    expect(screen.getByText('Transferências')).toBeTruthy();
    expect(screen.getByText('Reembolsos')).toBeTruthy();
    expect(screen.getAllByText('Webhooks').length).toBeGreaterThan(0); // sidebar + card
    expect(screen.getAllByText('Em breve')).toHaveLength(4);
  });

  it('keeps the cURL block as a future preview, not callable today', () => {
    render(<DocsPage />);
    expect(screen.getByText(/cURL · criar cobrança · pré-visualização/i)).toBeTruthy();
    expect(screen.getByText('Copiar')).toBeTruthy();
    expect(screen.getByText(/endpoint público de integração planeado/i)).toBeTruthy();
    expect(screen.getByText(/ainda não disponível hoje e sem dinheiro real/i)).toBeTruthy();
  });

  it('keeps the blush support card pointing at an existing route', () => {
    render(<DocsPage />);
    expect(screen.getByText('Precisa de ajuda?')).toBeTruthy();
    const support = screen.getByRole('link', { name: 'Abrir suporte' });
    expect(support.getAttribute('href')).toBe('/suporte');
  });

  it('has the public back links and never exposes developer-api', () => {
    const { container } = render(<DocsPage />);
    expect(screen.getByRole('link', { name: /Voltar ao Banzami/i }).getAttribute('href')).toBe('https://banzami.com');
    expect(screen.getByRole('link', { name: /Entrar na Consola/i }).getAttribute('href')).toBe('/login');
    for (const a of Array.from(container.querySelectorAll('a[href]'))) {
      expect(a.getAttribute('href') ?? '').not.toContain('developer-api.banzami.com');
    }
  });

  it('attempts no network fetch on load', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<DocsPage />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no longer contains the invented 8-section article / full-width Sandbox banner', () => {
    render(<DocsPage />);
    expect(screen.queryByRole('heading', { name: 'Ambiente e limitações atuais' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Chaves de API Sandbox' })).toBeNull();
    expect(screen.queryByText(/Ainda não disponível \(deliberadamente adiado\)/i)).toBeNull();
    expect(screen.queryByText(/sem ativação de produção/i)).toBeNull();
  });
});
