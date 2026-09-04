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
const ILLUSTRATIVE = ['dashboard', 'webhooks', 'logs'];

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

  it('the notice states plainly that the data is not the reader’s own', () => {
    const src = read('components/developers/portal/IllustrativeDataNotice.tsx');
    expect(src).toContain('Dados ilustrativos');
    expect(src.replace(/\s+/g, ' ')).toContain('não a sua actividade real');
  });
});
