import { describe, it, expect } from 'vitest';
import { canBuild, canAssign, canModifyTarget, assignableRoles } from './developer-roles';

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
