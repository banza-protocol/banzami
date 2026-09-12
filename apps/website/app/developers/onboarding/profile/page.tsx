'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/developers/portal/AuthShell';
import { Stepper } from '@/components/developers/portal/Stepper';
import { DeveloperAuthProvider, useDeveloperAuth } from '@/components/developers/portal/DeveloperAuth';
import { developerApi } from '@/lib/developer-api';

// Onboarding — Perfil (dossier ecrã 3). Stepper: Perfil active, rest future.
//
// This screen used to be a drawing of itself: two uncontrolled inputs, nothing
// read from them, and a button that routed onward. Someone typed their name at
// the first step of the journey and the Console then showed them two letters of
// their email for months, because the name never left the browser.
//
// It now writes the name through POST /auth/me and only advances when the
// server has it. The "Função" dropdown is gone rather than translated: there is
// no field for a role anywhere behind this screen — the workspace role is
// granted by an invite, not chosen here — so it was collecting an answer that
// went straight in the bin, which is worse than not asking.

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';
const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '14px 16px',
  border: '1.5px solid #EBDBD9',
  borderRadius: 14,
  fontSize: 15,
  color: '#2a2024',
  background: '#FFFDFD',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color .16s, box-shadow .16s',
} as const;

function ProfileStep() {
  const router = useRouter();
  const { status, user, csrf, setSession } = useDeveloperAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A name already on the account is the starting value — this screen is
  // reachable by URL, not only on the first pass through onboarding.
  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  // Naming yourself requires a session: the call is authenticated and CSRF
  // guarded, and without one the button would fail at the first step.
  useEffect(() => {
    if (status === 'anon') router.replace('/login');
  }, [status, router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value || busy || status !== 'authed') return;
    setBusy(true);
    setError('');
    try {
      const r = await developerApi.setName(value, csrf);
      setSession(r.user, r.csrf_token);
      router.push('/onboarding/project');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível guardar o nome.');
      setBusy(false);
    }
  }

  const ready = status === 'authed' && !!name.trim() && !busy;

  return (
    <div className="bz-view" style={{ width: '100%', maxWidth: 520 }}>
      <Stepper
        steps={[
          { label: 'Perfil', state: 'active' },
          { label: 'Organização', state: 'future' },
          { label: 'País', state: 'future' },
          { label: 'Projeto', state: 'future' },
        ]}
      />
      <form
        onSubmit={save}
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
          O seu nome aparece no Console e junto às ações que faz no workspace.
        </p>
        <label
          htmlFor="perfil-nome"
          style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#6a5a5e', marginBottom: 8 }}
        >
          Nome completo
        </label>
        <input
          id="perfil-nome"
          className="bz-in"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error ? true : undefined}
          placeholder="João Manuel"
          style={{ ...inputStyle, fontWeight: 600, borderColor: error ? '#E8A0A4' : '#EBDBD9' }}
        />
        {error ? (
          <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700, color: '#B5101F' }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!ready}
          className="bz-cta"
          style={{
            width: '100%',
            marginTop: 26,
            padding: 15,
            border: 'none',
            borderRadius: 14,
            background: ready ? ctaGradient : '#E7D8D6',
            color: ready ? '#fff' : '#a89a9e',
            fontWeight: 800,
            fontSize: 15.5,
            fontFamily: 'inherit',
            cursor: ready ? 'pointer' : 'default',
            boxShadow: ready ? '0 16px 30px -12px rgba(181,16,31,.55)' : 'none',
          }}
        >
          {busy ? 'A guardar…' : 'Continuar'}
        </button>
      </form>
    </div>
  );
}

export default function OnboardingProfilePage() {
  return (
    <DeveloperAuthProvider>
      <AuthShell>
        <ProfileStep />
      </AuthShell>
    </DeveloperAuthProvider>
  );
}
