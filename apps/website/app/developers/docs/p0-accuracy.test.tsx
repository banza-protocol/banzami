// @vitest-environment jsdom
//
// P0 documentation accuracy guards (docs/developer/DOCUMENTATION_AUDIT.md).
// Extends the honesty-test perimeter to the Developers OVERVIEW page and the
// shared doc components, and locks in the P0 content contracts on /docs:
//   - curl-first quickstart (no unpublished SDK as the primary path);
//   - canonical error envelope + status table;
//   - Idempotency-Key shown in code, with the real Sandbox semantics;
//   - credential↔capability matrix, with each row tracking the assurance
//     manifest rather than a snapshot of it;
//   - webhook outbound delivery never claimed beyond the Sandbox, with the
//     implemented retry contract documented;
//   - top-of-page Sandbox/Preview status with demo/non-operational Console;
//   - no unverified event vocabulary and no fake SDK install commands anywhere
//     on /docs, the overview, or the doc diagram components.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DocsPage from './page';
import PtGetStartedPage from './get-started/page';
import PtReferencePage from './reference/page';
import { CARD_CAPABILITIES, isReleased } from './assurance-manifest';
import { FAKE_INSTALL_COMMANDS } from './published-packages';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
// P3A: the PT documentation corpus = area content + landing page.
const DOCS = read('app/developers/docs/content-pt.tsx') + read('app/developers/docs/page.tsx');
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
    for (const cmd of [...FAKE_INSTALL_COMMANDS, 'com.banzami:sdk', 'composer require banzami']) {
      expect(OVERVIEW.includes(cmd), `overview must not contain "${cmd}"`).toBe(false);
    }
  });
  // The TypeScript SDK is published, so the old "do not install" wording is
  // retired and the docs carry the real command. The remaining families are
  // still unpublished and must still say so.
  it('docs give the real install command and still flag the unpublished families', () => {
    expect(DOCS).toContain('npm install @banzami/sdk');
    expect(DOCS.includes('Não corra'), 'the anti-instruction must not survive publication').toBe(false);
    expect(DOCS).toContain('não estão publicados');
  });
  it('overview has no native iOS/Android SDK claim (Flutter is the mobile path)', () => {
    expect(OVERVIEW.includes('SDK cliente para apps iOS')).toBe(false);
    expect(OVERVIEW.includes('SDK cliente para apps Android')).toBe(false);
    // banzami_client, not banzami_flutter: the latter is Banzami's own
    // application framework and is not published (Banzami ADR-053). Pointing a
    // mobile developer at it would send them to a package that is not theirs.
    expect(OVERVIEW).toContain('banzami_client');
    expect(OVERVIEW.includes('banzami_flutter'), 'the internal framework must not be offered as an SDK').toBe(false);
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
    render(<PtGetStartedPage />);
    expect(screen.getByText('Estado atual desta documentação')).toBeTruthy();
    expect(DOCS).toContain('Produção e trilhos de dinheiro real não estão disponíveis');
    // Webhooks and Actividade now show the project's real data; the dashboard
    // is the page that is still a preview, and the docs must name it precisely
    // rather than sweep three pages together.
    expect(DOCS).toContain('pré-visualização demo, não operacional');
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
  it('has the credential↔capability matrix, and it still refuses Production', () => {
    render(<PtReferencePage />);
    expect(screen.getByText('Credenciais e capacidades')).toBeTruthy();
    // Whatever the Sandbox evidence says, this row does not move.
    expect(DOCS).toContain('Não disponível · Não aprovado');
    for (const { id } of CARD_CAPABILITIES) {
      if (isReleased(id)) continue;
      expect(DOCS).toContain('Pendente E2E para chave developer');
    }
  });
  it('refunds/transfers name their project scope and never claim Production', () => {
    // Both are released in Sandbox under a project key, so the docs must say
    // which scope and which route reach them — and must still never present
    // either as available on live rails.
    expect(DOCS).toContain('refunds:write');
    expect(DOCS).toContain('transfers:write');
    expect(DOCS).toContain('/v1/business/refunds');
    expect(DOCS).toContain('/v1/business/transfers');
    expect(isReleased('CAP-REFUND-001')).toBe(true);
    expect(isReleased('CAP-TRANSFER-002')).toBe(true);
    expect(/reembolsos?[^.]{0,80}dispon[íi]vel em produ[çc][ãa]o/i.test(DOCS)).toBe(false);
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
