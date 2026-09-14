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
import PtWebhooksPage from './webhooks/page';
import PtConceptsPage from './concepts/page';
import PtSdkPage from './sdk/page';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const PT = read('app/developers/docs/content-pt.tsx') + read('app/developers/docs/HomePage.tsx') + read('app/developers/docs/events.ts');

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Public Developer Docs — P3A landing + area routes', () => {
  it('the PT sidebar lists every documentation page as a route link, grouped by task', () => {
    render(<DocsHomePt />);
    const nav = screen.getByRole('navigation', { name: /Secções da documentação/i });
    const expected: [string, string][] = [
      ['Quickstart', '/docs/get-started'],
      ['Como o Banzami funciona', '/docs/concepts'],
      ['Aceitar pagamentos', '/docs/payments'],
      ['Webhooks', '/docs/webhooks'],
      ['Eventos', '/docs/events'],
      ['Erros', '/docs/errors'],
      ['Referência da API', '/docs/reference'],
      ['Testar no Sandbox', '/docs/testing'],
      ['Segurança', '/docs/trust'],
      ['Resolução de problemas', '/docs/troubleshooting'],
      ['Suporte', '/docs/support'],
      ['Glossário', '/docs/glossary'],
    ];
    for (const [label, href] of expected) {
      const link = within(nav).getByRole('link', { name: label });
      expect(link.getAttribute('href')).toBe(href);
    }
    for (const group of ['Começar', 'Construir', 'Consola', 'Referência', 'Aprender', 'Recursos']) expect(within(nav).getByText(group)).toBeTruthy();
  });
  it('the PT home starts from tasks: what to build, two ways in, and the environment', () => {
    render(<DocsHomePt />);
    expect(screen.getByRole('heading', { level: 1, name: 'Documentação para developers' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Começar a construir' }).getAttribute('href')).toBe('/docs/get-started');
    expect(screen.getAllByRole('link', { name: 'Referência da API' }).some((a) => a.getAttribute('href') === '/docs/reference')).toBe(true);
    expect(screen.getByText('Sandbox disponível')).toBeTruthy();
    expect(screen.getByText('Financial Live indisponível')).toBeTruthy();
    for (const task of ['Aceitar um pagamento', 'Partilhar um link de pagamento', 'Mostrar um QR', 'Receber webhooks', 'Reembolsar um pagamento', 'Liquidar uma conta', 'Verificar um comprovativo', 'Construir como o DOA']) {
      expect(screen.getAllByText(task).length).toBeGreaterThan(0);
    }
    // The deep content is on the task pages, not the home page.
    expect(screen.queryByText('Configurar um endpoint, passo a passo')).toBeNull();
  });
  it('the four capability cards are real links to their pages with factual badges', () => {
    render(<PtConceptsPage />);
    for (const [title, href] of [
      ['Aceitar pagamentos', '/docs/payments'],
      ['Transferências entre contas', '/docs/transfers'],
      ['Webhooks', '/docs/webhooks'],
      ['Reembolsos', '/docs/refunds'],
    ] as [string, string][]) {
      const card = screen.getAllByRole('link')
        .find((a) => a.getAttribute('href') === href && (a.textContent ?? '').includes(title));
      expect(card, `capability card for ${title}`).toBeTruthy();
    }
    expect(screen.getAllByText('Disponível em Sandbox').length).toBeGreaterThan(0);
  });
  it('states Sandbox and Live truthfully: fictitious money, Live unavailable, live keys refused', () => {
    render(<PtConceptsPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Sandbox e Live' })).toBeTruthy();
    expect(PT).toContain('usam dinheiro fictício');
    expect(PT).toContain('bz_live_ é recusada; não são emitidas');
    expect(PT).toMatch(/O DOA é uma implementação de referência, não um cliente privilegiado do Banzami/);
  });
  it('API Reference uses the real payment-session model, never /v1/charges', () => {
    expect(PT).toContain('createPaymentSession');
    expect(PT).toContain('sandbox-api.banzami.com');
    expect(PT.includes('/v1/charges')).toBe(false);
  });
  it('SDKs are shown with what is published and what is not (sdk route)', () => {
    render(<PtSdkPage />);
    expect(screen.getAllByText(/não estão publicados/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/npm install @banzami\/sdk/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('@banzami/sdk').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Não publicado').length).toBeGreaterThan(0);
  });
  it('Webhooks documents the canonical banza-signature header + only emitted events (webhooks route)', () => {
    render(<PtWebhooksPage />);
    expect(screen.getAllByText(/banza-signature/).length).toBeGreaterThan(0);
    for (const ev of ['payment_session.paid', 'payment_link.paid', 'refund.completed', 'application_settlement.completed', 'application_settlement.cancelled', 'application_settlement.failed']) {
      expect(PT.includes(ev), `missing verified event ${ev}`).toBe(true);
    }
    for (const bad of ['application_settlement.executed', 'payment.completed', 'transfer.completed', 'wallet.credit', 'transfer.initiated']) {
      const code = PT.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      expect(code.includes(bad), `unverified event ${bad} must never appear`).toBe(false);
    }
  });
  it('webhook delivery is described as real, and events emitted while disabled as never delivered', () => {
    expect(PT).toContain('A entrega de webhooks é real, sobre a internet pública.');
    expect(PT).toContain('nunca lhe são entregues');
  });
  it('copy button copies the raw source and announces it', async () => {
    const writeText = vi.fn((_: string) => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PtGetStartedPage />);
    const btn = screen.getAllByRole('button', { name: /Copiar/i })[0];
    fireEvent.click(btn);
    const block = btn.closest('[data-code-block]');
    expect(writeText).toHaveBeenCalled();
    expect(String(writeText.mock.calls[0][0]).length).toBe(Number(block?.getAttribute('data-raw-length')));
    expect(await screen.findByText('Código copiado para a área de transferência')).toBeTruthy();
    expect(within(btn).getByText('Copiado')).toBeTruthy();
  });
  it('the sidebar marks the current area with aria-current', () => {
    render(<PtSdkPage />);
    const nav = screen.getByRole('navigation', { name: /Secções da documentação/i });
    const active = within(nav).getByRole('link', { name: 'SDKs' });
    expect(active.getAttribute('aria-current')).toBe('page');
  });
  it('no page fetches on load and no developer-api origin is exposed', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const Page of [DocsHomePt, PtGetStartedPage, PtWebhooksPage, PtSdkPage]) {
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
    expect(screen.getAllByRole('link', { name: /Entrar na Consola/i }).some((a) => a.getAttribute('href') === '/login')).toBe(true);
  });
});
