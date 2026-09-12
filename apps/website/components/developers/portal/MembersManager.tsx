'use client';

import { useCallback, useEffect, useState } from 'react';
import { developerApi, type Invite, type Member } from '@/lib/developer-api';
import { useDeveloperAuth } from './DeveloperAuth';
import { useDeveloperData } from './DeveloperData';
import { useToast, copyText } from './Toast';
import { Card } from './ui';
import { ConfirmDialog } from './ConfirmDialog';
import {
  assignableRoles,
  canModifyTarget,
  isKnownRole,
  isManager,
  roleLabel,
  roleSummary,
} from '@/lib/developer-roles';

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';
const mono = "'JetBrains Mono', ui-monospace, monospace";

/**
 * The workspace's members, by name.
 *
 * GET /workspaces/{wsID}/members now answers with the member's own sign-in
 * identity — `{user_id, role, status, name, email}` — so a row can say who it is
 * about instead of showing a truncated UUID to somebody deciding whether to
 * demote them.
 *
 * Two shapes come back that are not a name:
 *
 *   * name empty, email set — an account that never set a name. The email is
 *     the identity then, and the avatar stays the glyph: initials sliced off an
 *     email are a guess, and that guess was removed from this Console on
 *     purpose.
 *   * both empty — the identity row could not be read. That is the server
 *     declining to answer, so the row says "Membro da equipa" rather than
 *     dressing the id up as a person.
 *
 * The id stays reachable either way, monospaced and copyable, because it is what
 * the API takes and what a support conversation and the audit log both name.
 */

/** The member's status, in words. ACTIVE is the only one the list can return —
 *  pgStore.Members filters on it — so anything else is a server this build does
 *  not know, and it says so rather than printing the code. */
function statusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'Membro ativo';
    case 'INVITED':
    case 'PENDING':
      return 'Convite pendente';
    case 'REMOVED':
      return 'Removido';
    default:
      return 'Estado desconhecido';
  }
}

/** Enough of the id to tell two members apart, and to quote in a ticket. */
function shortId(userID: string): string {
  return userID.length > 10 ? `${userID.slice(0, 8)}…${userID.slice(-4)}` : userID;
}

/**
 * Who the row is about: the name if there is one, the email if there is not.
 *
 * Falls back to words rather than to the id — a UUID in the place a name goes
 * reads as a person's name and is not one — and the id is offered separately,
 * as an id.
 */
function displayName(m: Member): string {
  return m.name?.trim() || m.email?.trim() || 'Membro da equipa';
}

/**
 * Initials, only from a real name.
 *
 * First and last word, so "Fidel Monteiro" is FM and a single name is one
 * letter. An email is never sliced into initials: "fidel@…" would render as F,
 * or FM for "fidel.monteiro@…", and neither is anybody's initials — that
 * ambiguity was removed from this Console deliberately.
 */
