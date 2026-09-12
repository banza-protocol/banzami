'use client';

import { useCallback, useEffect, useState } from 'react';
import { developerApi, type Member } from '@/lib/developer-api';
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
 * The workspace's members, as much of them as the platform can actually answer
 * for.
 *
 * GET /workspaces/{wsID}/members returns `{user_id, role, status}` and nothing
 * else — no name, no email — because developer-api's listMembers handler builds
 * that map by hand from a Member row that has no name or email column, and the
 * query behind it (pgStore.Members) never joins dev_users. So this rendered
 * teammates as the first twelve characters of a UUID with an ellipsis, and gave
 * each one an avatar containing the first two characters of that UUID, which
 * read as initials and were not.
 *
 * There is no way to fix that from here that does not involve inventing a
 * person, so this does not try. What it does instead:
 *
 *   * says "Você" against your own row, with the name and email the SESSION
 *     already knows — that is real, and it is the row the reader most needs to
 *     find before pressing Remover;
 *   * says "Membro da equipa" for everyone else, plainly, rather than dressing
 *     a UUID up as a person;
 *   * shows the id as an id — monospaced, copyable — because it is what a
 *     support conversation and the audit log both name.
 *
 * The gap is written up in the report: the fix is a join in pgStore.Members and
 * two fields in the handler's map.
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

/** An invite created in front of the reader, kept only so it can be revoked. */
type SessionInvite = { id: string; email: string; role: string };

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
  const [revoking, setRevoking] = useState<SessionInvite | null>(null);
  // Invites this session created. The API has DELETE for an invite but no GET,
  // so there is no way to list the invites that are already pending — see the
  // note under the list. Only the id, the email and the role are kept: the
  // token is a credential and is copied to the clipboard once, never held.
  const [sessionInvites, setSessionInvites] = useState<SessionInvite[]>([]);

  const wsID = activeWs?.id ?? null;
  const myRole = members.find((m) => m.user_id === user?.id)?.role ?? 'VIEWER';
  const canManage = isManager(myRole);
  const roleChoices = assignableRoles(myRole);

  const loadMembers = useCallback(async () => {
    if (!wsID) return;
    setLoad('loading');
    setError('');
    try {
      const { members: m } = await developerApi.listMembers(wsID);
      setMembers(m ?? []);
      setLoad('ready');
    } catch (e) {
      setError(onApiError(e));
      setLoad('error');
    }
  }, [wsID, onApiError]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  // A different workspace has different invites. Carrying the previous one's
  // across would offer a revoke that resolves to NOT_FOUND.
  useEffect(() => {
    setSessionInvites([]);
  }, [wsID]);

  const invite = async () => {
    if (!wsID || busy) return;
    setBusy(true);
    try {
      const inv = await developerApi.invite(wsID, inviteEmail, inviteRole, csrf);
      setInviteEmail('');
      // Show the invite link once so the manager can share it.
      void copyText(`${window.location.origin}/invites/accept?token=${inv.token}`);
      setSessionInvites((prev) => [...prev, { id: inv.invite_id, email: inv.email, role: inv.role }]);
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

  const revokeInvite = async (inv: SessionInvite) => {
    if (!wsID) return;
    try {
      await developerApi.revokeInvite(wsID, inv.id, csrf);
      setSessionInvites((prev) => prev.filter((x) => x.id !== inv.id));
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
        // The reader's own row is the one they need to find before pressing
        // anything, so it is the one that carries a real name.
        const who = self ? (user?.name?.trim() || user?.email || 'Você') : 'Membro da equipa';
        return (
          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #F5E9E7' }}>
            <span
              aria-hidden="true"
              style={{
                width: 36, height: 36, borderRadius: '50%', flex: 'none',
                background: self ? '#FBD2D0' : '#F3EDEC', color: self ? '#9A1B22' : '#a89a9e',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {/* Not initials. The previous avatar showed the first two
                  characters of a UUID, which looked exactly like initials and
                  belonged to nobody. */}
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8.4" r="3.7" stroke="currentColor" strokeWidth="1.9" />
                <path d="M4.9 19.5c.9-3.4 3.7-5.3 7.1-5.3s6.2 1.9 7.1 5.3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
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
                  style={{ padding: 0, border: 'none', background: 'none', fontFamily: mono, fontSize: 11.5, fontWeight: 700, color: '#a89a9e', cursor: 'pointer' }}
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
                aria-label={`Papel do membro ${shortId(m.user_id)}`}
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
                style={{ padding: '6px 11px', border: '1.5px solid #EBC7C4', borderRadius: 9, background: '#fff', color: '#B5101F', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
              >
                Remover
              </button>
            ) : null}
          </div>
        );
      })}

      <p style={{ margin: '12px 0 0', fontSize: 11.5, color: '#b8a4a6', fontWeight: 700, lineHeight: 1.5 }}>
        A plataforma ainda não devolve o nome nem o email dos outros membros — só o identificador
        de utilizador. Até isso mudar, esta lista mostra o que existe, sem inventar o resto.
      </p>

      {sessionInvites.length > 0 ? (
        <Card style={{ padding: 16, marginTop: 16 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 800, color: '#6a5a5e' }}>Convites criados agora</p>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#a89a9e', fontWeight: 700, lineHeight: 1.5 }}>
            Só os convites criados nesta sessão. A plataforma ainda não tem forma de listar os
            convites pendentes, por isso um convite criado noutro dia não aparece aqui e só pode ser
            deixado a expirar.
          </p>
          {sessionInvites.map((inv) => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #F5E9E7' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#2a2024', wordBreak: 'break-all' }}>{inv.email}</p>
                <p style={{ margin: '1px 0 0', fontSize: 11.5, color: '#a89a9e', fontWeight: 700 }}>
                  {roleLabel(inv.role)}
                </p>
              </div>
              <button
                onClick={() => setRevoking(inv)}
                disabled={busy}
                style={{ padding: '5px 11px', border: '1.5px solid #EBC7C4', borderRadius: 9, background: '#fff', color: '#B5101F', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
              >
                Revogar
              </button>
            </div>
          ))}
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
              style={{ padding: '10px 16px', border: 'none', borderRadius: 10, background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 13, cursor: busy || !inviteEmail ? 'not-allowed' : 'pointer', opacity: busy || !inviteEmail ? 0.6 : 1 }}
            >
              Convidar
            </button>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#6a5a5e', fontWeight: 700 }}>
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
          subject={`${removing.user_id} · ${roleLabel(removing.role)}`}
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
