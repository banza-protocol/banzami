/**
 * The docs tell developers that Console pages showing illustrative rather than
 * live data are "labelled as such on the page itself". That sentence is only
 * true while the labels exist, so this ties the two together.
 *
 * The pairing matters more than either half. A page that renders hard-coded
 * constants and makes no API call is not a bug — a Console can ship a screen
 * ahead of its backend — but a developer reading a delivery history or a
 * request log there would reasonably believe it was their own traffic, and
 * would debug against numbers that describe nothing.
 *
 * So: a page with no API call must carry the notice. When one of these pages is
 * wired to the real API, delete its constants AND remove it from this list.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Console pages known to render illustrative constants rather than live data. */
//
// `webhooks` left this list by having its invented data removed rather than by
// being wired up: it now renders an honest empty state and the SDK calls that do
// work. That is the other legitimate way off this list, and the reason the
// second assertion below is phrased as "makes no API call" rather than "is
// wired" — a page can stop lying without yet telling the truth.
const ILLUSTRATIVE = ['dashboard'];

describe('Console pages with illustrative data', () => {
  it.each(ILLUSTRATIVE)('%s carries the illustrative-data notice', (page) => {
    const src = read(`app/developers/${page}/page.tsx`);
    expect(src).toContain('IllustrativeDataNotice');
  });

  it.each(ILLUSTRATIVE)('%s genuinely makes no API call (else remove the label)', (page) => {
    const src = read(`app/developers/${page}/page.tsx`);
    // If this fails, the page was wired to the real API — which is good news.
    // Remove it from ILLUSTRATIVE and drop the notice rather than loosening this.
    expect(/fetch\(|developer-api\.banzami\.com/.test(src), `${page} now calls an API`).toBe(false);
  });

  it('the activity log no longer invents events, and reads the project’s own', () => {
    const src = read('app/developers/logs/page.tsx') + read('components/developers/portal/ActivityLog.tsx')
      + read('components/developers/portal/RequestLog.tsx');
    // It listed payment.succeeded / transfer.created / refund.processed rows for
    // a fictional shop's invoices — event names Banzami does not emit, against
    // references that never existed.
    for (const invented of ['payment.succeeded', 'payment.failed', 'transfer.created', 'refund.processed', 'invoice.paid', 'INV-2025']) {
      expect(src, `the activity log must not re-invent ${invented}`).not.toContain(invented);
    }
    expect(src).toContain('developerApi.listWebhookEvents');
    expect(src).toContain('developerApi.listWebhookDeliveries');
  });

  it('the API request log is real project traffic, not a second invented screen', () => {
    const page = read('app/developers/logs/page.tsx');
    const src = read('components/developers/portal/RequestLog.tsx');
    // The screen exists and is reachable — the page renders it, not just imports it.
    expect(page).toContain('<RequestLog />');
    // Every row comes from the operator's own record for THIS project.
    expect(src).toContain('developerApi.listApiRequestLogs');
    // The columns the docs promise a developer they can debug with.
    for (const field of ['request_id', 'latency_ms', 'status', 'method', 'path', 'created_at']) {
      expect(src, `the request log must render ${field}`).toContain(field);
    }
    // The filters the page offers must be real query parameters, not client-side
    // theatre over one fixed fetch.
    for (const filter of ['request_id:', 'status:', 'path:', 'since:']) {
      expect(src, `filter ${filter} must reach the API`).toContain(filter);
    }
    // Nothing may be hard-coded: a sample row here would be exactly the defect
    // this whole file exists to prevent.
    for (const invented of ['req_sample', 'minhaloja', 'invoice.paid', '/v1/example']) {
      expect(src, `the request log must not invent ${invented}`).not.toContain(invented);
    }
    // And no credential-bearing field may be displayed, because none is stored.
    // Comments are excluded: the file names these things in order to say it does
    // not carry them, which is the opposite of carrying them.
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').toLowerCase();
    for (const secret of ['authorization', 'api_key', 'apikey', 'webhook_secret', 'cookie', 'headers']) {
      expect(code, `the request log must not surface ${secret}`).not.toContain(secret);
    }
  });

  it('the webhooks page no longer invents endpoints or deliveries', () => {
    const src = read('app/developers/webhooks/page.tsx') + read('components/developers/portal/WebhooksManager.tsx');
    // It advertised minhaloja.co.ao endpoints with delivery counts and success
    // rates, and deliveries for `invoice.paid` / `transfer.created` — event names
    // Banzami does not emit. Nothing there was ever real.
    expect(src).not.toContain('minhaloja');
    expect(src).not.toContain('invoice.paid');
    expect(src).not.toContain('transfer.created');
    // And it now reads the project's OWN data rather than pointing elsewhere.
    expect(src).toContain('developerApi.listWebhookEndpoints');
    expect(src).toContain('developerApi.listWebhookDeliveries');
  });

  it('the Console key form defaults to a scope some route actually enforces', () => {
    // It defaulted to payments:read — one of the inert scopes — so the very
    // first key a developer created was pre-selected with authority over
    // nothing.
    const src = read('components/developers/portal/ApiKeysManager.tsx');
    expect(src).not.toContain("useState<string[]>(['payments:read'])");
    expect(src).toContain("useState<string[]>(['identity:read'])");
  });

  it('the notice states plainly that the data is not the reader’s own', () => {
    const src = read('components/developers/portal/IllustrativeDataNotice.tsx');
    expect(src).toContain('Dados ilustrativos');
    expect(src.replace(/\s+/g, ' ')).toContain('não a sua actividade real');
  });
});