function initialsOf(name: string | undefined): string | null {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** The same UTC rendering the rest of the Console uses for a server timestamp. */
function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

export function MembersManager() {
  const { user } = useDeveloperAuth();
  const { activeWs, wsLoad, csrf, onApiError } = useDeveloperData();
  const { flash } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('DEVELOPER');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [revoking, setRevoking] = useState<Invite | null>(null);
  // The invites the workspace actually has out, from the server. This used to be
  // the invites created in front of the reader and nothing else, because there
  // was no route that listed them: an invite sent yesterday could not be seen or
  // revoked, only left to expire.
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesError, setInvitesError] = useState('');

  const wsID = activeWs?.id ?? null;
  const myRole = members.find((m) => m.user_id === user?.id)?.role ?? 'VIEWER';
  const canManage = isManager(myRole);
  const roleChoices = assignableRoles(myRole);

  // Managers only — the list is 403 for anyone else, and that refusal is the
  // server being right, not a failure to report. The role is passed in rather
  // than read from state because this runs in the same pass that fetched it.
  const loadInvites = useCallback(async (role: string) => {
    if (!wsID || !isManager(role)) {
      setInvites([]);
      setInvitesError('');
      return;
    }
    try {
      const { invites: inv } = await developerApi.listInvites(wsID);
      setInvites(inv ?? []);
      setInvitesError('');
    } catch (e) {
      // A workspace whose invites could not be read still has members worth
      // showing, so this does not take the whole screen down with it.
      setInvites([]);
      setInvitesError(onApiError(e));
    }
  }, [wsID, onApiError]);

  const loadMembers = useCallback(async () => {
    if (!wsID) return;
    setLoad('loading');
    setError('');
    try {
      const { members: m } = await developerApi.listMembers(wsID);
      const list = m ?? [];
      setMembers(list);
      setLoad('ready');
      await loadInvites(list.find((x) => x.user_id === user?.id)?.role ?? 'VIEWER');
    } catch (e) {
      setError(onApiError(e));
      setLoad('error');
    }
  }, [wsID, user?.id, onApiError, loadInvites]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const invite = async () => {
    if (!wsID || busy) return;
    setBusy(true);
    try {
      const inv = await developerApi.invite(wsID, inviteEmail, inviteRole, csrf);
      setInviteEmail('');
      // Show the invite link once so the manager can share it. The token is
      // never kept: it goes to the clipboard and the pending list below comes
      // from the server, which does not return one.
      void copyText(`${window.location.origin}/invites/accept?token=${inv.token}`);
      flash('Convite criado — link copiado');
      await loadMembers();
    } catch (e) {
      flash(onApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (m: Member, role: string) => {
    if (!wsID || role === m.role) return;
    setBusy(true);
    try {
      await developerApi.setRole(wsID, m.user_id, role, csrf);
      await loadMembers();
      flash('Papel atualizado');
    } catch (e) {
      flash(onApiError(e)); // FORBIDDEN or LAST_OWNER surfaced clearly
    } finally {
      setBusy(false);
    }
  };

  // Removing a member revokes their access to every project in the workspace.
  // The confirmation names who, and a refusal the server makes on the way —
  // FORBIDDEN, or LAST_OWNER — is shown in the dialog rather than in a toast
  // over a list that still contains the member.
  const remove = async (m: Member) => {
    if (!wsID) return;
    try {
      await developerApi.removeMember(wsID, m.user_id, csrf);
      await loadMembers();
      flash('Membro removido');
    } catch (e) {
      throw new Error(onApiError(e));
    }
  };

  // The list is re-read afterwards rather than filtered locally: the revoked
  // invite is gone, and so is anything else that changed while the dialog was
  // open — another manager's invite, or one that expired.
  const revokeInvite = async (inv: Invite) => {
    if (!wsID) return;
    try {
      await developerApi.revokeInvite(wsID, inv.id, csrf);
      await loadInvites(myRole);
      flash('Convite revogado');
    } catch (e) {
      throw new Error(onApiError(e));
    }
  };

  if (wsLoad === 'loading' || load === 'loading') {
    return <p style={{ padding: '16px 0', color: '#8a7a7e', fontWeight: 700, fontSize: 14 }}>A carregar membros…</p>;
  }
  if (!activeWs) {
    return <p style={{ padding: '16px 0', color: '#8a7a7e', fontWeight: 700, fontSize: 14 }}>Selecione ou crie um workspace.</p>;
  }
  if (load === 'error') {
    return <p style={{ padding: '16px 0', color: '#C4303C', fontWeight: 800, fontSize: 14 }}>{error}</p>;
  }

  return (
    <div>
      {members.map((m) => {
        const self = m.user_id === user?.id;
        const modifiable = canManage && !self && canModifyTarget(myRole, m.role);
        const known = isKnownRole(m.role);
        // The member's own identity, with the session as a fallback on the
        // reader's own row — the session knows the name and email of whoever is
        // signed in even if this list came back thin.
        const who = self
          ? (m.name?.trim() || user?.name?.trim() || m.email?.trim() || user?.email || 'Você')
          : displayName(m);
        const initials = initialsOf(self ? (m.name || user?.name) : m.name);
        return (
          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #F5E9E7' }}>
            <span
              aria-hidden="true"
              data-testid={`member-avatar-${m.user_id}`}
              style={{
                width: 36, height: 36, borderRadius: '50%', flex: 'none',
                background: self ? '#FBD2D0' : '#F3EDEC', color: self ? '#9A1B22' : '#a89a9e',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12.5, fontWeight: 900, letterSpacing: '.02em',
              }}
            >
              {/* Initials only where there is a name to take them from. A member
                  who never set one keeps the glyph: letters cut out of an email
                  address look like initials and belong to nobody. */}
              {initials ?? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8.4" r="3.7" stroke="currentColor" strokeWidth="1.9" />
                  <path d="M4.9 19.5c.9-3.4 3.7-5.3 7.1-5.3s6.2 1.9 7.1 5.3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#2a2024', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                {who}
                {self ? (
                  <span style={{ padding: '2px 8px', borderRadius: 30, background: '#FFF1F0', color: '#B5101F', fontSize: 10.5, fontWeight: 900 }}>
                    VOCÊ
                  </span>
                ) : null}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#a89a9e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {/* Only when it is not already the line above: a member with no
                    name IS their email, and printing it twice says nothing. */}
                {m.email && m.email.trim() !== who ? (
                  <>
                    <span style={{ wordBreak: 'break-all' }}>{m.email}</span>
                    <span aria-hidden="true">·</span>
                  </>
                ) : null}
                <span>{statusLabel(m.status)}</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => {
                    void copyText(m.user_id);
                    flash('ID de utilizador copiado');
                  }}
                  title={m.user_id}
                  aria-label={`Copiar o ID de utilizador ${m.user_id}`}
                  style={{ display: 'inline-flex', alignItems: 'center', minHeight: 24, padding: '0 2px', border: 'none', background: 'none', fontFamily: mono, fontSize: 11.5, fontWeight: 700, color: '#a89a9e', cursor: 'pointer' }}
                >
                  {shortId(m.user_id)}
                </button>
              </p>
            </div>
            {modifiable ? (
              <select
                value={m.role}
                onChange={(e) => changeRole(m, e.target.value)}
                disabled={busy}
                aria-label={`Papel de ${who}`}
                // Same rule as the read-only pill below: a role this build does
                // not know renders as words, and the wire code stays reachable
                // on the title rather than in the sentence.
                title={known ? undefined : m.role}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #EBDBD9', background: '#fff', fontSize: 12.5, fontWeight: 800, color: '#2a2024', cursor: 'pointer' }}
              >
                {/* current role + roles this actor may assign */}
                {[m.role, ...roleChoices.filter((r) => r !== m.role)].map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            ) : (
              <span
                // A role this build does not know still has to be traceable, so
                // the wire code lives on the title rather than in the sentence.
                title={known ? undefined : m.role}
                style={{ padding: '4px 11px', borderRadius: 30, background: m.role === 'OWNER' ? '#FFF1F0' : '#F3EDEC', fontSize: 12, fontWeight: 800, color: m.role === 'OWNER' ? '#B5101F' : '#6a5a5e' }}
              >
                {roleLabel(m.role)}
              </span>
            )}
            {modifiable ? (
              <button
                onClick={() => setRemoving(m)}
                disabled={busy}
                aria-label={`Remover ${who}`}
                style={{ padding: '6px 11px', border: '1.5px solid #EBC7C4', borderRadius: 9, background: '#fff', color: '#B5101F', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
              >
                Remover
              </button>
            ) : null}
          </div>
        );
      })}

      {canManage ? (
        <Card style={{ padding: 16, marginTop: 16 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 800, color: '#6a5a5e' }}>Convites pendentes</p>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#a89a9e', fontWeight: 700, lineHeight: 1.5 }}>
            Quem foi convidado e ainda não entrou. Revogar um convite invalida o link
            imediatamente.
          </p>

          {invitesError ? (
            <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#C4303C' }}>{invitesError}</p>
          ) : invites.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: '#a89a9e', fontWeight: 700 }}>
              Não há convites pendentes neste workspace.
            </p>
          ) : (
            invites.map((inv) => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #F5E9E7' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#2a2024', wordBreak: 'break-all' }}>{inv.email}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 11.5, color: '#a89a9e', fontWeight: 700 }}>
                    {roleLabel(inv.role)} · expira em <span style={{ fontFamily: mono }}>{when(inv.expires_at)}</span>
                  </p>
                </div>
                <button
                  onClick={() => setRevoking(inv)}
                  disabled={busy}
                  aria-label={`Revogar o convite de ${inv.email}`}
                  style={{ padding: '5px 11px', border: '1.5px solid #EBC7C4', borderRadius: 9, background: '#fff', color: '#B5101F', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  Revogar
                </button>
              </div>
            ))
          )}
        </Card>
      ) : null}

      {canManage ? (
        <Card style={{ padding: 16, marginTop: 16 }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: '#6a5a5e' }}>Convidar membro</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@empresa.co.ao"
              aria-label="Email do novo membro"
              className="bz-in"
              style={{ flex: 1, minWidth: 200, padding: '10px 12px', border: '1.5px solid #EBDBD9', borderRadius: 10, fontSize: 13.5, fontWeight: 600, background: '#FFFDFD', outline: 'none' }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              aria-label="Papel do novo membro"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1.5px solid #EBDBD9', background: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
            >
              {roleChoices.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            <button
              onClick={invite}
              disabled={busy || !inviteEmail}
              className="bz-cta"
              // A disabled control must say why it is disabled. This one was
              // greyed out with nothing explaining it: the reader could see the
              // button and not the reason, which is indistinguishable from a
              // dead button.
              title={busy ? 'A enviar o convite…' : !inviteEmail ? 'Escreva o email da pessoa que quer convidar.' : undefined}
              aria-describedby="invite-hint"
              style={{ padding: '10px 16px', border: 'none', borderRadius: 10, background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 13, cursor: busy || !inviteEmail ? 'not-allowed' : 'pointer', opacity: busy || !inviteEmail ? 0.6 : 1 }}
            >
              Convidar
            </button>
          </div>
          <p id="invite-hint" style={{ margin: '10px 0 0', fontSize: 12, color: '#6a5a5e', fontWeight: 700 }}>
            {!inviteEmail ? 'Escreva o email da pessoa que quer convidar. ' : ''}
            <strong>{roleLabel(inviteRole)}</strong> pode {roleSummary(inviteRole)}.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#a89a9e', fontWeight: 700 }}>
            Um link de convite é gerado e copiado. Expira em 7 dias e pode ser revogado.
          </p>
        </Card>
      ) : (
        <p style={{ margin: '14px 0 0', fontSize: 12.5, color: '#a89a9e', fontWeight: 700 }}>
          Só um Proprietário ou Administrador pode convidar ou gerir membros.
        </p>
      )}

      {removing ? (
        <ConfirmDialog
          title="Remover membro"
          body="O membro perde acesso a este workspace e a todos os seus projetos. Para voltar a entrar precisa de um convite novo."
          // Who, not which id: the dialog is read by someone checking they are
          // about to remove the right colleague.
          subject={`${displayName(removing)} · ${roleLabel(removing.role)}`}
          confirmLabel="Remover"
          danger
          onConfirm={() => remove(removing)}
          onClose={() => setRemoving(null)}
        />
      ) : null}

      {revoking ? (
        <ConfirmDialog
          title="Revogar convite"
          body="O link deixa de funcionar imediatamente. Quem o tiver recebido não consegue entrar no workspace com ele."
          subject={`${revoking.email} · ${roleLabel(revoking.role)}`}
          confirmLabel="Revogar"
          danger
          onConfirm={() => revokeInvite(revoking)}
          onClose={() => setRevoking(null)}
        />
      ) : null}
    </div>
  );
}
