// @vitest-environment jsdom
//
// The reference renders its entries through RESOURCE_GROUPS. An entry that no
// group names is written, indexed for search and linked from the Console, and
// still never appears on the page — which is how the external-rail entries
// shipped (WALLET-NATIVE-001). Every entry is rendered, once, in both languages.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ENDPOINTS, RESOURCE_GROUPS, ResourceReference } from './reference';

afterEach(cleanup);

describe('Resource reference completeness', () => {
  it('every entry belongs to exactly one resource group, and every grouped id is an entry', () => {
    const grouped = RESOURCE_GROUPS.flatMap((g) => g.ids);
    const ids = ENDPOINTS.map((e) => e.id);
    expect(ids.filter((id) => grouped.filter((g) => g === id).length !== 1)).toEqual([]);
    expect(grouped.filter((id) => !ids.includes(id))).toEqual([]);
  });

  for (const lang of ['pt', 'en'] as const) {
    it(`${lang}: the rendered page carries an anchor for every entry`, () => {
      const { container } = render(<ResourceReference lang={lang} onCopy={vi.fn()} />);
      const missing = ENDPOINTS.map((e) => e.id).filter((id) => container.querySelectorAll(`[id="${id}"]`).length !== 1);
      expect(missing).toEqual([]);
    });
  }
});
