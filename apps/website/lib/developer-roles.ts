// Client-side mirror of the developer-api authorization matrix (ADR-033), used
// only to decide which controls to SHOW. The server re-enforces every rule; the
// UI never grants access the server would deny.

export const ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  DEVELOPER: 'Developer',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
};

export function isManager(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

// canBuild: may create projects / issue API keys.
export function canBuild(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'DEVELOPER';
}

// canAssign: an actor with actorRole may grant targetRole.
export function canAssign(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'OWNER') return true;
  if (actorRole === 'ADMIN') return targetRole === 'DEVELOPER' || targetRole === 'FINANCE' || targetRole === 'VIEWER';
  return false;
}

// canModifyTarget: an actor may change/remove a member currently holding targetRole.
export function canModifyTarget(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'OWNER') return true;
  if (actorRole === 'ADMIN') return targetRole !== 'OWNER' && targetRole !== 'ADMIN';
  return false;
}

// assignableRoles: roles an actor may grant (for the invite/role-change UI).
export function assignableRoles(actorRole: string): Role[] {
  return ROLES.filter((r) => canAssign(actorRole, r));
}
