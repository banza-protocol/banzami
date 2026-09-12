'use client';

import { useCallback, useEffect, useState } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { useToast } from '@/components/developers/portal/Toast';
import { useDeveloperAuth } from '@/components/developers/portal/DeveloperAuth';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';
import { developerApi, type DeveloperSession } from '@/lib/developer-api';
import { RenameField, utcStamp } from '../settings/settings-ui';

/**
 * A conta da pessoa — distinta do Workspace, do Projeto e do Negócio.
 *
 * The account menu offered "Alterar nome", "Segurança" (which linked to PROJECT
 * settings) and "Terminar sessão". Three different things were collapsed into
 * one place and one of them pointed at another concept entirely: a person's
 * security is not a project's configuration.
 *
 * This page holds what is actually the PERSON'S: who they are, how they
 * authenticate, and where they are signed in. It deliberately has no
 * "Preferências" section — the Console stores no preference of the person's,
 * only which workspace and project they last looked at, which is UI state and
 * restores itself. A settings page listing nothing that does anything is the
 * dead UI this milestone exists to remove.
 */
function Account() {
  const { user, csrf, refresh } = useDeveloperAuth();
  const { onApiError } = useDeveloperData();
  const { flash } = useToast();
  const [sessions, setSessions] = useState<DeveloperSession[] | 'loading' | 'unreadable'>('loading');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    developerApi.sessions().then(
      (r) => setSessions(r.sessions),
      () => setSessions('unreadable'),
    );
  }, []);
  useEffect(load, [load]);

  const rename = async (name: string) => {
    try {
      await developerApi.setName(name, csrf);
      await refresh();
      flash('Nome atualizado');
    } catch (e) {
      throw new Error(onApiError(e));
    }
  };

  const revokeOthers = async () => {
    setBusy(true);
    try {
      const { revoked } = await developerApi.revokeOtherSessions(csrf);
      flash(revoked === 0 ? 'Não havia outras sessões abertas.' : revoked === 1
        ? '1 sessão terminada nos outros dispositivos.'
        : `${revoked} sessões terminadas nos outros dispositivos.`);
      load();
    } catch (e) {
      flash(onApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const others = Array.isArray(sessions) ? sessions.filter((s) => !s.current).length : 0;

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>A minha conta</h1>
      <p style={{ margin: '6px 0 22px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
        Esta é a sua conta pessoal. O workspace, os projetos e o negócio que recebe pagamentos são
        outras coisas — e têm as suas próprias definições.
      </p>

      <Card style={{ padding: 24, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 900 }}>Perfil</h2>
        <div style={{ maxWidth: 420 }}>
          <RenameField label="NOME" value={user?.name ?? ''} onSave={rename} />
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#9a8a8e', letterSpacing: '.04em' }}>EMAIL</div>
          <div style={{ marginTop: 4, fontSize: 14.5, fontWeight: 800 }}>{user?.email ?? '—'}</div>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600 }}>
            O email identifica a conta e é por onde recebe o código de entrada. Não pode ser alterado
            aqui — abra um pedido no suporte.
          </p>
        </div>
      </Card>

      <Card style={{ padding: 24, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 900 }}>Segurança</h2>
        {/* The auth model as it actually is. No password field, no MFA toggle:
            there is neither, and showing a control for something that does not
            exist is worse than showing nothing. */}
        <p style={{ margin: 0, fontSize: 14, color: '#6b5a5e', fontWeight: 600, lineHeight: 1.6 }}>
          A entrada é feita com um código de 6 dígitos enviado para <strong>{user?.email ?? 'o seu email'}</strong>.
          Não existe palavra-passe para memorizar nem para perder, e o código expira passados poucos
          minutos. Quem tiver acesso ao seu email tem acesso a esta conta — proteja-o.
        </p>
      </Card>

      <Card style={{ padding: 24 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 900 }}>Sessões</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>
          Os dispositivos onde esta conta está aberta agora.
        </p>

        {sessions === 'loading' ? (
          <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>A carregar as sessões…</p>
        ) : sessions === 'unreadable' ? (
          <p style={{ margin: 0, fontSize: 14, color: '#8a7a7e', fontWeight: 700 }}>
            Não foi possível ler as sessões neste momento. Tente novamente dentro de momentos.
          </p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#9a8a8e', fontSize: 12, fontWeight: 800 }}>
                    <th style={{ padding: '8px 12px 8px 0' }}>DISPOSITIVO</th>
                    <th style={{ padding: '8px 12px' }}>ENDEREÇO</th>
                    <th style={{ padding: '8px 12px' }}>ÚLTIMA ATIVIDADE</th>
                    <th style={{ padding: '8px 0' }}>EXPIRA</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} style={{ borderTop: '1px solid #F3EDEC' }}>
                      <td style={{ padding: '11px 12px 11px 0', fontWeight: 800 }}>
                        {s.user_agent ? s.user_agent.slice(0, 48) : 'Dispositivo desconhecido'}
                        {s.current ? (
                          <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 20, background: '#ECFDF3', color: '#166534', fontSize: 11.5, fontWeight: 800 }}>
                            ESTE
                          </span>
                        ) : null}
                      </td>
                      <td style={{ padding: '11px 12px', color: '#6b5a5e' }}>{s.ip || '—'}</td>
                      <td style={{ padding: '11px 12px', color: '#6b5a5e' }}>{utcStamp(s.last_seen_at ?? s.created_at)}</td>
                      <td style={{ padding: '11px 0', color: '#6b5a5e' }}>{utcStamp(s.expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #F2E6E4' }}>
              <button
                type="button"
                onClick={revokeOthers}
                disabled={busy || others === 0}
                title={others === 0 ? 'Esta é a única sessão aberta.' : undefined}
                style={{
                  padding: '10px 16px', borderRadius: 10, fontWeight: 800, fontSize: 13.5,
                  border: '1.5px solid #F6D5D2', background: '#fff', color: '#B5101F',
                  cursor: busy || others === 0 ? 'not-allowed' : 'pointer',
                  opacity: busy || others === 0 ? 0.6 : 1,
                }}
              >
                Terminar as outras sessões
              </button>
              <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600 }}>
                {others === 0
                  ? 'Esta é a única sessão aberta — não há outra para terminar.'
                  : 'Fecha a sessão em todos os outros dispositivos. Esta continua aberta.'}
              </p>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

export default function AccountPage() {
  return (
    <PortalPage active="conta">
      <div className="bz-view" style={{ maxWidth: 860 }}>
        <Account />
      </div>
    </PortalPage>
  );
}
