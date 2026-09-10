'use client';

import { useState } from 'react';
import type { AdminApi } from '@/lib/admin-api';
import { withAt } from '@/lib/format';

const input =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-[15px] font-semibold text-[#2a2024] outline-none transition focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';
const label = 'mb-1.5 block text-[12px] font-extrabold uppercase tracking-wide text-[#8a7a7e]';

/**
 * A Business that forgot its app PIN gets a fresh activation link (audited).
 * The current PIN keeps working until the link is used; using it signs out
 * every device signed in with the old one. The link is emailed to the
 * Business; admin-api shows it here too only while the platform is SANDBOX.
 */
export function AppPinReset({ api, merchantId, handle }: { api: AdminApi; merchantId: string; handle: string }) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ email: string; link?: string; expires?: string } | null>(null);

  const ready = typed.trim().replace(/^@/, '').toLowerCase() === handle.toLowerCase() && reason.trim().length > 0;

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const r = await api.resetBusinessAppPin(merchantId, typed.trim(), reason.trim());
      setDone({ email: r.email_sent_to, link: r.activation_url, expires: r.expires_at });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Não foi possível preparar o novo PIN.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-[18px] border border-[#f1e3e3] bg-white p-6" data-testid="app-pin-reset">
      <h3 className="m-0 mb-2 text-[15px] font-black">PIN da app Business</h3>
      <p className="m-0 mb-4 text-[13.5px] font-semibold leading-relaxed text-[#7a6a6e]">
        Se o negócio esqueceu o PIN, envie-lhe um link para escolher um novo. O PIN atual continua a funcionar até o
        link ser usado; depois, todos os dispositivos terão de entrar com o novo PIN.
      </p>
      {done ? (
        <div role="status" className="rounded-[14px] bg-[#EEF7EF] p-4 text-[13.5px] font-bold text-[#1E6B34]">
          Link enviado{done.email ? ` para ${done.email}` : ''}.
          {done.link ? (
            <div className="mt-2 break-all font-mono text-[12.5px] text-[#2a2024]" data-testid="app-pin-reset-link">
              {done.link}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
            <div>
              <label htmlFor="pin-reset-confirm" className={label}>
                Confirme escrevendo <code className="font-mono">{withAt(handle)}</code>
              </label>
              <input id="pin-reset-confirm" className={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={withAt(handle)} />
            </div>
            <div>
              <label htmlFor="pin-reset-reason" className={label}>Motivo</label>
              <input id="pin-reset-reason" className={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="porque é que este negócio precisa de um novo PIN" />
            </div>
          </div>
          {error ? <p role="alert" className="mt-3 text-[13px] font-extrabold text-[#B5101F]">{error}</p> : null}
          <button
            onClick={() => void submit()}
            disabled={!ready || busy}
            className="mt-4 rounded-[12px] bg-[#B5101F] px-5 py-2.5 text-[14px] font-extrabold text-white transition disabled:opacity-40"
          >
            {busy ? 'A preparar…' : 'Enviar link para novo PIN'}
          </button>
        </>
      )}
    </div>
  );
}
