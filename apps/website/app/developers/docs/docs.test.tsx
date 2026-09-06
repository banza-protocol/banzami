// @vitest-environment jsdom
//
// Public Developer Docs — full content guards, P3A information architecture.
// Every guarantee of the pre-P3A single-page suite is preserved; the assertions
// simply FOLLOW THE MOVED CONTENT to its new area routes (see content-map.ts):
// PT home is a landing/index; get-started carries intro/quickstart; guides
// carries payments+webhooks; reference carries the API reference; sdk carries
// the SDK content. Corpus greps keep the claim-safety wording locked.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import DocsHomePt from './page';
import PtGetStartedPage from './get-started/page';
import PtGuidesPage from './guides/page';
import PtSdkPage from './sdk/page';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const PT = read('app/developers/docs/content-pt.tsx') + read('app/developers/docs/page.tsx');

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Public Developer Docs — P3A landing + area routes', () => {
  it('the PT home renders the nine documentation areas as route links', () => {
    render(<DocsHomePt />);
    const nav = screen.getByRole('navigation', { name: /Secções da documentação/i });
    const expected: [string, string][] = [
      ['Começar', '/docs/get-started'],
      ['SDKs', '/docs/sdk'],
      ['Guias', '/docs/guides'],
      ['Referência API', '/docs/reference'],
      ['Testar no Sandbox', '/docs/testing'],
      ['Confiança e prontidão', '/docs/trust'],
      ['Artefactos', '/docs/artifacts'],
      ['Changelog', '/docs/changelog'],
      ['Glossário', '/docs/glossary'],
    ];
    for (const [label, href] of expected) {
      const link = within(nav).getByRole('link', { name: label });
      expect(link.getAttribute('href')).toBe(href);
    }
  });
  it('the PT home is a landing page (title + status card), not the former giant page', () => {
    render(<DocsHomePt />);
    expect(screen.getByText('Documentação Developers Banzami')).toBeTruthy();
    expect(screen.getByText('Estado atual')).toBeTruthy();
    // The giant page's deep content must NOT be on the landing page itself.
    expect(screen.queryByText('Contrato esperado do SDK')).toBeNull();
    expect(screen.queryByText('Referência por recurso')).toBeNull();
  });
  it('the four capability cards are real links to the guides sections with factual badges', () => {
    render(<PtGetStartedPage />);
    for (const [title, href] of [
      ['Criar cobrança', '/docs/guides#cobranca'],
      ['Transferências', '/docs/guides#transferencias'],
      ['Webhooks', '/docs/guides#webhooks'],
      ['Reembolsos', '/docs/guides#reembolsos'],
    ] as [string, string][]) {
      // Scope to the card links: the prose around them legitimately names the
      // same capabilities, so a bare text lookup matches more than the card.
      const card = screen.getAllByRole('link')
        .find((a) => a.getAttribute('href') === href && (a.textContent ?? '').includes(title));
      expect(card, `capability card for ${title}`).toBeTruthy();
    }
    expect(screen.getAllByText('Disponível em Sandbox').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Produção em preparação').length).toBeGreaterThan(0);
  });
  it('presents the three layers and DOA as the reference integration (get-started)', () => {
    render(<PtGetStartedPage />);
    expect(screen.getByText('Três camadas')).toBeTruthy();
    expect(screen.getByText(/DOA · INTEGRAÇÃO DE REFERÊNCIA/)).toBeTruthy();
    expect(PT).toContain('operacional no ambiente Sandbox');
  });
  it('has the Produção-em-preparação card and the transition message (get-started)', () => {
    render(<PtGetStartedPage />);
    expect(screen.getAllByText('Produção').length).toBeGreaterThan(0);
    expect(PT).toContain('A ativação para pagamentos reais');
  });
  it('API Reference uses the real payment-session model, never /v1/charges', () => {
    expect(PT).toContain('createPaymentSession');
    expect(PT).toContain('sandbox-api.banzami.com');
    expect(PT.includes('/v1/charges')).toBe(false);
  });
  it('SDKs are shown with what is published and what is still source-only (sdk route)', () => {
    render(<PtSdkPage />);
    expect(screen.getAllByText(/ainda não foram publicados/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/npm install @banzami\/sdk/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('@banzami/sdk').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Parcial — webhooks + payment links').length).toBeGreaterThan(0);
  });
  it('Webhooks documents the canonical banza-signature header + real events (guides route)', () => {
    render(<PtGuidesPage />);
    expect(screen.getAllByText(/banza-signature/).length).toBeGreaterThan(0);
    for (const ev of ['payment_session.paid', 'payment_link.paid', 'application_settlement.completed', 'application_settlement.cancelled', 'application_settlement.failed']) {
      expect(PT.includes(ev), `missing verified event ${ev}`).toBe(true);
    }
    for (const bad of ['application_settlement.executed', 'payment.completed', 'transfer.completed', 'wallet.credit', 'transfer.initiated']) {
      const code = PT.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      expect(code.includes(bad), `unverified event ${bad} must never appear`).toBe(false);
    }
  });
  it('Webhooks callout keeps the scoped email honesty (controlled test vs normal DOA flows)', () => {
    expect(PT).toContain('não foi enviado email externo');
    expect(PT.replace(/\s+/g, ' ')).toContain('o DOA entrega o recibo ao doador');
  });
  it('copy button copies and shows an accessible toast', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PtGetStartedPage />);
    const btn = screen.getAllByRole('button', { name: /Copiar/i })[0];
    fireEvent.click(btn);
    expect(writeText).toHaveBeenCalled();
    expect(await screen.findByText('Copiado para a área de transferência')).toBeTruthy();
  });
  it('the sidebar marks the current area with aria-current', () => {
    render(<PtSdkPage />);
    const nav = screen.getByRole('navigation', { name: /Secções da documentação/i });
    const active = within(nav).getByRole('link', { name: 'SDKs' });
    expect(active.getAttribute('aria-current')).toBe('true');
  });
  it('no page fetches on load and no developer-api origin is exposed', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const Page of [DocsHomePt, PtGetStartedPage, PtGuidesPage, PtSdkPage]) {
      render(<Page />);
      cleanup();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(PT.includes('developer-api.banzami.com')).toBe(false);
  });
  it('avoids forbidden phrasings and gives the real install command', () => {
    for (const bad of ['apenas um mock', 'prova de conceito', 'live no futuro', 'demonstração fictícia']) {
      expect(PT.toLowerCase().includes(bad)).toBe(false);
    }
    // The TypeScript SDK is published, so the real install command belongs here
    // and the old "do not run" wording must be gone.
    expect(PT.split('npm install @banzami/sdk').length - 1).toBeGreaterThanOrEqual(1);
    expect(PT.includes('Não corra'), 'the anti-instruction must not survive publication').toBe(false);
  });
  it('the get-started page links back to banzami.com and to the Console login', () => {
    render(<PtGetStartedPage />);
    expect(screen.getByRole('link', { name: /Voltar ao Banzami/i }).getAttribute('href')).toBe('https://banzami.com');
    expect(screen.getByRole('link', { name: /Entrar na Consola/i }).getAttribute('href')).toBe('/login');
  });
});
