// @vitest-environment jsdom
//
// "Try in Sandbox" (SANDBOX-SELF-SERVICE-001 §52): a reference entry the Console's
// API Explorer can run links to it by operation; one it cannot run does not.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ResourceReference } from './reference';
import explorerOperations from './explorer-operations.json';

afterEach(cleanup);

describe('Try in Sandbox', () => {
  for (const lang of ['pt', 'en'] as const) {
    it(`${lang}: links runnable operations to the Explorer, and only those`, () => {
      const { container } = render(<ResourceReference lang={lang} onCopy={vi.fn()} />);
      const links = [...container.querySelectorAll('a[data-try-in-sandbox]')] as HTMLAnchorElement[];
      const ids = new Set(explorerOperations.operations.map((o) => o.operation_id));
      expect(links.length).toBeGreaterThan(10);
      for (const a of links) {
        expect(ids.has(a.dataset.trySandbox ?? a.getAttribute('data-try-in-sandbox') ?? '')).toBe(true);
        expect(a.getAttribute('href')).toBe(`/explorer?op=${a.getAttribute('data-try-in-sandbox')}`);
      }
      const hrefs = links.map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('/explorer?op=createPaymentSession');
      // A public route (no key) is not an Explorer operation.
      const proofs = container.querySelector('[id*="proof"]');
      if (proofs) expect(proofs.querySelector('a[data-try-in-sandbox]')).toBeNull();
    });
  }
});
