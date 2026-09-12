// Client-side mirror of the developer-api authorization matrix (ADR-033), used
// only to decide which controls to SHOW. The server re-enforces every rule; the
// UI never grants access the server would deny.

export const ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

/**
 * The wire vocabulary, in English, as the API names the roles.
 *
 * Kept because it is what FinancialOnboarding renders today and what its test
 * asserts. It is NOT the word to show a user — see roleLabel below.
 */
export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  DEVELOPER: 'Developer',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
};

/** The same five roles in the language the Console speaks to its user. */
export const ROLE_LABELS_PT: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  DEVELOPER: 'Programador',
  FINANCE: 'Financeiro',
  VIEWER: 'Observador',
};

/**
 * The role, for a person reading it.
 *
 * A role this build does not know is a role the server added after this bundle
 * shipped. It renders as "Papel desconhecido" rather than as OWNER_DELEGATE,
 * because a raw uppercase wire code in the middle of a Portuguese sentence is
 * not a word — it is a leak of the transport, and the reader cannot tell whether
 * it means more authority or less. The code itself still belongs somewhere a
 * support conversation can reach it, so callers put it on `title`.
 */
export function roleLabel(role: string): string {
  return ROLE_LABELS_PT[role] ?? 'Papel desconhecido';
}

/** True when this build recognises the role — i.e. roleLabel says a real word. */
export function isKnownRole(role: string): boolean {
  return role in ROLE_LABELS_PT;
}

export function isManager(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

// canBuild: may create projects / issue API keys.
export function canBuild(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'DEVELOPER';
}

// canRefund: may return money from a payment made under this project.
//
// OWNER and ADMIN. The line is who is accountable for the workspace, not who
// understands payments: DEVELOPER can create projects and issue keys, which is
// everything needed to BUILD a refund, and that is a different authority from
// pressing the button against a real balance.
//
// FINANCE is denied, and the name is why this is written down. It reads like the
// role that ought to refund; nothing in this system has ever granted FINANCE a
// financial write, and reading a permission out of a word would grant it here for
// the first time by accident.
//
// This mirror decides only whether to SHOW the control. The Console asks the
// server for the real answer — GET /projects/{id}/refund-capability, which also
// says whether the deployment has a refund path at all — and every refund is
// authorised again server-side when it is attempted.
export function canRefund(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
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

/**
 * What a role can do, in one line, for whoever is choosing it.
 *
 * The invite picker used to offer five words and no meaning. That was tolerable
 * while every role differed only in who could invite and build; it stopped being
 * tolerable when refunds arrived, because FINANCE is the role someone would
 * reasonably expect to include returning money and it does not.
 *
 * Derived from the predicates rather than written out, so the sentence cannot
 * drift from what the server enforces.
 */
export function roleSummary(role: string): string {
  const can: string[] = ['ver tudo do workspace'];
  if (canBuild(role)) can.push('criar projetos e chaves');
  if (canRefund(role)) can.push('reembolsar pagamentos');
  if (isManager(role)) can.push('gerir membros');
  return can.join(' · ');
}

// assignableRoles: roles an actor may grant (for the invite/role-change UI).
export function assignableRoles(actorRole: string): Role[] {
  return ROLES.filter((r) => canAssign(actorRole, r));
}
