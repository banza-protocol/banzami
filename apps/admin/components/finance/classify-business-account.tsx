'use client';

import { useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { AdminApi, AdminApiError, type Merchant } from '@/lib/admin-api';
import { accountTypeLabel } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { BusinessAccountPicker } from './business-account-picker';

/**
 * Classify a Business Account under ADR-028.
 *
 * The class decides whether an account may take an application fee: only
 * APPLICATION and PLATFORM may. Alongside the pricing profile — which decides
 * whether there is a fee at all — it is the operator's other commercial decision
 * about an application, and it is made here, by an operator, for any Business
 * Account alike. Nothing on the developer side can set it.
 *
 * Same guards as the pricing profile, for the same reason: a class set by
 * accident does not show up in a balance, it shows up as fees reaching an
 * account that should never have received them. So the type is typed back and a
 * reason is required, and both land in the audit trail.
 */

const TYPES = ['MERCHANT', 'APPLICATION', 'PLATFORM', 'NGO', 'MARKETPLACE', 'DELIVERY', 'OTHER'] as const;

const input =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-[15px] font-semibold text-[#2a2024] outline-none transition focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';
const label = 'mb-1.5 block text-[12px] font-extrabold uppercase tracking-wide text-[#8a7a7e]';

export function ClassifyBusinessAccount() {
  const toast = useToast();
  const [api] = useState<AdminApi | null>(() => {
    const s = getSession();
    return s ? new AdminApi() : null;
  });

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantId, setMerchantId] = useState('');
  const [accountType, setAccountType] = useState('');
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api) return;
    void (async () => {
      try {
        const m = await api.listMerchants();
        setMerchants(m.data ?? []);
      } catch {
        setError('Não foi possível carregar as Business Accounts.');
      }
    })();
  }, [api]);

  const chosen = merchants.find((m) => m.id === merchantId);
  const ready = !!api && !!merchantId && !!accountType && typed.trim().toUpperCase() === accountType && reason.trim().length > 0;

  async function classify() {
    if (!api || !ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.setMerchantBusinessAccountType(merchantId, accountType, reason.trim());
      toast('success', `${chosen?.name ?? 'Business Account'} passou a ${accountTypeLabel(r.business_account_type ?? accountType)}`);
      setMerchants((ms) => ms.map((m) => (m.id === merchantId ? { ...m, business_account_type: accountType } : m)));
      setTyped('');
      setReason('');
    } catch (e) {
      // The server's refusal names what is wrong — an unknown class, a missing
      // account. A generic failure would leave someone retrying the impossible.
      setError(e instanceof AdminApiError ? e.message : 'Não foi possível classificar a conta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5">
      <CardHeader title="Classificar uma Business Account (ADR-028)" />
      <div className="p-5">
        <p className="mb-5 text-[13.5px] font-semibold leading-relaxed text-[#7a6a6e]">
          Só uma conta <strong>Aplicação</strong> ou <strong>Plataforma</strong> pode receber uma taxa de
          aplicação. O perfil de preço decide se há taxa; esta classificação decide se a conta a pode receber.
          Uma conta comum fica como Comerciante — num perfil de taxa zero liquida sem classificação.
        </p>

        <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
          <BusinessAccountPicker merchants={merchants} value={merchantId} onChange={setMerchantId} showClass />
          <div>
            <span className={label}>Classe</span>
            <select
              className={input}
              value={accountType}
              onChange={(e) => { setAccountType(e.target.value); setTyped(''); }}
            >
              <option value="">Selecione…</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t} — {accountTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {accountType ? (
          <div className="mt-4 grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
            <div>
              <span className={label}>Confirme escrevendo <code className="font-mono">{accountType}</code></span>
              <input className={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={accountType} />
            </div>
            <div>
              <span className={label}>Motivo</span>
              <input
                className={input}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="porque é que esta conta muda de classe"
              />
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-[13px] font-extrabold text-[#B5101F]">{error}</p> : null}

        <button
          onClick={() => void classify()}
          disabled={!ready || busy}
          className="mt-5 rounded-[12px] bg-[#B5101F] px-5 py-2.5 text-[14px] font-extrabold text-white transition disabled:opacity-40"
        >
          {busy ? 'A classificar…' : 'Classificar conta'}
        </button>
      </div>
    </Card>
  );
}
