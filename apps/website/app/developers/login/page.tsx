'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/developers/portal/AuthShell';
import { developerApi, ApiError, MESSAGES } from '@/lib/developer-api';
import { safeReturnPath } from '@/lib/return-path';

// Access (Email only) — Auth V1 is Email + OTP: no password, phone, Google or
// name at entry, and no separate signup vs login journey. The same email + OTP
// proof handles a returning developer and a first-time one, so the page shows a
// single access action ("Continuar") — never a "create account" / "sign in"
// choice. The backend determines the correct account state after the OTP proof.

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

export default function DevelopersLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const goVerify = async () => {
    setError('');
    setBusy(true);
    try {
      await developerApi.requestOtp(email);
      // Uniform response — always advance to the code screen.
      const next = safeReturnPath(new URLSearchParams(window.location.search).get('next'));
      router.push(`/verify?email=${encodeURIComponent(email)}${next === '/' ? '' : `&next=${encodeURIComponent(next)}`}`);
    } catch (e) {
      // The API names the situation precisely — INVALID_EMAIL is not the same as
      // "could not send". Re-deriving a message from a short list of codes threw
      // that diagnosis away and told a developer with a typo to try again, which
      // is exactly how they reach the rate limiter. Look the code up; keep the
      // generic sentence only for a genuine send failure.
      const err = e instanceof ApiError ? e : null;
      setError(
        (err && MESSAGES[err.code]) || 'Não foi possível enviar o código. Tente novamente.',
      );
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div
        className="bz-view"
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          border: '1px solid #EFE2E0',
          borderRadius: 20,
          padding: '38px 36px 32px',
          boxShadow: '0 24px 60px -40px rgba(42,32,36,.35)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.18, color: '#2a2024' }}>
          Aceder à Banzami Developers
        </h1>
        <p style={{ margin: '12px 0 26px', fontSize: 14.5, lineHeight: 1.55, color: '#7a6a6e', fontWeight: 600 }}>
          Introduza o seu email para receber um código de acesso.
        </p>
        <label htmlFor="dev-email" style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#6a5a5e', marginBottom: 8 }}>
          Email
        </label>
        <input
          id="dev-email"
          className="bz-in"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@empresa.com"
          onKeyDown={(e) => {
            if (e.key === 'Enter') goVerify();
          }}
          style={{
            width: '100%',
            padding: '14px 16px',
            border: '1.5px solid #EBDBD9',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            color: '#2a2024',
            background: '#FFFDFD',
            outline: 'none',
            transition: 'border-color .16s, box-shadow .16s',
          }}
        />
        <button
          onClick={goVerify}
          disabled={busy}
          className="bz-cta"
          style={{
            width: '100%',
            marginTop: 16,
            padding: 15,
            border: 'none',
            borderRadius: 12,
            background: ctaGradient,
            color: '#fff',
            fontWeight: 800,
            fontSize: 15.5,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            boxShadow: '0 16px 30px -14px rgba(181,16,31,.5)',
          }}
        >
          {busy ? 'A enviar…' : 'Continuar'}
        </button>
        {error ? (
          <p role="alert" style={{ margin: '12px 0 0', fontSize: 13, fontWeight: 700, color: '#C4303C' }}>
            {error}
          </p>
        ) : null}
        <p style={{ margin: '14px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.5 }}>
          Enviaremos um código de verificação para o seu email.
        </p>
        <div style={{ height: 1, background: '#F2E6E4', margin: '22px 0 16px' }} />
        {/* Single access flow: the backend resolves first-time vs returning after
            the OTP proof, so there is no secondary "sign in" / "create account"
            control. Absolute URLs: this page is served from developers.banzami.com.
            Authentication is not Terms acceptance (TERMS-INFRASTRUCTURE
            -CONSISTENCY-001, owner decision 2026-10-09): signing in only signs
            in, and this line points at the documents without asserting agreement.
            The Terms are accepted explicitly later, at business creation
            (merchant_applications.terms_accepted_at). */}
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: '#a89a9e', fontWeight: 600 }}>
          Ao continuar, prossegue com a autenticação. Consulte os{' '}
          <a href="https://banzami.com/termos" target="_blank" rel="noopener noreferrer" style={{ color: '#9A1B22', fontWeight: 800, textDecoration: 'none' }}>
            Termos de Serviço
          </a>{' '}
          e a{' '}
          <a href="https://banzami.com/privacidade" target="_blank" rel="noopener noreferrer" style={{ color: '#9A1B22', fontWeight: 800, textDecoration: 'none' }}>
            Política de Privacidade
          </a>
          .
        </p>
      </div>
    </AuthShell>
  );
}
