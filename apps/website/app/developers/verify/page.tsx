'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/developers/portal/AuthShell';
import { IconChevronLeft, IconEnvelopeOpen } from '@/components/developers/portal/icons';
import { developerApi, ApiError } from '@/lib/developer-api';

// OTP verification — six single-digit inputs with auto-focus,
// backspace-to-previous, paste-distribute, and AUTO-SUBMIT on the sixth digit.
//
// The sixth digit verifies on its own. Requiring a click after the code is
// already complete is a step the user has no reason to take, and it reads as a
// hang: the form looks finished and nothing happens. The button stays as a
// fallback for anyone who wants it, and both paths call the SAME verify().
//
// Auto-submit is only safe if it fires exactly once. The completed code can
// arrive from a keystroke, a paste, a browser one-time-code autofill, Enter, or
// the button — and React may re-run the effect without the code changing. So the
// in-flight flag is a REF, not state: state updates are batched and a second
// trigger in the same tick would read a stale `false`. The last submitted code is
// remembered for the same reason, and cleared as soon as the code is incomplete
// again so that correcting a digit re-arms submission — including retyping the
// same code after a failure.

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
      return;
    }
    // Enter with a complete code submits too. It races the sixth-digit effect by
    // design; the in-flight ref is what makes that a single request.
    if (e.key === 'Enter') {
      e.preventDefault();
      void verify(digits.join(''));
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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Refs, not state: two triggers in the same tick (sixth digit + Enter, or a
  // paste that also completes the code) would both read a stale `false` from
  // batched state and fire twice.
  const inFlight = useRef(false);
  const lastSubmitted = useRef('');

  const verify = useCallback(async (code: string) => {
    if (code.length !== OTP_LEN || inFlight.current) return;
    inFlight.current = true;
    lastSubmitted.current = code;
    setError('');
    setBusy(true);
    try {
      // On success the API sets the host-only session cookie; the portal restores
      // the session (and a fresh CSRF token) via /auth/me on load.
      await developerApi.verify(email, code);
      router.push('/');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'UNAVAILABLE';
      setError(
        code === 'RATE_LIMITED'
          ? 'Demasiadas tentativas. Tente novamente daqui a pouco.'
          : code === 'UNAUTHENTICATED' || code === 'VALIDATION'
            ? 'Código inválido ou expirado.'
            : 'Não foi possível verificar. Tente novamente.',
      );
      setBusy(false);
      inFlight.current = false;
      // Leave the digits in place — a network blip is not a reason to make the
      // user retype a code that may still be valid — but put the caret back so
      // correcting it takes no mouse.
      refs.current[OTP_LEN - 1]?.focus();
    }
  }, [email, router]);

  // The sixth digit submits. Completion can arrive from a keystroke, a paste, or
  // a browser one-time-code autofill, and this effect is the single place that
  // notices. `lastSubmitted` stops a re-render from submitting the same code
  // twice, and clearing it the moment the code is incomplete re-arms submission
  // so that fixing a digit — or retyping the same code after a failure — works.
  useEffect(() => {
    const code = digits.join('');
    if (!filled) {
      lastSubmitted.current = '';
      return;
    }
    if (inFlight.current || lastSubmitted.current === code) return;
    void verify(code);
  }, [digits, filled, verify]);

  const resendOtp = async () => {
    if (resend > 0) return;
    try {
      await developerApi.requestOtp(email);
      setResend(45);
      setError('');
    } catch {
      setError('Não foi possível reenviar o código.');
    }
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
        href="/login"
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
            autoComplete="one-time-code"
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

      {error ? (
        <p role="alert" style={{ margin: '14px 0 0', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#C4303C' }}>
          {error}
        </p>
      ) : null}

      <button
        onClick={() => void verify(digits.join(''))}
        disabled={!filled || busy}
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
          cursor: filled && !busy ? 'pointer' : 'not-allowed',
          opacity: filled && !busy ? 1 : 0.5,
          boxShadow: '0 16px 30px -12px rgba(181,16,31,.55)',
        }}
      >
        {busy ? 'A verificar…' : 'Verificar código'}
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
            onClick={resendOtp}
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
        <Link href="/login" style={{ fontSize: 14, fontWeight: 800, color: '#B5101F', textDecoration: 'none' }}>
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
