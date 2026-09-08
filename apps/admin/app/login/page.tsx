'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { saveSession } from '@/lib/session';
import { adminLoginStep1, adminMfaEnrol, adminMfaConfirm, adminMfaAcknowledge, adminMfaVerify, AdminApiError } from '@/lib/admin-api';
import { BanzamiLogo } from '@/components/ui/brand';

const inputCls =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-[14px] text-[15px] font-semibold text-[#2a2024] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // The second step. A correct password lands here, never on the dashboard:
  // `challenge` holds the short-lived token that is NOT a session, and `enrol`
  // says whether this operator still has to set a factor up.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [enrol, setEnrol] = useState(false);
  const [secret, setSecret] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [ackToken, setAckToken] = useState<string | null>(null);
  const [acked, setAcked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  // A TOTP seed is a credential. Printing it as text is how it ends up in a
  // screenshot, a screen recording or a support thread — this one did. The QR
  // is the normal path: the camera reads it, the eye does not. The text stays
  // available behind a deliberate click, for a device with no camera.
  useEffect(() => {
    if (!secret) { setQr(null); return; }
    let live = true;
    // Imported here, not at module scope. This is a client component, so Next
    // still evaluates its imports during SSR — and the standalone server build
    // does not trace a dependency only the browser uses. A top-level import
    // made the login page 500 on the server: the container started, reported
    // "Ready", and failed its health check on the first request.
    import('qrcode')
      .then((m) => m.default.toString(secret.otpauth_uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 190 }))
      .then((svg) => { if (live) setQr(svg); })
      .catch(() => { if (live) setQr(null); });   // no QR: the manual key still works
    return () => { live = false; };
  }, [secret]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email ou palavra-passe inválidos.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await adminLoginStep1(email.trim(), password);
      if (r.kind === 'session') {
        saveSession({ token: r.token, user: r.user });
        router.replace('/');
        return;
      }
      // Password proven, session withheld. Nothing is saved here — the
      // challenge token cannot open a single operator route.
      setChallenge(r.challenge_token);
      setEnrol(!r.enrolled);
      if (!r.enrolled) setSecret(await adminMfaEnrol(r.challenge_token));
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 429) {
        setError('Muitas tentativas. Tente novamente mais tarde.');
      } else {
        // Always generic — never reveal whether the email exists.
        setError('Email ou palavra-passe inválidos.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge || !code.trim()) return;
    setLoading(true);
    setError('');
    try {
      if (enrol) {
        const r = await adminMfaConfirm(challenge, code.trim());
        // No session yet. The codes are on screen exactly once, and the session
        // is what the acknowledgement buys.
        setRecovery(r.recovery_codes);
        setAckToken(r.acknowledge_token);
      } else {
        const r = await adminMfaVerify(challenge, code.trim());
        saveSession({ token: r.token, user: r.user });
        router.replace('/');
      }
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 403) {
        setError('Esta sessão de verificação expirou. Volte a entrar.');
        setChallenge(null);
      } else {
        setError('Esse código não confere.');
      }
    } finally {
      setLoading(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: 'radial-gradient(1200px 600px at 50% -10%, #fff, #FFF7F6 60%)' }}
    >
      <div className="w-full max-w-[430px] rounded-[26px] border border-[#f1e3e3] bg-white px-[34px] py-[38px] shadow-[0_40px_90px_-50px_rgba(181,16,31,0.45)]">
        <div className="mb-[26px] flex items-center gap-[11px]">
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] bg-[#B5101F] shadow-[0_6px_14px_-4px_rgba(181,16,31,0.5)]">
            <BanzamiLogo size={21} />
          </span>
          <span className="text-[13px] font-black tracking-[0.16em] text-[#B5101F]">BANZADMIN</span>
        </div>
        {children}
      </div>
    </div>
  );

  // Recovery codes, once. Shown before the dashboard and behind an explicit
  // acknowledgement, because this is the only time they exist in readable form.
  async function finish() {
    if (!ackToken || !acked) return;
    setLoading(true);
    try {
      const r = await adminMfaAcknowledge(ackToken);
      saveSession({ token: r.token, user: r.user });
      router.replace('/');
    } catch {
      setError('A confirmação expirou. Volte a entrar — o seu segundo factor já está configurado.');
      setRecovery(null);
      setChallenge(null);
    } finally {
      setLoading(false);
    }
  }

  function downloadCodes() {
    if (!recovery) return;
    // Built and downloaded in the browser. Nothing is written server-side: a
    // plaintext copy of these on a disk somewhere is the thing being avoided.
    const body = [
      'BANZADMIN — Códigos de recuperação',
      `Conta: ${email.trim()}`,
      `Gerados: ${new Date().toISOString()}`,
      '',
      'Cada código serve uma única vez. Guarde este ficheiro em local seguro.',
      '',
      ...recovery,
      '',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'banzadmin-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (recovery) {
    return shell(
      <>
        <h1 className="m-0 text-[24px] font-black tracking-[-0.02em]">Guarde os códigos de recuperação</h1>
        <p className="m-0 mb-5 mt-2 text-[14px] font-semibold leading-relaxed text-[#9a8a8e]">
          Cada código serve <strong>uma vez</strong>, e é o que lhe devolve o acesso se perder o
          autenticador. São mostrados agora e nunca mais.
        </p>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-[14px] bg-[#2A1E20] p-4 font-mono text-[13px] text-[#EDE3E1]">
          {recovery.map((c) => <span key={c}>{c}</span>)}
        </div>

        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(recovery.join('\n')).then(() => setCopied(true)).catch(() => {}); }}
            aria-label="Copiar os códigos de recuperação"
            className="flex-1 rounded-[12px] border-[1.5px] border-[#f1e3e3] bg-white py-[11px] text-[13.5px] font-extrabold text-[#5a4a4e]"
          >
            {copied ? 'Copiados' : 'Copiar códigos'}
          </button>
          <button
            type="button"
            onClick={downloadCodes}
            aria-label="Descarregar os códigos de recuperação"
            className="flex-1 rounded-[12px] border-[1.5px] border-[#f1e3e3] bg-white py-[11px] text-[13.5px] font-extrabold text-[#5a4a4e]"
          >
            Guardar ficheiro
          </button>
        </div>

        <label className="mb-4 flex cursor-pointer items-start gap-2.5 text-[13.5px] font-bold text-[#5a4a4e]">
          <input
            type="checkbox"
            checked={acked}
            onChange={(e) => setAcked(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          Guardei os códigos de recuperação num local seguro.
        </label>

        {error ? (
          <p role="alert" className="mb-3 text-[13px] font-bold text-[#B5101F]">{error}</p>
        ) : null}

        <button
          onClick={() => void finish()}
          disabled={!acked || loading}
          className="w-full rounded-[14px] bg-[#B5101F] py-[13px] text-[15px] font-extrabold text-white disabled:opacity-40"
        >
          {loading ? 'A concluir…' : 'Concluir e entrar'}
        </button>
      </>,
    );
  }

  if (challenge) {
    return shell(
      <>
        <h1 className="m-0 text-[24px] font-black tracking-[-0.02em]">
          {enrol ? 'Configure a verificação em dois passos' : 'Verificação em dois passos'}
        </h1>
        <p className="m-0 mb-5 mt-2 text-[14px] font-semibold leading-relaxed text-[#9a8a8e]">
          {enrol
            ? 'A sua palavra-passe está correcta. Um operador privilegiado precisa de um segundo factor antes de ter sessão.'
            : 'Introduza o código do seu autenticador, ou um código de recuperação.'}
        </p>

        {enrol && secret ? (
          <div className="mb-5 rounded-[14px] border border-[#f1e3e3] bg-[#FFF7F6] p-4 text-center">
            <p className="m-0 mb-3 text-[12px] font-extrabold uppercase tracking-wide text-[#8a7a7e]">
              Leia este código com o seu autenticador
            </p>
            {qr ? (
              <div
                className="mx-auto mb-3 inline-block rounded-[10px] bg-white p-2"
                aria-label="Código QR de configuração"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            ) : (
              <p className="m-0 mb-3 text-[13px] font-semibold text-[#9a8a8e]">
                Não foi possível desenhar o código — use a chave manual abaixo.
              </p>
            )}
            <p className="m-0 text-[12px] font-semibold text-[#9a8a8e]">
              Depois introduza o código de 6 dígitos que a app mostrar.
            </p>
            {showSecret ? (
              <code className="mt-3 block break-all font-mono text-[13px] font-bold text-[#2a2024]">
                {secret.secret}
              </code>
            ) : (
              <button
                type="button"
                onClick={() => setShowSecret(true)}
                className="mt-3 text-[12px] font-extrabold text-[#B5101F] underline"
              >
                Introduzir a chave manualmente
              </button>
            )}
          </div>
        ) : null}

        <form onSubmit={submitCode}>
          <label htmlFor="mfa-code" className="mb-1.5 block text-[12px] font-extrabold uppercase tracking-wide text-[#8a7a7e]">
            Código
          </label>
          <input
            id="mfa-code"
            value={code}
            onChange={(e) => { setCode(e.target.value); if (error) setError(''); }}
            autoComplete="one-time-code"
            inputMode="text"
            placeholder="000000"
            className={inputCls}
            autoFocus
          />
          {error ? (
            <p role="alert" className="mt-3 flex items-center gap-2 text-[13px] font-bold text-[#B5101F]">
              <AlertCircle size={15} /> {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="mt-5 w-full rounded-[14px] bg-[#B5101F] py-[13px] text-[15px] font-extrabold text-white disabled:opacity-50"
          >
            {loading ? 'A verificar…' : enrol ? 'Confirmar e entrar' : 'Entrar'}
          </button>
        </form>
      </>,
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: 'radial-gradient(1200px 600px at 50% -10%, #fff, #FFF7F6 60%)' }}
    >
      <div className="w-full max-w-[430px] rounded-[26px] border border-[#f1e3e3] bg-white px-[34px] py-[38px] shadow-[0_40px_90px_-50px_rgba(181,16,31,0.45)]">
        <div className="mb-[26px] flex items-center gap-[11px]">
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] bg-[#B5101F] shadow-[0_6px_14px_-4px_rgba(181,16,31,0.5)]">
            <BanzamiLogo size={21} />
          </span>
          <span className="text-[13px] font-black tracking-[0.16em] text-[#B5101F]">BANZADMIN</span>
        </div>
        <h1 className="m-0 text-[27px] font-black tracking-[-0.02em]">Painel de Operações</h1>
        <p className="m-0 mb-[26px] mt-2 text-[15px] font-semibold text-[#9a8a8e]">
          Acesso reservado aos operadores autorizados.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="mb-2 block text-[13px] font-extrabold">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            placeholder="operador@banzami.com"
            className={`${inputCls} mb-[18px]`}
            required
          />

          <label className="mb-2 block text-[13px] font-extrabold">Palavra-passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••••••••••"
            className={inputCls}
            style={error ? { borderColor: '#f0a9a9' } : undefined}
            required
          />

          {error && (
            <div className="mt-[14px] flex items-center gap-[9px] rounded-[12px] border border-[#f6d3d1] bg-[#FFF1F0] px-[14px] py-3 text-[13.5px] font-bold text-[#B5101F]">
              <AlertCircle size={16} strokeWidth={1.8} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-[14px] bg-[#1a1416] py-4 text-[15.5px] font-extrabold text-white transition-[background,transform] duration-150 hover:-translate-y-px hover:bg-black disabled:opacity-60"
          >
            {loading ? 'A entrar…' : 'Entrar'}
          </button>
        </form>
        <p className="m-0 mt-[18px] text-center text-[12.5px] font-semibold text-[#b09498]">
          Todas as acções são auditadas.
        </p>
      </div>
    </div>
  );
}
