'use client';

import type { ActivityEvent } from '@/lib/developer-api';

/**
 * Turning one audit row into a sentence.
 *
 * Kept out of the page so it can be tested without a browser, and written as a
 * sentence rather than a table of raw fields because the requirement was a
 * surface a person can read — "Ana mudou o papel de João de Programador para
 * Leitor" — not a JSON dump with nicer borders.
 *
 * An action the Console does not recognise still renders: the server's
 * allow-list decides what exists, and a client that silently dropped a row it
 * had no phrasing for would hide a real change behind a UI gap.
 */

export const ROLE_PT: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  DEVELOPER: 'Programador',
  FINANCE: 'Financeiro',
  VIEWER: 'Leitor',
};

export const roleLabel = (r?: string): string => (r ? (ROLE_PT[r] ?? r) : '');

/** Who performed the change, as a person rather than an id. */
export function actorLabel(ev: ActivityEvent): string {
  return ev.actor_name || ev.actor_email || (ev.actor_user_id ? `Utilizador ${ev.actor_user_id.slice(0, 8)}` : 'Sistema');
}

/** Who or what it was done to. Empty when the action has no separate target. */
export function targetLabel(ev: ActivityEvent): string {
  if (ev.target_name) return ev.target_name;
  if (ev.target_email) return ev.target_email;
  if (!ev.target_ref) return '';
  // A project or key that has since been deleted keeps its id and loses its
  // name. Showing the short id is honest; showing nothing would make the event
  // read as if it had no subject.
  return `${ev.target_ref.slice(0, 8)}…`;
}

/** The one-line description of what happened. */
export function describe(ev: ActivityEvent): string {
  const who = targetLabel(ev);
  const to = roleLabel(ev.role);
  const from = roleLabel(ev.previous_role);
  switch (ev.action) {
    case 'member.invited':
      return to ? `convidou ${who} como ${to}` : `convidou ${who}`;
    case 'member.joined':
      return 'entrou no workspace';
    case 'member.left':
      return 'saiu do workspace';
    case 'member.removed':
      return from ? `removeu ${who} (era ${from})` : `removeu ${who}`;
    case 'member.role_changed':
      // Both halves. "mudou para Leitor" does not say whether somebody was
      // despromovido de Proprietário, which is usually the question.
      return from && to
        ? `mudou o papel de ${who} de ${from} para ${to}`
        : `mudou o papel de ${who}${to ? ` para ${to}` : ''}`;
    case 'invite.revoked':
      return 'revogou um convite pendente';
    case 'workspace.created':
      return 'criou o workspace';
    case 'workspace.renamed':
      return 'renomeou o workspace';
    case 'workspace.archived':
      return 'arquivou o workspace';
    case 'workspace.deleted':
      return 'eliminou o workspace';
    case 'project.created':
      return who ? `criou o projeto ${who}` : 'criou um projeto';
    case 'project.renamed':
      return who ? `renomeou o projeto ${who}` : 'renomeou um projeto';
    case 'project.archived':
      return who ? `arquivou o projeto ${who}` : 'arquivou um projeto';
    case 'project.deleted':
      return who ? `eliminou o projeto ${who}` : 'eliminou um projeto';
    case 'apikey.created':
      return 'criou uma chave API';
    case 'apikey.rotated':
      return 'rodou uma chave API';
    case 'apikey.revoked':
      return 'revogou uma chave API';
    default:
      // Unrecognised, not hidden.
      return ev.action;
  }
}

/** Which group a row belongs to, for the filter above the list. */
export type ActivityFilter = 'all' | 'members' | 'workspace' | 'projects' | 'keys';

export const FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: 'all', label: 'Tudo' },
  { key: 'members', label: 'Membros' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'projects', label: 'Projetos' },
  { key: 'keys', label: 'Chaves' },
];

export function groupOf(action: string): Exclude<ActivityFilter, 'all'> | null {
  if (action.startsWith('member.') || action.startsWith('invite.')) return 'members';
  if (action.startsWith('workspace.')) return 'workspace';
  if (action.startsWith('project.')) return 'projects';
  if (action.startsWith('apikey.')) return 'keys';
  return null;
}

/**
 * The search that matters: find a member.
 *
 * The acceptance criterion is "filter/find the affected member", so the query
 * is matched against the people on the row — actor and target, by name and by
 * address — and against the action. Not against the whole object: matching an
 * id nobody typed would produce results the reader cannot explain.
 */
export function matches(ev: ActivityEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [ev.actor_name, ev.actor_email, ev.target_name, ev.target_email, ev.action, describe(ev)]
    .some((f) => (f ?? '').toLowerCase().includes(q));
}

export function applyFilters(
  events: ActivityEvent[],
  filter: ActivityFilter,
  query: string,
): ActivityEvent[] {
  return events.filter(
    (ev) => (filter === 'all' || groupOf(ev.action) === filter) && matches(ev, query),
  );
}
