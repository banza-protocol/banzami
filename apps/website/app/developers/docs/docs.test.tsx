// @vitest-environment jsdom
//
// Tests for the full public Developer Documentation page (/docs). Verifies the
// seven navigable sections, the four interactive capability cards (real links +
// factual badges), DOA reference, Produção card, honest Sandbox claims, copy +
// toast, sidebar active-state on navigation, no network fetch, no developer-api
// exposure, and that forbidden phrasings are absent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import DocsPage from './page';

beforeEach(() => {
  // jsdom lacks these — stub so the client effects/handlers don't throw.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn(); // jsdom has no real scrollIntoView
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Public Developer Docs (/docs) — full content', () => {
  it('renders the seven designed sidebar items as in-page links', () => {
    render(<DocsPage />);
    const nav = screen.getByRole('navigation', { name: /Secções da documentação/i });
    for (const item of ['Introdução', 'Quickstart', 'API Reference', 'SDKs', 'Webhooks', 'Errors', 'Changelog']) {
      const link = within(nav).getByRole('link', { name: item });
      expect(link.getAttribute('href')).toBe(`#${item === 'Introdução' ? 'introducao' : item === 'API Reference' ? 'api-reference' : item.toLowerCase()}`);
    }
  });

  it('the four capability cards are real links to their sections with factual badges', () => {
    const { container } = render(<DocsPage />);
    const map: [string, string][] = [
      ['Criar cobrança', '#cobranca'],
      ['Transferências', '#transferencias'],
      ['Webhooks', '#webhooks'],
      ['Reembolsos', '#reembolsos'],
    ];
    for (const [title, href] of map) {
      const card = container.querySelector(`a[href="${href}"]`) as HTMLElement;
      expect(card).toBeTruthy();
      expect(card.tagName).toBe('A');
      expect(card.textContent).toContain(title);
    }
    // honest statuses, not blanket "Em breve": capabilities are Sandbox-available
    // (Refunds is now "Disponível em Sandbox" too), while Produção stays gated.
    expect(screen.getAllByText('Disponível em Sandbox').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Produção em preparação').length).toBeGreaterThan(0);
  });

  it('presents the three layers and DOA as the reference integration', () => {
    render(<DocsPage />);
    expect(screen.getByText(/Banzami Developers Console/i)).toBeTruthy();
    expect(screen.getAllByText(/Camada de integração Banzami/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Banzami Operator \/ Core/i)).toBeTruthy();
    expect(screen.getByText(/DOA é a implementação de referência da integração Banzami/i)).toBeTruthy();
    expect(screen.getByText(/operacional no ambiente Sandbox/i)).toBeTruthy();
  });

  it('has the Produção-em-preparação card and the transition message', () => {
    render(<DocsPage />);
    expect(screen.getAllByText('Produção em preparação').length).toBeGreaterThan(0);
    expect(screen.getByText(/ativação para pagamentos reais será disponibilizada/i)).toBeTruthy();
  });

  it('API Reference uses the real payment-session model, never /v1/charges', () => {
    const { container } = render(<DocsPage />);
    expect(screen.getByText(/Gestão pela Console/i)).toBeTruthy();
    expect(screen.getAllByText(/Integração Banzami/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/createPaymentSession/)).toBeTruthy();
    expect(container.textContent).toContain('sandbox-api.banzami.com');
    expect(container.textContent).not.toContain('/v1/charges');
  });

  it('SDKs are shown as source-only (not published) with a maturity matrix', () => {
    render(<DocsPage />);
    expect(screen.getAllByText(/ainda não estão publicados em npm/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('@banzami/sdk').length).toBeGreaterThan(0);
    expect(screen.getByText(/Parcial — webhooks \+ payment links/i)).toBeTruthy();
  });

  it('Webhooks documents the canonical banza-signature header + real events', () => {
    const { container } = render(<DocsPage />);
    expect(screen.getAllByText(/banza-signature/i).length).toBeGreaterThan(0);
    expect(container.textContent).toContain('HMAC-SHA256');
    expect(screen.getByText('payment_link.paid')).toBeTruthy();
    expect(screen.getAllByText('payment_session.paid').length).toBeGreaterThan(0);
    expect(screen.getAllByText('application_settlement.completed').length).toBeGreaterThan(0);
    // the former log-line name must NOT appear as a documented event
    expect(screen.queryByText('application_settlement.executed')).toBeNull();
    // only the five verified events are catalogued — not the unverified ones,
    // anywhere on the page (events list, prose, or code samples)
    const text = container.textContent ?? '';
    for (const unverified of ['application_settlement.executed', 'payment.completed', 'transfer.completed', 'wallet.credit', 'transfer.initiated']) {
      expect(text).not.toContain(unverified);
    }
  });

  it('Webhooks callout does not overstate "no email" — controlled-test only, normal DOA flows deliver the receipt', () => {
    const { container } = render(<DocsPage />);
    const text = container.textContent ?? '';
    // Normal DOA flows with an email contact DELIVER the receipt to the donor.
    expect(text).toContain('nos fluxos normais com contacto por email, o DOA entrega o recibo ao doador');
    // The "no external email" claim may only appear scoped to the controlled test.
    expect(text).toContain('No teste controlado, não foi enviado email externo');
    // The old, misleading unscoped phrasing must never come back.
    expect(text).not.toContain('registado — sem entrega de email');
    // Any "sem entrega de email" wording, if ever present, must carry the controlled-test context.
    if (text.includes('sem entrega de email')) {
      expect(text).toContain('No teste controlado');
      expect(text).toContain('nos fluxos normais com contacto por email');
    }
    // The verified-journey + replay-dedup facts remain.
    expect(text).toContain('Jornada completa verificada em Sandbox');
    expect(text).toContain('deduplicada');
    expect(screen.getAllByText(/banza-signature/i).length).toBeGreaterThan(0);
  });

  it('copy button copies and shows an accessible toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<DocsPage />);
    fireEvent.click(screen.getAllByRole('button', { name: /Copiar/i })[0]);
    expect(writeText).toHaveBeenCalled();
    expect(await screen.findByText(/Copiado para a área de transferência/i)).toBeTruthy();
  });

  it('clicking a sidebar item sets it active (aria-current)', () => {
    render(<DocsPage />);
    const nav = screen.getByRole('navigation', { name: /Secções da documentação/i });
    const webhooks = within(nav).getByRole('link', { name: 'Webhooks' });
    fireEvent.click(webhooks);
    expect(webhooks.getAttribute('aria-current')).toBe('true');
  });

  it('makes no network fetch on load and exposes no developer-api href', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = render(<DocsPage />);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const a of Array.from(container.querySelectorAll('a[href]'))) {
      expect(a.getAttribute('href') ?? '').not.toContain('developer-api.banzami.com');
    }
  });

  it('avoids forbidden phrasings (mock / prova de conceito / Live no futuro / npm install)', () => {
    const { container } = render(<DocsPage />);
    const t = (container.textContent ?? '').toLowerCase();
    expect(t).not.toContain('apenas um mock');
    // "prova de conceito" (proof-of-concept hype) stays forbidden; the approved
    // "Conceitos" glossary section is legitimate and must not trip this lint.
    expect(t).not.toContain('prova de conceito');
    expect(t).not.toContain('live no futuro');
    expect(t).not.toContain('demonstração fictícia');
    // it explicitly tells developers NOT to run the (unpublished) install
    expect(container.textContent).toContain('Não corra');
  });

  it('keeps the support card pointing at the existing /suporte route', () => {
    render(<DocsPage />);
    expect(screen.getByRole('link', { name: 'Abrir suporte' }).getAttribute('href')).toBe('/suporte');
  });

  it('has the public back links to banzami.com and the Console login', () => {
    render(<DocsPage />);
    expect(screen.getByRole('link', { name: /Voltar ao Banzami/i }).getAttribute('href')).toBe('https://banzami.com');
    expect(screen.getByRole('link', { name: /Entrar na Consola/i }).getAttribute('href')).toBe('/login');
  });
});
