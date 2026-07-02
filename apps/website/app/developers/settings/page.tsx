'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { IconCopy } from '@/components/developers/portal/icons';
import { MembersManager } from '@/components/developers/portal/MembersManager';

// Definições — dossier ecrã 10. Geral, Membros da equipa, Segurança and a
// danger card for critical actions (all OTP-gated at wire time).

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';
const mono = "'JetBrains Mono', ui-monospace, monospace";

const ghostBtn = {
  padding: '8px 15px',
  border: '1.5px solid #EBDBD9',
  borderRadius: 10,
  background: '#fff',
  fontSize: 13,
  fontWeight: 800,
  color: '#B5101F',
  cursor: 'pointer',
} as const;

const fieldLabel = { margin: '0 0 5px', fontSize: 12, fontWeight: 800, color: '#a89a9e' } as const;

const DANGER = ['Encerrar projeto', 'Revogar todas as chaves', 'Remover membro'];

export default function SettingsPage() {
  return (
    <PortalPage active="settings">
      <div className="bz-view" style={{ maxWidth: 860 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Configurações</h1>
        <p style={{ margin: '6px 0 22px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>Geral, equipa e segurança do projeto.</p>

        {/* Geral */}
        <Card style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Geral</h3>
            <button className="bz-ghost" style={ghostBtn}>Editar</button>
          </div>
          <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <p style={fieldLabel}>NOME DO PROJETO</p>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>Minha Loja Online</p>
            </div>
            <div>
              <p style={fieldLabel}>ID DO PROJETO</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: mono, display: 'flex', alignItems: 'center', gap: 8 }}>
                prj_51HKZQ8BZM9F
                <button
                  data-copy="prj_51HKZQ8BZM9F"
                  className="bz-icobtn"
                  aria-label="Copiar ID do projeto"
                  style={{ width: 26, height: 26, border: '1px solid #F0E2E0', borderRadius: 7, background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#6a5a5e' }}
                >
                  <IconCopy size={12} strokeWidth={1.9} />
                </button>
              </p>
            </div>
            <div>
              <p style={fieldLabel}>AMBIENTE ATUAL</p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 30, background: '#FDF3E2', fontSize: 12, fontWeight: 800, color: '#B8770A' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#E0930F' }} />
                Sandbox
              </span>
            </div>
            <div>
              <p style={fieldLabel}>PAÍS · TIMEZONE</p>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>Angola · UTC+01:00 (Luanda)</p>
            </div>
          </div>
        </Card>

        {/* Membros — real data (workspace members + invites) */}
        <Card style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 900 }}>Membros da equipa</h3>
          <MembersManager />
        </Card>

        {/* Segurança */}
        <Card style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 900 }}>Segurança</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid #F5E9E7' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Reautenticação OTP para ações críticas</p>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#a89a9e', fontWeight: 700 }}>Pede um código por email antes de revelar ou rotacionar chaves.</p>
            </div>
            <span style={{ width: 44, height: 26, borderRadius: 30, background: '#1F8A5B', position: 'relative', flex: 'none' }}>
              <span style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff' }} />
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Rotacionar secret key</p>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#a89a9e', fontWeight: 700 }}>Invalida a chave atual e gera uma nova. Requer OTP.</p>
            </div>
            <button className="bz-ghost" style={{ ...ghostBtn, padding: '9px 15px' }}>Rotacionar</button>
          </div>
        </Card>

        {/* Ações críticas */}
        <div style={{ background: '#FFF7F6', border: '1px solid #F1CFCC', borderRadius: 18, padding: 22 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: '#B5101F' }}>Ações críticas</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#a08a8c', fontWeight: 600 }}>
            Estas ações podem ser irreversíveis e pedem confirmação por OTP.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {DANGER.map((d) => (
              <button key={d} style={{ padding: '10px 16px', border: '1.5px solid #EBC7C4', borderRadius: 11, background: '#fff', fontSize: 13, fontWeight: 800, color: '#B5101F', cursor: 'pointer' }}>
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>
    </PortalPage>
  );
}
