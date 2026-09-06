import { describe, it, expect } from 'vitest';
import { canBuild, canAssign, canModifyTarget, assignableRoles, canRefund, roleSummary } from './developer-roles';

// The UI shows a control only when the server would authorize it. These mirror
// the developer-api authorization matrix (ADR-033).
describe('developer role permissions (UI control visibility)', () => {
  it('canBuild: OWNER/ADMIN/DEVELOPER only', () => {
    expect(['OWNER', 'ADMIN', 'DEVELOPER'].every(canBuild)).toBe(true);
    expect(['FINANCE', 'VIEWER'].some(canBuild)).toBe(false);
  });

  it('no privilege escalation: ADMIN cannot assign OWNER/ADMIN', () => {
    expect(canAssign('OWNER', 'OWNER')).toBe(true);
    expect(canAssign('ADMIN', 'OWNER')).toBe(false);
    expect(canAssign('ADMIN', 'ADMIN')).toBe(false);
    expect(canAssign('ADMIN', 'DEVELOPER')).toBe(true);
    expect(canAssign('DEVELOPER', 'VIEWER')).toBe(false);
  });

  it('ADMIN cannot modify OWNER/ADMIN targets', () => {
    expect(canModifyTarget('OWNER', 'OWNER')).toBe(true);
    expect(canModifyTarget('ADMIN', 'OWNER')).toBe(false);
    expect(canModifyTarget('ADMIN', 'ADMIN')).toBe(false);
    expect(canModifyTarget('ADMIN', 'DEVELOPER')).toBe(true);
  });

  it('assignableRoles reflects the actor role', () => {
    expect(assignableRoles('OWNER')).toEqual(['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'VIEWER']);
    expect(assignableRoles('ADMIN')).toEqual(['DEVELOPER', 'FINANCE', 'VIEWER']);
    expect(assignableRoles('VIEWER')).toEqual([]);
  });
});

// The refund line, as a table over every canonical role. Kept in the same shape
// as the server's own matrix test (services/developer-api, TestRefund_RoleMatrix)
// so the two can be read side by side, and so a role added to the system later
// shows up here as a gap rather than as an untested permission.
describe('canRefund', () => {
  it('is OWNER and ADMIN, and no one else', () => {
    expect(canRefund('OWNER')).toBe(true);
    expect(canRefund('ADMIN')).toBe(true);
    // May build the capability; may not exercise it against real balances.
    expect(canRefund('DEVELOPER')).toBe(false);
    // The name is not the permission.
    expect(canRefund('FINANCE')).toBe(false);
    expect(canRefund('VIEWER')).toBe(false);
  });

  it('is narrower than canBuild — building a refund is not making one', () => {
    expect(canBuild('DEVELOPER')).toBe(true);
    expect(canRefund('DEVELOPER')).toBe(false);
  });

  it('denies an unknown role rather than defaulting open', () => {
    for (const r of ['', 'owner', 'SUPERUSER', 'BILLING']) expect(canRefund(r)).toBe(false);
  });
});

// The sentence shown in the invite picker. Derived from the predicates, so it
// cannot say something the server would refuse.
describe('roleSummary', () => {
  it('names refunding only for the roles that may refund', () => {
    for (const r of ['OWNER', 'ADMIN']) expect(roleSummary(r)).toContain('reembolsar');
    for (const r of ['DEVELOPER', 'FINANCE', 'VIEWER']) expect(roleSummary(r)).not.toContain('reembolsar');
  });

  it('says what each role can do, and every role can at least read', () => {
    expect(roleSummary('VIEWER')).toBe('ver tudo do workspace');
    expect(roleSummary('DEVELOPER')).toBe('ver tudo do workspace · criar projetos e chaves');
    expect(roleSummary('FINANCE')).toBe('ver tudo do workspace');
    expect(roleSummary('ADMIN')).toBe('ver tudo do workspace · criar projetos e chaves · reembolsar pagamentos · gerir membros');
  });

  // FINANCE and VIEWER read identically here because they ARE identical in this
  // Console. If that ever stops being true, this test is where it shows.
  it('does not invent an authority for FINANCE that the server does not grant', () => {
    expect(roleSummary('FINANCE')).toBe(roleSummary('VIEWER'));
  });
});
