import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A Console page must not be narrower than the shell it sits in.
 *
 * The portal shell centres everything — including the Sandbox banner and the
 * environment notice — in a 1200px column. Transações, Saldos and Configuração
 * financeira then capped their own content at 980, so each page rendered a card
 * visibly narrower than the banners directly above it, and the transactions
 * table clipped its right-hand column: the Reembolsar action sat outside the
 * card and could not be read or reached.
 *
 * API Keys, Logs and Webhooks never had the cap and always matched the shell,
 * which is what made the difference look like a bug rather than a style.
 *
 * Pages that are deliberately a narrow reading column — sign-in, verification,
 * onboarding, support, go-live — are listed here as such. Everything else shares
 * the shell's width.
 */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Pages whose content is a form or a single message, intentionally narrow. */
const NARROW_BY_DESIGN = new Set([
  'login', 'verify', 'suporte', 'go-live', 'onboarding/project', 'onboarding/profile',
  // Settings is a two-column form, read at a text width rather than a data width.
  'settings', 'settings/workspace',
]);

/** Pages that show data — tables, lists, balances — and must match the shell. */
const DATA_PAGES = ['transacoes', 'saldos', 'financeiro', 'api-keys', 'logs', 'webhooks'];

const SHELL_WIDTH = 1200;

describe('the Console content column', () => {
  it('the shell centres every page in one column', () => {
    const shell = read('components/developers/portal/PortalShell.tsx');
    expect(shell).toMatch(new RegExp(`maxWidth:\\s*${SHELL_WIDTH}`));
  });

  for (const page of DATA_PAGES) {
    it(`${page} is not narrower than the shell`, () => {
      const src = read(`app/developers/${page}/page.tsx`);
      const view = src.match(/className="bz-view"[^>]*/s)?.[0] ?? '';
      const capped = view.match(/maxWidth:\s*(\d+)/);
      expect(
        capped === null || Number(capped[1]) >= SHELL_WIDTH,
        `${page} caps its content at ${capped?.[1]}px inside a ${SHELL_WIDTH}px shell — `
          + 'the card renders narrower than the banner above it and wide tables clip on the right',
      ).toBe(true);
    });
  }

  it('a wide table still scrolls rather than overflowing the page', () => {
    // Matching the shell widens the card; it does not make the table fit on a
    // phone. The horizontal scroll container is what keeps the body from
    // scrolling sideways, so it must stay.
    for (const page of ['transacoes', 'saldos']) {
      expect(read(`app/developers/${page}/page.tsx`)).toMatch(/overflowX:\s*'auto'/);
    }
  });

  it('the narrow pages are narrow on purpose, and say so here', () => {
    for (const page of NARROW_BY_DESIGN) {
      const src = read(`app/developers/${page}/page.tsx`);
      expect(src).toMatch(/maxWidth:\s*\d+/);
    }
  });
});
