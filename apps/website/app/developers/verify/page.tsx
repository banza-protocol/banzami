'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/developers/portal/AuthShell';
import { IconChevronLeft, IconEnvelopeOpen } from '@/components/developers/portal/icons';

// OTP verification — dossier ecrã 2. Six single-digit inputs with auto-focus,
// backspace-to-previous, paste-distribute; the "Verificar código" button stays
// disabled until all six are filled. Resend counts down from 45s, then becomes
// a clickable "Reenviar código". The real code comes from the backend later.

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';
const OTP_LEN = 6;

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') || 'exemplo@empresa.co.ao';

  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(''));
  const [resend, setResend] = useState(45);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const filled = useMemo(() => digits.every((d) => d.length === 1), [digits]);

  useEffect(() => {
    if (resend <= 0) return;
    const t = setInterval(() => setResend((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resend]);

  const setAt = (i: number, v: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  };

  const onChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 1);
    setAt(i, v);
    if (v && i < OTP_LEN - 1) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !e.currentTarget.value && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LEN).split('');
    if (!d.length) return;
    const next = Array(OTP_LEN)
      .fill('')
      .map((_, idx) => d[idx] || '');
    setDigits(next);
    refs.current[Math.min(d.length, OTP_LEN - 1)]?.focus();
  };

  const verify = () => {
    if (filled) router.push('/developers/onboarding/profile');
  };

  return (
    <div
      className="bz-view"
      style={{
        width: '100%',
        maxWidth: 460,
        background: '#fff',
        border: '1px solid #F2E2E0',
        borderRadius: 26,
        padding: '34px 38px',
        boxShadow: '0 40px 90px -50px rgba(181,16,31,.5)',
      }}
    >
      <Link
        href="/developers/login"
        className="bz-icobtn"
        aria-label="Voltar"
        style={{
          width: 40,
          height: 40,
          border: '1px solid #F0E2E0',
          borderRadius: 12,
          background: '#fff',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6a5a5e',
          marginBottom: 20,
        }}
      >
        <IconChevronLeft size={19} />
      </Link>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'linear-gradient(150deg,#FFF1F0,#FDE0DE)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            color: '#B5101F',
          }}
        >
          <IconEnvelopeOpen size={27} />
        </div>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 900, letterSpacing: '-.02em' }}>Verifique o seu email</h1>
        <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.55, color: '#7a6a6e', fontWeight: 600 }}>
          Enviámos um código de 6 dígitos para
          <br />
          <strong style={{ color: '#2a2024', fontWeight: 800 }}>{email}</strong>
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '26px 0 8px' }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="bz-otp"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={onChange(i)}
            onKeyDown={onKeyDown(i)}
            onPaste={onPaste}
            aria-label={`Dígito ${i + 1}`}
            style={{
              width: 52,
              height: 60,
              textAlign: 'center',
              fontSize: 24,
              fontWeight: 900,
              color: '#2a2024',
              border: '1.5px solid #EBDBD9',
              borderRadius: 14,
              background: '#FFFDFD',
              outline: 'none',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              transition: 'border-color .16s, box-shadow .16s',
            }}
          />
        ))}
      </div>

      <button
        onClick={verify}
        disabled={!filled}
        className="bz-cta"
        style={{
          width: '100%',
          marginTop: 18,
          padding: 15,
          border: 'none',
          borderRadius: 14,
          background: ctaGradient,
          color: '#fff',
          fontWeight: 800,
          fontSize: 15.5,
          cursor: filled ? 'pointer' : 'not-allowed',
          opacity: filled ? 1 : 0.5,
          boxShadow: '0 16px 30px -12px rgba(181,16,31,.55)',
        }}
      >
        Verificar código
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginTop: 18,
          fontSize: 13.5,
          fontWeight: 700,
          color: '#9a8a8e',
        }}
      >
        <span>Não recebeu o código?</span>
        {resend > 0 ? (
          <span style={{ color: '#c2a8aa', fontWeight: 800 }}>
            Reenviar em 00:{String(resend).padStart(2, '0')}
          </span>
        ) : (
          <button
            onClick={() => setResend(45)}
            style={{
              color: '#B5101F',
              fontWeight: 800,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: 13.5,
            }}
          >
            Reenviar código
          </button>
        )}
      </div>
      <p style={{ margin: '14px 0 0', textAlign: 'center' }}>
        <Link href="/developers/login" style={{ fontSize: 14, fontWeight: 800, color: '#B5101F', textDecoration: 'none' }}>
          Usar outro email
        </Link>
      </p>
    </div>
  );
}

export default function DevelopersVerifyPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <VerifyInner />
      </Suspense>
    </AuthShell>
  );
}
