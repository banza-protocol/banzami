import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLOSING_CTAS } from './closing-ctas';
import { PUBLIC_TRUTH } from './public-truth';

// PUBLIC-WEBSITE-CLOSING-CTA-001 — the guard for the one canonical closing CTA:
// content is page-owned (route ownership), there is at most one closing CTA per
// marketing page (no duplicate cards), legal/functional pages carry none, and no
// closing copy overclaims Financial Live.

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const count = (s: string, needle: string) => s.split(needle).length - 1;

// Route → the page file whose closing CTA it owns.
const MARKETING: Record<keyof typeof CLOSING_CTAS, string> = {
  produto: 'app/produto/page.tsx',
  comerciantes: 'app/comerciantes/page.tsx',
  developers: 'app/developers/page.tsx',
  sobre: 'app/sobre/page.tsx',
  suporte: 'app/suporte/page.tsx',
};

// Pages that must NOT carry a marketing closing CTA (legal + functional + form).
const NO_MARKETING_CTA = [
  'app/privacidade/page.tsx',
  'app/verificar/page.tsx',
  'app/testes/page.tsx',
  'app/comerciantes/candidatura/page.tsx',
];

describe('closing CTA — content source is one config', () => {
  it('every marketing route has a complete entry', () => {
    for (const key of Object.keys(MARKETING) as (keyof typeof CLOSING_CTAS)[]) {
      const c = CLOSING_CTAS[key];
      expect(c.title, `${key}.title`).toBeTruthy();
      expect(c.description, `${key}.description`).toBeTruthy();
      expect(c.primary?.label && c.primary?.href, `${key}.primary`).toBeTruthy();
    }
  });

  it('copy is concise (headline + one line, no feature lists)', () => {
    for (const key of Object.keys(CLOSING_CTAS) as (keyof typeof CLOSING_CTAS)[]) {
      expect(CLOSING_CTAS[key].description.length, `${key} description length`).toBeLessThan(160);
    }
  });
});

describe('closing CTA — route ownership (audience matches the page)', () => {
  const APP = 'app.banzami.com';
  it('produto speaks to the consumer (opens the app)', () => {
    expect(CLOSING_CTAS.produto.audience).toBe('consumer');
    expect(CLOSING_CTAS.produto.primary.href).toContain(APP);
  });
  it('comerciantes speaks to a business (starts a Business test)', () => {
    expect(CLOSING_CTAS.comerciantes.audience).toBe('business');
    expect(CLOSING_CTAS.comerciantes.primary.href).toContain('/comerciantes/candidatura');
  });
  it('developers speaks to a developer (opens the Console)', () => {
    expect(CLOSING_CTAS.developers.audience).toBe('developer');
    expect(CLOSING_CTAS.developers.primary.href).toBe(PUBLIC_TRUTH.consoleUrl);
  });
  it('sobre is institutional (leads to contact)', () => {
    expect(CLOSING_CTAS.sobre.audience).toBe('institutional');
    expect(CLOSING_CTAS.sobre.primary.href).toMatch(/^mailto:/);
  });
  it('suporte is support (leads to contact)', () => {
    expect(CLOSING_CTAS.suporte.audience).toBe('support');
    expect(CLOSING_CTAS.suporte.primary.href).toMatch(/^mailto:/);
  });

  it('no developer pitch leaks onto a non-developer page', () => {
    for (const key of Object.keys(CLOSING_CTAS) as (keyof typeof CLOSING_CTAS)[]) {
      if (key === 'developers') continue;
      const c = CLOSING_CTAS[key];
      expect(c.primary.href, `${key} primary`).not.toBe(PUBLIC_TRUTH.consoleUrl);
      expect(`${c.title} ${c.description}`.toLowerCase(), `${key} copy`).not.toContain('api v1');
    }
  });
});

describe('closing CTA — no Financial Live overclaim', () => {
  const BANNED = [/dinheiro real/i, /pagamentos reais/i, /produção/i, /go[- ]?live/i, /aceitar pagamentos\b(?! na)/i];
  it('no closing copy implies real money or production', () => {
    for (const key of Object.keys(CLOSING_CTAS) as (keyof typeof CLOSING_CTAS)[]) {
      const blob = `${CLOSING_CTAS[key].title} ${CLOSING_CTAS[key].description}`;
      for (const re of BANNED) expect(re.test(blob), `${key}: ${re}`).toBe(false);
    }
  });
});

describe('closing CTA — at most one per marketing page (no duplicate cards)', () => {
  it('each marketing page renders exactly one <CTASection>', () => {
    for (const file of Object.values(MARKETING)) {
      expect(count(read(file), '<CTASection'), `${file}`).toBe(1);
    }
  });

  it('/sobre no longer carries the old duplicate "Construir com o Banzami" card', () => {
    expect(read('app/sobre/page.tsx')).not.toContain('Construir com o Banzami');
  });

  it('legal and functional pages carry no marketing closing CTA', () => {
    for (const file of NO_MARKETING_CTA) {
      let src = '';
      try { src = read(file); } catch { continue; } // page may not exist as a single file
      expect(count(src, '<CTASection'), `${file}`).toBe(0);
    }
  });
});
