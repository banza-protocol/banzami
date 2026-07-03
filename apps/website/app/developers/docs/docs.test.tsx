// @vitest-environment jsdom
//
// Focused tests for the public Developer Documentation page (/docs): it must be
// publicly reachable (no auth guard), attempt no network fetch, expose no
// developer-api href, show the Sandbox-only warning, present Live capabilities
// as unavailable, and carry the required back links.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DocsPage from './page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Public Developer Docs (/docs)', () => {
  it('renders publicly, with no authenticated session or guard', () => {
    // A public page has no PortalGuard/redirect — it renders its content directly.
    render(<DocsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Documentação' })).toBeTruthy();
    for (const t of [
      'Visão geral',
      'Começar',
      'Autenticação e sessões',
      'Chaves de API Sandbox',
      'Projetos e workspaces',
      'Referência de API',
      'Erros e segurança',
      'Ambiente e limitações atuais',
    ]) {
      expect(screen.getByRole('heading', { name: t })).toBeTruthy();
    }
  });

  it('attempts no network fetch on load (no developer-api dependency)', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<DocsPage />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('has no href pointing at the backend developer-api host', () => {
    const { container } = render(<DocsPage />);
    const anchors = Array.from(container.querySelectorAll('a[href]'));
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(a.getAttribute('href') ?? '').not.toContain('developer-api.banzami.com');
    }
  });

  it('shows the Sandbox-only warning', () => {
    render(<DocsPage />);
    expect(screen.getAllByText(/SANDBOX/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/sem dinheiro real/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/sem ativação de produção/i).length).toBeGreaterThan(0);
  });

  it('presents Live / production capabilities as NOT available (not active features)', () => {
    render(<DocsPage />);
    expect(screen.getByText(/Ainda não disponível \(deliberadamente adiado\)/i)).toBeTruthy();
    expect(screen.getByText(/Chaves Live/i)).toBeTruthy();
    // The future payment API sample is explicitly labelled as not yet available.
    expect(screen.getAllByText(/ainda não disponível/i).length).toBeGreaterThan(0);
  });

  it('labels api.banzami.com as a planned future endpoint, not a callable API', () => {
    render(<DocsPage />);
    // The three required preview labels are visible.
    expect(screen.getByText('Pré-visualização')).toBeTruthy();
    expect(screen.getByText('Ainda não disponível')).toBeTruthy();
    expect(screen.getByText('Sandbox sem pagamentos reais')).toBeTruthy();
    // api.banzami.com is framed as the planned public endpoint, not available/callable.
    expect(screen.getByText(/endpoint público de integração planeado/i)).toBeTruthy();
    expect(screen.getByText(/não é uma API disponível nem chamável hoje/i)).toBeTruthy();
  });

  it('has visible back links to banzami.com and to the Console login', () => {
    render(<DocsPage />);
    const toSite = screen.getAllByRole('link', { name: /Voltar ao Banzami/i });
    expect(toSite.length).toBeGreaterThan(0);
    for (const a of toSite) expect(a.getAttribute('href')).toBe('https://banzami.com');

    const toConsole = screen.getAllByRole('link', { name: /Entrar na Consola/i });
    expect(toConsole.length).toBeGreaterThan(0);
    for (const a of toConsole) expect(a.getAttribute('href')).toBe('/login');
  });
});
