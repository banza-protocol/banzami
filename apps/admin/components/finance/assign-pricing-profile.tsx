'use client';

import { useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { AdminApi, AdminApiError, type CatalogEntry, type Merchant } from '@/lib/admin-api';
import { Card, CardHeader } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

/**
 * Put a Business Account on a pricing profile.
 *
 * The operator console could set a Business Account's verified flag and its
 * account type, and could edit the pricing catalogue — but could not say which
 * profile a given customer is on. That single value is the whole answer to what
 * the customer pays: the model resolves exactly one rule from (assigned profile,
 * operation), and an account with no profile resolves nothing at all. The core
 * route existed the whole time; nothing operator-facing reached it, so pricing a
 * customer meant calling an internal service route by hand.
 *
 * Deliberately not one click. A wrong rate does not show up in a balance — it
 * shows up when an invoice is wrong, possibly months later — so the profile code
 * is typed back and a reason is required, and both land in the audit trail.
 */

const input =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-[15px] font-semibold text-[#2a2024] outline-none transition focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';
const label = 'mb-1.5 block text-[12px] font-extrabold uppercase tracking-wide text-[#8a7a7e]';

export function AssignPricingProfile() {
  const toast = useToast();
  const [api] = useState<AdminApi | null>(() => {
    const s = getSession();
    return s ? new AdminApi(s.token) : null;
  });

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [profiles, setProfiles] = useState<CatalogEntry[]>([]);
  const [merchantId, setMerchantId] = useState('');
  const [profileCode, setProfileCode] = useState('');
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api) return;
    void (async () => {
      try {
        const [m, p] = await Promise.all([api.listMerchants(), api.listPricingProfiles({ status: 'enabled' })]);
        setMerchants(m.data ?? []);
        setProfiles(p.data ?? []);
      } catch {
        setError('Não foi possível carregar as Business Accounts ou os perfis.');
      }
    })();
  }, [api]);

  const chosen = merchants.find((m) => m.id === merchantId);
  const ready = !!api && !!merchantId && !!profileCode && typed.trim() === profileCode && reason.trim().length > 0;

  async function assign() {
    if (!api || !ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.assignMerchantPricingProfile(merchantId, profileCode, reason.trim());
      toast('success', `${chosen?.name ?? 'Business Account'} passou para ${r.profile_code}`);
      setTyped('');
      setReason('');
    } catch (e) {
      // The server's refusal is the answer — it names a disabled profile, a LIVE
      // profile, or an account that does not exist. Replacing it with a generic
      // failure would leave someone retrying something that can never work.
      setError(e instanceof AdminApiError ? e.message : 'Não foi possível atribuir o perfil.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5">
      <CardHeader title="Atribuir um perfil a uma Business Account" />
      <div className="p-5">
        <p className="mb-5 text-[13.5px] font-semibold leading-relaxed text-[#7a6a6e]">
          O perfil atribuído é o que decide quanto a conta paga: o modelo resolve exactamente uma
          regra a partir de (perfil, operação), e uma conta sem perfil não resolve nenhuma.
          Liquidação e payout são as únicas operações com preço.
        </p>

        <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
          <div>
            <span className={label}>Business Account</span>
            <select className={input} value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
              <option value="">Selecione…</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.id.slice(0, 8)}…
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={label}>Perfil</span>
            <select
              className={input}
              value={profileCode}
              onChange={(e) => { setProfileCode(e.target.value); setTyped(''); }}
            >
              <option value="">Selecione…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {profileCode ? (
          <div className="mt-4 grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
            <div>
              <span className={label}>Confirme escrevendo <code className="font-mono">{profileCode}</code></span>
              <input className={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={profileCode} />
            </div>
            <div>
              <span className={label}>Motivo</span>
              <input
                className={input}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="porque é que esta conta muda de plano"
              />
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-[13px] font-extrabold text-[#B5101F]">{error}</p> : null}

        <button
          onClick={() => void assign()}
          disabled={!ready || busy}
          className="mt-5 rounded-[12px] bg-[#B5101F] px-5 py-2.5 text-[14px] font-extrabold text-white transition disabled:opacity-40"
        >
          {busy ? 'A atribuir…' : 'Atribuir perfil'}
        </button>
      </div>
    </Card>
  );
}
