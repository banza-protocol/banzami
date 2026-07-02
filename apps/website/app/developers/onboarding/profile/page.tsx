'use client';

import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/developers/portal/AuthShell';
import { Stepper } from '@/components/developers/portal/Stepper';
import { IconChevronDown } from '@/components/developers/portal/icons';

// Onboarding — Perfil (dossier ecrã 3). Stepper: Perfil active, rest future.

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

export default function OnboardingProfilePage() {
  const router = useRouter();
  return (
    <AuthShell>
      <div className="bz-view" style={{ width: '100%', maxWidth: 520 }}>
        <Stepper
          steps={[
            { label: 'Perfil', state: 'active' },
            { label: 'Organização', state: 'future' },
            { label: 'País', state: 'future' },
            { label: 'Projeto', state: 'future' },
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
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: '-.02em' }}>Vamos conhecer-te</h1>
          <p style={{ margin: '11px 0 26px', fontSize: 15, color: '#7a6a6e', fontWeight: 600 }}>
            Vamos começar com algumas informações básicas.
          </p>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#6a5a5e', marginBottom: 8 }}>
            Nome completo
          </label>
          <input className="bz-in" placeholder="João Manuel" style={{ ...inputStyle, fontWeight: 600, marginBottom: 18 }} />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#6a5a5e', marginBottom: 8 }}>
            Função
          </label>
          <div style={{ position: 'relative' }}>
            <select
              className="bz-in"
              defaultValue="CTO"
              style={{ ...inputStyle, fontWeight: 700, appearance: 'none', cursor: 'pointer' }}
            >
              <option>Founder</option>
              <option>CTO</option>
              <option>Developer</option>
              <option>Product Manager</option>
              <option>Finance</option>
              <option>Operations</option>
              <option>Other</option>
            </select>
            <span
              style={{ position: 'absolute', right: 15, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#b8a4a6' }}
            >
              <IconChevronDown size={18} />
            </span>
          </div>
          <button
            onClick={() => router.push('/onboarding/project')}
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
            Continuar
          </button>
        </div>
      </div>
    </AuthShell>
  );
}
