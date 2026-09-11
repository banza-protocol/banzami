/**
 * Public copy uses the vocabulary the product uses everywhere else.
 *
 *  - A payment is credited, never "liquidação" (settlement is a separate,
 *    later event with its own fee).
 *  - Money is grouped with a space ("100 000 Kz"), never a dot — but the volume
 *    bands' SUBMITTED values keep their stored spelling; only the label changes.
 *  - The homepage demo receipt uses today's receipt words (Referência, Fonte) and
 *    a reference that is visibly an example, not the retired "Ref 0FC11CCE /
 *    Método" receipt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VOLUME_FAIXAS, volumeFaixaLabel } from './business-categories';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('website vocabulary', () => {
  it('the merchants page does not call crediting a settlement', () => {
    expect(read('app/comerciantes/page.tsx')).not.toMatch(/Liquidação na rede/);
  });

  it('volume bands read with space grouping, and submit what they always submitted', () => {
    expect(VOLUME_FAIXAS).toContain('100.000 – 500.000 Kz'); // stored value, unchanged
    expect(volumeFaixaLabel('100.000 – 500.000 Kz')).toBe('100 000 – 500 000 Kz');
    expect(volumeFaixaLabel('Mais de 10.000.000 Kz')).toBe('Mais de 10 000 000 Kz');
    for (const v of VOLUME_FAIXAS) expect(volumeFaixaLabel(v)).not.toMatch(/\d\.\d/);
    for (const rel of ['app/comerciantes/candidatura/CandidaturaForm.tsx', 'components/developers/portal/BusinessApplicationForm.tsx']) {
      expect(read(rel), rel).toMatch(/options=\{VOLUME_FAIXAS\} labelFor=\{volumeFaixaLabel\}/);
    }
  });

  it('the demo receipt uses current receipt words and an illustrative reference', () => {
    for (const rel of ['components/app/AppDemo.tsx', 'components/app/AppScreen.tsx']) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/0FC11CCE/);
      expect(src, rel).not.toMatch(/label="Método"/);
      expect(src, rel).toMatch(/label="Referência" value="BZM-DEMO-/);
    }
  });
});
