'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { IconCopy } from '@/components/developers/portal/icons';
import { MembersManager } from '@/components/developers/portal/MembersManager';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';

// Configurações — the project as the platform actually holds it.
//
// This page used to show a project called "Minha Loja Online" with the id
// "prj_51HKZQ8BZM9F", next to an "Editar" button that did nothing, a copy
// button that copied the invented id, a "Rotacionar" button with no handler,
// three danger buttons with no handlers, and a green toggle asserting that OTP
// reauthentication guarded critical actions.
//
// The last one is why this was rewritten rather than tidied. A fabricated
// project name is embarrassing; a security control that says it is on when
// nothing implements it is a lie a developer would rely on. There is no OTP
// gate on key reveal or rotation in this Console, so the claim is gone.
//
// What remains is what the platform can actually answer for: the project's own
// identity, read from the API; the real team, which was already real; and, for
// each capability that does not exist yet, a sentence saying so and where the
// equivalent action does live. A read-only field with a reason is a better
// product than a button that pretends.

const mono = "'JetBrains Mono', ui-monospace, monospace";
const fieldLabel = { margin: '0 0 5px', fontSize: 12, fontWeight: 800, color: '#a89a9e' } as const;
const note = { margin: '10px 0 0', fontSize: 12.5, color: '#a89a9e', fontWeight: 600, lineHeight: 1.5 } as const;

function CopyId({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        }, () => {});
      }}
      className="bz-icobtn"
      aria-label={done ? 'ID do projeto copiado' : 'Copiar ID do projeto'}
      title={done ? 'Copiado' : 'Copiar'}
      style={{
        width: 26, height: 26, border: '1px solid #F0E2E0', borderRadius: 7,
        background: done ? '#EAF7F0' : '#fff', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: done ? '#1F8A5B' : '#6a5a5e',
      }}
    >
      <IconCopy size={12} strokeWidth={1.9} />
    </button>
  );
}

export default function SettingsPage() {
  const { activeProject, prjLoad } = useDeveloperData();

  return (
    <PortalPage active="settings">
      <div className="bz-view" style={{ maxWidth: 860 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Configurações</h1>
        <p style={{ margin: '6px 0 22px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
          O projeto tal como a plataforma o regista, e a sua equipa.
        </p>

        <Card style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 900 }}>Geral</h3>

          {prjLoad === 'loading' && !activeProject ? (
            <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>A carregar o projeto…</p>
          ) : !activeProject ? (
            <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>
              Nenhum projeto selecionado.
            </p>
          ) : (
            <>
              <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={fieldLabel}>NOME DO PROJETO</p>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>{activeProject.name}</p>
                </div>
                <div>
                  <p style={fieldLabel}>ID DO PROJETO</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: mono, display: 'flex', alignItems: 'center', gap: 8, wordBreak: 'break-all' }}>
                    {activeProject.id}
                    <CopyId value={activeProject.id} />
                  </p>
                </div>
                <div>
                  <p style={fieldLabel}>AMBIENTE</p>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 30, background: '#FDF3E2', fontSize: 12, fontWeight: 800, color: '#B8770A' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#E0930F' }} />
                    Sandbox
                  </span>
                </div>
                <div>
                  <p style={fieldLabel}>CRIADO</p>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>
                    {new Date(activeProject.created_at).toISOString().replace('T', ' ').slice(0, 16)} UTC
                  </p>
                </div>
              </div>
              <p style={note}>
                O nome e o identificador do projeto são fixos depois de criado. O identificador é
                o que a API usa para atribuir chaves, webhooks e registos a este projeto, e mudá-lo
                separaria o projeto do seu próprio histórico.
              </p>
            </>
          )}
        </Card>

        <Card style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 900 }}>Membros da equipa</h3>
          <MembersManager />
        </Card>

        <Card style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 900 }}>Segurança</h3>
          <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.55 }}>
            O acesso à consola é por código enviado para o seu email, e a sessão é um cookie
            <code style={{ fontFamily: mono, fontSize: 12.5 }}> __Host-</code> que o navegador só
            envia para a API. As chaves são reveladas uma única vez, no momento em que são criadas
            ou rotacionadas: a plataforma guarda o hash e não consegue mostrar-lhe uma chave
            existente outra vez.
          </p>
          <p style={{ margin: 0, fontSize: 13.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.55 }}>
            Rotacionar ou revogar uma chave faz-se na página{' '}
            <Link href="/api-keys" style={{ color: '#B5101F', fontWeight: 800 }}>API Keys</Link>,
            onde cada chave tem as suas próprias acções.
          </p>
        </Card>

        <div style={{ background: '#FFF7F6', border: '1px solid #F1CFCC', borderRadius: 18, padding: 22 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: '#B5101F' }}>Encerrar o projeto</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#a08a8c', fontWeight: 600, lineHeight: 1.6 }}>
            Ainda não é possível encerrar um projeto a partir da consola. Um projeto guarda
            registos financeiros e a sua ligação de destinatário é permanente depois do primeiro
            pagamento, por isso encerrá-lo é uma operação do operador e não um botão.
            Para o fazer, escreva para{' '}
            <a href="mailto:developers@banzami.com" style={{ color: '#B5101F', fontWeight: 800 }}>
              developers@banzami.com
            </a>{' '}
            a partir do email da sua conta.
          </p>
        </div>
      </div>
    </PortalPage>
  );
}
