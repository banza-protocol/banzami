import { describe, it, expect } from 'vitest';
import { NAV, ROUTES, isNavActive, route, type NavItem, type RouteKey } from './nav';

const byKey = (k: string) => NAV.find((i) => i.key === k) as NavItem | undefined;
const sobre = () => byKey('sobre')!;

// The header exposes only the main journeys; everything institutional lives under
// Sobre. Removing it from the top level must not delete the pages or their routes.
describe('primary navigation is consolidated under Sobre', () => {
  it('top-level is exactly Produto · Comerciantes · Developers · Sobre', () => {
    expect(NAV.map((i) => i.key)).toEqual(['produto', 'comerciantes', 'developers', 'sobre']);
  });

  it('Segurança, BANZA and Suporte are no longer top-level items', () => {
    for (const k of ['seguranca', 'banza', 'suporte']) {
      expect(NAV.some((i) => i.key === k)).toBe(false);
    }
  });

  it('their routes are preserved (pages stay public)', () => {
    for (const k of ['seguranca', 'suporte', 'sobre'] as RouteKey[]) {
      expect(ROUTES[k]?.pt).toBeTruthy();
      expect(ROUTES[k]?.en).toBeTruthy();
    }
  });
});

describe('the Sobre mega hosts the institutional links', () => {
  const links = () => sobre().mega!.links;
  const find = (label: string) => links().find((l) => l.label.pt === label);

  it('lists A startup, Fundadores, Segurança, BANZA, Suporte, Contacto', () => {
    expect(links().map((l) => l.label.pt)).toEqual([
      'A startup', 'Fundadores', 'Segurança', 'BANZA', 'Suporte', 'Contacto',
    ]);
  });

  it('each points at its canonical route/anchor', () => {
    expect(route(find('A startup')!.to!.key, 'pt')).toBe('/sobre');
    expect(find('Segurança')!.to).toEqual({ key: 'seguranca' });
    expect(find('BANZA')!.to).toEqual({ key: 'sobre', hash: '#banza' });
    expect(find('Suporte')!.to).toEqual({ key: 'suporte' });
    expect(find('Contacto')!.to).toEqual({ key: 'suporte', hash: '#contacto' });
    expect(find('Fundadores')!.to?.hash).toBe('#fundador');
  });

  it('does not name Banzami an "empresa" and keeps the masculine article', () => {
    const desc = sobre().mega!.desc.pt;
    expect(desc.toLowerCase()).not.toContain('empresa');
    expect(desc).not.toMatch(/\ba Banzami\b/);
  });
});

describe('Sobre is the active tab across the institutional universe', () => {
  for (const current of ['sobre', 'seguranca', 'suporte'] as RouteKey[]) {
    it(`active on /${current}`, () => {
      expect(isNavActive(sobre(), current)).toBe(true);
    });
  }

  it('is not active on a product journey', () => {
    expect(isNavActive(sobre(), 'produto' as RouteKey)).toBe(false);
    expect(isNavActive(byKey('produto')!, 'produto' as RouteKey)).toBe(true);
  });
});
