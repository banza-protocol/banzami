// @vitest-environment jsdom
//
// P0 documentation accuracy guards (docs/developer/DOCUMENTATION_AUDIT.md).
// Extends the honesty-test perimeter to the Developers OVERVIEW page and the
// shared doc components, and locks in the P0 content contracts on /docs:
//   - curl-first quickstart (no unpublished SDK as the primary path);
//   - canonical error envelope + status table;
//   - Idempotency-Key shown in code, with the real Sandbox semantics;
//   - credential↔capability matrix (refunds/transfers not fully available for
//     developer keys while their scopes are pending E2E);
//   - webhook outbound delivery not claimed as publicly active (simulated in
//     the public E2E) + implemented retry contract documented;
//   - top-of-page Sandbox/Preview status with demo/non-operational Console;
//   - no unverified event vocabulary and no fake SDK install commands anywhere
//     on /docs, the overview, or the doc diagram components.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DocsPage from './page';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const DOCS = read('app/developers/docs/page.tsx');
const OVERVIEW = read('app/developers/page.tsx');
const WEBHOOK_DIAGRAM = read('components/developers/WebhookFlowDiagram.tsx');
const SDK_DIAGRAM = read('components/developers/SdkEcosystemDiagram.tsx');
const SURFACES = { DOCS, OVERVIEW, WEBHOOK_DIAGRAM, SDK_DIAGRAM };

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// The verified closed catalogue (mirrors the /docs EVENTS list).
const VERIFIED_EVENTS = [
  'payment_session.paid',
  'payment_link.paid',
  'application_settlement.completed',
  'application_settlement.cancelled',
  'application_settlement.failed',
];
// Illustrative vocabulary that must never appear as a contractual claim.
const FORBIDDEN_EVENTS = [
  'payment.created',
  'payment.confirmed',
  'payment.failed',
  'payment.refunded',
  'payment.pending_confirmation',
  'payment.completed',
  'transfer.completed',
  'transfer.initiated',
  'wallet.credit',
  'wallet.debit',
];

describe('P0 — unverified event vocabulary is banned on every developer surface', () => {
  for (const [name, src] of Object.entries(SURFACES)) {
    it(`${name} contains no forbidden event names`, () => {
      for (const ev of FORBIDDEN_EVENTS) {
        // Comments may name them only to forbid them; strip comment lines first.
        const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
        expect(code.includes(ev), `${name} must not contain "${ev}"`).toBe(false);
      }
    });
  }
  it('the webhook diagram uses only verified event names', () => {
    const listed = WEBHOOK_DIAGRAM.match(/'[a-z_]+\.[a-z_]+'/g) ?? [];
    for (const raw of listed) {
      expect(VERIFIED_EVENTS).toContain(raw.replace(/'/g, ''));
    }
    expect(listed.length).toBeGreaterThan(0);
  });
});

describe('P0 — no fake SDK install commands, SDKs never the primary path', () => {
  it('overview has no install command for unpublished packages', () => {
    for (const cmd of ['npm install @banzami', 'pod "Banzami"', 'com.banzami:sdk', 'pip install banzami', 'composer require banzami', 'pub add banzami', 'go get github.com/banzami']) {
      expect(OVERVIEW.includes(cmd), `overview must not contain "${cmd}"`).toBe(false);
    }
  });
  it('docs keeps the explicit anti-instruction and the not-published statement', () => {
    expect(DOCS).toContain('Não corra');
    expect(DOCS).toContain('não estão publicados');
  });
  it('overview has no native iOS/Android SDK claim (Flutter is the mobile path)', () => {
    expect(OVERVIEW.includes('SDK cliente para apps iOS')).toBe(false);
    expect(OVERVIEW.includes('SDK cliente para apps Android')).toBe(false);
    expect(OVERVIEW).toContain('banzami_flutter');
  });
  it('the quickstart first call is curl against the Sandbox API, no SDK required', () => {
    expect(DOCS).toContain('curl https://sandbox-api.banzami.com/v1/me');
    expect(OVERVIEW).toContain('curl https://sandbox-api.banzami.com');
    // The curl block is RENDERED before the first SDK block (usage order, not
    // constant-definition order): quickstart curl → API reference SDK sample.
    expect(DOCS.indexOf('raw={SAMPLE_CURL_ME}')).toBeGreaterThan(0);
    expect(DOCS.indexOf('raw={SAMPLE_CURL_ME}')).toBeLessThan(DOCS.indexOf('raw={SAMPLE_SESSION}'));
  });
});

describe('P0 — no invented endpoints', () => {
  it('the retired/nonexistent /v1/payments path never appears', () => {
    for (const [name, src] of Object.entries(SURFACES)) {
      expect(src.includes('/v1/payments'), `${name} must not reference /v1/payments`).toBe(false);
    }
  });
});

describe('P0 — /docs content contracts (rendered)', () => {
  it('shows the Sandbox/Preview status section with the non-operational Console wording', () => {
    render(<DocsPage />);
    expect(screen.getByText('Estado atual desta documentação')).toBeTruthy();
    expect(DOCS).toContain('Produção e trilhos de dinheiro real não estão disponíveis');
    expect(DOCS).toContain('pré-visualizações demo, não operacionais');
  });
  it('documents the canonical error envelope and the status↔code table', () => {
    expect(DOCS).toContain('"request_id"');
    expect(DOCS).toContain('VALIDATION_ERROR');
    expect(DOCS).toContain('RATE_LIMITED');
    expect(DOCS).toContain('Códigos por status HTTP');
  });
  it('shows Idempotency-Key in code with the real Sandbox semantics', () => {
    expect(DOCS).toContain('Idempotency-Key: idem_');
    expect(DOCS).toContain('24 horas');
    expect(DOCS).toContain('409 CONFLICT');
  });
  it('has the credential↔capability matrix with honest pending-E2E rows', () => {
    render(<DocsPage />);
    expect(screen.getByText('Credenciais e capacidades')).toBeTruthy();
    expect(DOCS).toContain('Pendente E2E para chave developer');
    expect(DOCS).toContain('Não disponível · Não aprovado');
  });
  it('refunds/transfers are not presented as fully available to developer keys', () => {
    expect(DOCS).toContain('refunds:write');
    expect(DOCS).toContain('transfers:*');
    expect(DOCS.match(/Pendente E2E/g)!.length).toBeGreaterThanOrEqual(2);
  });
  it('webhooks: outbound not claimed publicly active; implemented retry contract documented', () => {
    expect(DOCS).toContain('simulada');
    expect(DOCS).toContain('Não reivindicamos a entrega');
    expect(DOCS).toContain('Contrato de reentrega');
    expect(DOCS).toContain('5 tentativas');
  });
  it('payment-session example shows request AND response with placeholder keys only', () => {
    expect(DOCS).toContain('"session_id"');
    expect(DOCS).toContain('bz_test_sk_XXXXXXXXXXXXXXXX');
    // No realistic-looking key material anywhere.
    expect(/bz_(test|live)_(pk|sk)_(?!X{4,})[A-Za-z0-9]{8,}/.test(DOCS)).toBe(false);
  });
});
