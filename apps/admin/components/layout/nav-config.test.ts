import { describe, it, expect } from 'vitest';
import { NAV, isSection, navItems, navForRole, type NavItem } from './nav-config';

// BANZADMIN-IA-NAV-001 — the sidebar IA is one canonical config. These lock the
// operator-centric structure and terminology so it cannot silently drift back.

const items = navItems(NAV);

describe('BANZADMIN nav config', () => {
  it('every item has a valid route and label', () => {
    for (const it of items) {
      expect(it.href.startsWith('/'), `${it.label} route`).toBe(true);
      expect(it.label.trim().length, `${it.href} label`).toBeGreaterThan(0);
    }
  });

  it('routes are unique (one owner route per concept)', () => {
    const hrefs = items.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('labels are unique (no duplicate nav labels, e.g. two "Visão geral")', () => {
    const labels = items.map((i) => i.label);
    expect(new Set(labels).size, `duplicate label in ${labels.join(', ')}`).toBe(labels.length);
  });

  it('the operational merchant surface is labelled "Comerciantes" (never "Negócios")', () => {
    const businesses = items.find((i) => i.href === '/businesses');
    expect(businesses?.label).toBe('Comerciantes');
    expect(items.some((i) => i.label === 'Negócios')).toBe(false);
  });

  it('applications keep their own owner route', () => {
    expect(items.find((i) => i.href === '/merchants')?.label).toBe('Candidaturas');
  });

  it('Portuguese terminology is normalized (no PT/EN drift)', () => {
    const labels = items.map((i) => i.label);
    expect(labels).not.toContain('Risco & Audit');
    expect(labels).toContain('Risco e auditoria');
    expect(labels).not.toContain('Políticas de fee');
    expect(labels).toContain('Políticas de taxas');
  });

  it('groups are operator tasks, each non-empty, no mega "Compliance" group', () => {
    const sections = NAV.filter(isSection);
    const names = sections.map((s) => s.section);
    expect(names).toEqual([
      'Identidade e onboarding',
      'Operações financeiras',
      'Risco e plataforma',
      'Preços e finanças',
      'Validação',
    ]);
    expect(names).not.toContain('Compliance');
    for (const s of sections) expect(s.items.length, `${s.section} empty`).toBeGreaterThan(0);
  });

  it('the finance overview is a distinct label from the global one', () => {
    expect(items.find((i) => i.href === '/finance')?.label).toBe('Resumo financeiro');
    expect(items.find((i) => i.href === '/')?.label).toBe('Visão geral');
  });

  it('role scopes visibility: SUPER_ADMIN sees admin controls, others do not', () => {
    const labels = (role: string | undefined) => navItems(navForRole(role)).map((i) => i.label);
    for (const admin of ['Operadores', 'Modo da plataforma']) {
      expect(labels('SUPER_ADMIN'), `SUPER_ADMIN sees ${admin}`).toContain(admin);
      expect(labels('COMPLIANCE'), `COMPLIANCE hidden from ${admin}`).not.toContain(admin);
      expect(labels(undefined), `unknown role hidden from ${admin}`).not.toContain(admin);
    }
    // everyone still sees the shared operational surfaces
    expect(labels('COMPLIANCE')).toContain('Comerciantes');
    expect(labels('COMPLIANCE')).toContain('Candidaturas');
    // empty sections are dropped, never rendered as a bare header
    expect(navForRole('COMPLIANCE').filter(isSection).every((s) => s.items.length > 0)).toBe(true);
  });

  it('only queue-like items carry a badge source', () => {
    const withBadge = items.filter((i: NavItem) => i.attentionKey);
    // config pages (pricing, operators, platform-mode, consumers, proofs…) never badge
    for (const href of ['/pricing-rules', '/operators', '/platform-mode', '/consumers', '/proofs', '/finance']) {
      expect(items.find((i) => i.href === href)?.attentionKey, `${href} must not badge`).toBeUndefined();
    }
    expect(withBadge.length).toBeGreaterThan(0);
  });
});

// The Validation Studio has no Live representation at all — migration 0160
// admits only SANDBOX — so in LIVE the item is HIDDEN rather than disabled. A
// greyed-out link would promise something that cannot exist.
describe('Validation Studio in the sidebar', () => {
  it('is visible in SANDBOX', () => {
    const items = navItems(navForRole('SUPER_ADMIN', NAV, 'SANDBOX'));
    expect(items.some((i) => i.href === '/validation')).toBe(true);
  });

  it('is absent in LIVE, and so is its whole section', () => {
    const nav = navForRole('SUPER_ADMIN', NAV, 'LIVE');
    expect(navItems(nav).some((i) => i.href === '/validation')).toBe(false);
    // An empty section would leave a heading with nothing under it.
    expect(nav.some((e) => isSection(e) && e.section === 'Validação')).toBe(false);
  });

  it('is visible to every role that admin-api grants validation.view', () => {
    // SUPER_ADMIN, OPERATIONS, COMPLIANCE, SUPPORT and READ_ONLY all hold it
    // (services/admin-api/internal/auth/rbac.go). The sidebar is presentation
    // only and never authority, but it should not contradict the server.
    for (const role of ['SUPER_ADMIN', 'OPERATIONS', 'COMPLIANCE', 'SUPPORT', 'READ_ONLY']) {
      const items = navItems(navForRole(role, NAV, 'SANDBOX'));
      expect(items.some((i) => i.href === '/validation')).toBe(true);
    }
  });

  it('carries no attention badge — it is a place to look, not a queue', () => {
    const item = navItems(NAV).find((i) => i.href === '/validation');
    expect(item?.attentionKey).toBeUndefined();
  });
});
