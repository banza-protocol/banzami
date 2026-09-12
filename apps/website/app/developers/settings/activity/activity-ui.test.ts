import { describe as group, expect, it } from 'vitest';
import type { ActivityEvent } from '@/lib/developer-api';
import { actorLabel, applyFilters, describe, groupOf, matches, targetLabel } from './activity-ui';

const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: 'a1',
  action: 'member.role_changed',
  created_at: '2026-09-12T10:00:00Z',
  ...over,
});

group('a row reads as a sentence, not as a field dump', () => {
  it('names both halves of a role change', () => {
    const line = describe(
      ev({ target_name: 'João', role: 'VIEWER', previous_role: 'DEVELOPER' }),
    );
    // Both roles: "mudou para Leitor" does not say whether somebody was demoted,
    // which is the question a reader of an audit trail usually arrives with.
    expect(line).toContain('Programador');
    expect(line).toContain('Leitor');
    expect(line).toContain('João');
  });

  it('keeps the role somebody held when they were removed', () => {
    expect(describe(ev({ action: 'member.removed', target_name: 'João', previous_role: 'ADMIN' })))
      .toContain('Administrador');
  });

  it('renders an action it has no phrasing for rather than hiding the row', () => {
    // The server's allow-list decides what exists. A client that dropped rows it
    // could not phrase would hide a real change behind a UI gap.
    expect(describe(ev({ action: 'member.exiled' }))).toBe('member.exiled');
  });

  it('falls back to a short id when a deleted project has no name left', () => {
    expect(targetLabel(ev({ target_kind: 'PROJECT', target_ref: 'abcdef12-3456-7890-abcd-ef1234567890' })))
      .toBe('abcdef12…');
  });

  it('names an actor whose identity no longer resolves without pretending it does', () => {
    expect(actorLabel(ev({ actor_user_id: 'abcdef12-3456-7890-abcd-ef1234567890' })))
      .toBe('Utilizador abcdef12');
    expect(actorLabel(ev({}))).toBe('Sistema');
  });
});

group('finding the affected member', () => {
  const rows = [
    ev({ id: '1', action: 'member.invited', target_email: 'joao@x.co', role: 'VIEWER' }),
    ev({ id: '2', action: 'apikey.created', actor_name: 'Ana' }),
    ev({ id: '3', action: 'project.archived', target_name: 'Checkout' }),
    ev({ id: '4', action: 'member.removed', target_name: 'João', previous_role: 'ADMIN' }),
  ];

  it('matches a member by address and by name', () => {
    expect(applyFilters(rows, 'all', 'joao@x.co').map((r) => r.id)).toEqual(['1']);
    expect(applyFilters(rows, 'all', 'joão').map((r) => r.id)).toEqual(['4']);
  });

  it('groups actions the way the filter strip claims', () => {
    expect(groupOf('member.invited')).toBe('members');
    expect(groupOf('invite.revoked')).toBe('members');
    expect(groupOf('workspace.renamed')).toBe('workspace');
    expect(groupOf('project.created')).toBe('projects');
    expect(groupOf('apikey.rotated')).toBe('keys');
    expect(groupOf('something.else')).toBeNull();
  });

  it('combines the filter with the search rather than replacing it', () => {
    expect(applyFilters(rows, 'members', 'ana').map((r) => r.id)).toEqual([]);
    expect(applyFilters(rows, 'keys', 'ana').map((r) => r.id)).toEqual(['2']);
  });

  it('an empty query hides nothing', () => {
    expect(matches(rows[0], '   ')).toBe(true);
    expect(applyFilters(rows, 'all', '')).toHaveLength(4);
  });
});
