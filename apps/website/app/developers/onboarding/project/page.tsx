'use client';

import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/developers/portal/AuthShell';
import { Stepper } from '@/components/developers/portal/Stepper';
import { IconChevronDown, IconCheck } from '@/components/developers/portal/icons';

// Onboarding — Projeto (dossier ecrã 4). Stepper: Perfil/Organização/País done,
// Projeto active. "Criar projeto" enters the portal dashboard.

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';
const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  border: '1.5px solid #EBDBD9',
  borderRadius: 14,
  fontSize: 15,
  color: '#2a2024',
  background: '#FFFDFD',
  outline: 'none',
  transition: 'border-color .16s, box-shadow .16s',
} as const;
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 800, color: '#6a5a5e', marginBottom: 8 } as const;

function Select({ options }: { options: string[] }) {
  return (
    <div style={{ position: 'relative' }}>
      <select className="bz-in" style={{ ...inputStyle, fontWeight: 700, appearance: 'none', cursor: 'pointer' }}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <span
        style={{ position: 'absolute', right: 15, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#b8a4a6' }}
      >
        <IconChevronDown size={18} />
      </span>
    </div>
  );
}

export default function OnboardingProjectPage() {
  const router = useRouter();
  return (
    <AuthShell>
      <div className="bz-view" style={{ width: '100%', maxWidth: 560 }}>
        <Stepper
          steps={[
            { label: 'Perfil', state: 'done' },
            { label: 'Organização', state: 'done' },
            { label: 'País', state: 'done' },
            { label: 'Projeto', state: 'active' },
          ]}
        />
        <div
          style={{
            background: '#fff',
            border: '1px solid #F2E2E0',
            borderRadius: 26,
            padding: '36px 40px',
            boxShadow: '0 40px 90px -50px rgba(181,16,31,.5)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: '-.02em' }}>Crie o seu primeiro projeto</h1>
          <p style={{ margin: '11px 0 26px', fontSize: 15, color: '#7a6a6e', fontWeight: 600 }}>
            Um projeto ajuda a organizar as suas integrações.
          </p>
          <label style={labelStyle}>Nome do projeto</label>
          <input className="bz-in" defaultValue="Minha Loja Online" style={{ ...inputStyle, fontWeight: 600, marginBottom: 18 }} />
          <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>País principal</label>
              <Select options={['Angola', 'Moçambique', 'Cabo Verde']} />
            </div>
            <div>
              <label style={labelStyle}>Tipo de integração</label>
              <Select options={['Loja online', 'Aplicação mobile', 'Plataforma SaaS', 'Marketplace', 'Empresa / ERP', 'Outro']} />
            </div>
          </div>
          <label style={labelStyle}>Ambiente inicial</label>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 13,
              padding: 16,
              border: '1.5px solid #CFE9DA',
              borderRadius: 16,
              background: '#F1FAF4',
            }}
          >
            <span
              style={{
                flex: 'none',
                marginTop: 1,
                width: 22,
                height: 22,
                borderRadius: 7,
                background: '#1F8A5B',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <IconCheck size={14} strokeWidth={2.4} />
            </span>
            <div>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: '#186A47' }}>
                Sandbox <span style={{ fontWeight: 700, color: '#3d8a66' }}>· ambiente de testes</span>
              </p>
              <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.5, color: '#3d8a66', fontWeight: 600 }}>
                O ambiente Sandbox permite testar todas as integrações sem movimentar dinheiro real.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/')}
            className="bz-cta"
            style={{
              width: '100%',
              marginTop: 26,
              padding: 15,
              border: 'none',
              borderRadius: 14,
              background: ctaGradient,
              color: '#fff',
              fontWeight: 800,
              fontSize: 15.5,
              cursor: 'pointer',
              boxShadow: '0 16px 30px -12px rgba(181,16,31,.55)',
            }}
          >
            Criar projeto
          </button>
        </div>
      </div>
    </AuthShell>
  );
}
