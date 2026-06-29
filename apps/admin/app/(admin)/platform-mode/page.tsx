'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type PlatformMode } from '@/lib/admin-api';
import { Card, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

const CONFIRM: Record<'SANDBOX' | 'LIVE', string> = {
  SANDBOX: 'CONFIRMO ATIVAR SANDBOX',
  LIVE: 'CONFIRMO ATIVAR LIVE',
};

export default function PlatformModePage() {
  const toast = useToast();
  const [mode, setMode] = useState<PlatformMode | null>(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<'SANDBOX' | 'LIVE' | null>(null);

  const isSuperAdmin = getSession()?.user.role === 'SUPER_ADMIN';

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setError('');
    try {
      setMode(await api.getPlatformMode());
    } catch {
      setError('Não foi possível carregar o modo da plataforma.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sandbox = mode?.mode === 'SANDBOX';

  return (
    <div className="p-[26px]">
      <div className="mb-[22px] border-b border-[#f1e3e3]">
        <h1 className="pb-[14px] text-[26px] font-extrabold text-[#1a1a1a]">Modo da plataforma</h1>
      </div>
      <p className="mb-5 max-w-[640px] text-[14px] text-[#9a8a8e]">
        Fonte central de verdade do modo da plataforma (SANDBOX/LIVE), lida pelo website público, pelo BANZADMIN e pelos fluxos de candidatura. Apenas um SUPER_ADMIN pode alterar.
      </p>

      {error ? (
        <ErrorState message={error} />
      ) : !mode ? (
        <div className="text-[15px] text-[#9a8a8e]">A carregar…</div>
      ) : (
        <Card className="max-w-[680px] p-6">
          <div className={`mb-5 flex items-start gap-3 rounded-[14px] border-[1.5px] px-5 py-4 ${sandbox ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}>
            <span className={`mt-0.5 flex h-[28px] w-[28px] flex-none items-center justify-center rounded-full ${sandbox ? 'bg-amber-500' : 'bg-green-600'} text-white`}>
              {sandbox ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
            </span>
            <div>
              <div className="text-[16px] font-black text-[#1a1a1a]">
                {sandbox ? 'A plataforma está em SANDBOX' : 'A plataforma está em LIVE'}
              </div>
              <p className={`m-0 mt-1 text-[13.5px] font-semibold ${sandbox ? 'text-amber-800' : 'text-green-800'}`}>
                {sandbox
                  ? 'Ambiente de testes — os dados públicos não representam produção real. O banner SANDBOX aparece no website.'
                  : 'Produção real — o website não mostra banner de testes. Toda a atividade é tratada como real.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[#f1e3e3] pt-4">
            <Field label="Modo atual" value={mode.mode} />
            <Field label="Última alteração" value={mode.updated_at ? formatDate(mode.updated_at) : '—'} />
            <Field label="Alterado por" value={mode.updated_by} />
            <Field label="Razão" value={mode.reason} />
          </div>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-[#f1e3e3] pt-5">
            {!isSuperAdmin ? (
              <p className="m-0 text-[13px] font-semibold text-[#9a8a8e]">Apenas um SUPER_ADMIN pode alterar o modo da plataforma.</p>
            ) : (
              <>
                <button
                  disabled={sandbox}
                  onClick={() => setTarget('SANDBOX')}
                  className="rounded-[12px] bg-amber-500 px-5 py-2.5 text-[14px] font-extrabold text-white hover:bg-amber-600 disabled:opacity-40"
                >
                  Ativar SANDBOX
                </button>
                <button
                  disabled={!sandbox}
                  onClick={() => setTarget('LIVE')}
                  className="rounded-[12px] bg-green-600 px-5 py-2.5 text-[14px] font-extrabold text-white hover:bg-green-700 disabled:opacity-40"
                >
                  Ativar LIVE
                </button>
              </>
            )}
          </div>
        </Card>
      )}

      {target && (
        <ChangeModal
          target={target}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); void load(); toast('success', `Plataforma agora em ${target}.`); }}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-[#9a8a8e]">{label}</span>
      <span className="text-[14px] font-extrabold text-[#2a2024]">{value || '—'}</span>
    </div>
  );
}

function ChangeModal({ target, onClose, onDone }: { target: 'SANDBOX' | 'LIVE'; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const live = target === 'LIVE';
  const phrase = CONFIRM[target];
  const ready = confirmText.trim() === phrase && reason.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const api = getApi();
    if (!api) return;
    setBusy(true);
    try {
      await api.setPlatformMode(target, confirmText.trim(), reason.trim());
      onDone();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      toast('danger', code === 'CONFIRMATION_MISMATCH' ? 'Texto de confirmação incorreto.' : code === 'FORBIDDEN' ? 'Apenas SUPER_ADMIN pode alterar.' : 'Não foi possível alterar o modo.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-[480px] rounded-[20px] border border-[#f1e3e3] bg-white p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]" onClick={(e) => e.stopPropagation()}>
        <h2 className="m-0 text-[18px] font-black">Ativar {target}</h2>
        <div className={`mt-3 rounded-[12px] border-[1.5px] px-4 py-3 text-[13px] font-semibold ${live ? 'border-green-300 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
          {live ? (
            <>
              Esta ação coloca oficialmente a plataforma em produção. Consequências:
              <ul className="mt-1.5 list-disc pl-5">
                <li>desaparecem todos os banners SANDBOX (website e portais);</li>
                <li>o website passa a comportamento de produção;</li>
                <li>novos utilizadores e comerciantes passam a ser considerados reais;</li>
                <li>operações futuras serão consideradas produção.</li>
              </ul>
            </>
          ) : (
            'Vai colocar a plataforma em SANDBOX. O website e os portais mostram o aviso de ambiente de testes e as operações públicas são tratadas como teste.'
          )}
        </div>
        <form onSubmit={submit}>
          <label className="mb-1.5 mt-4 block text-[13px] font-extrabold">Razão (obrigatória)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex.: lançamento oficial" className="w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-[15px] font-semibold outline-none focus:border-[#B5101F]" />
          <label className="mb-1.5 mt-4 block text-[13px] font-extrabold">Escreva para confirmar: <span className="font-mono text-[#B5101F]">{phrase}</span></label>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={phrase} className="w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 font-mono text-[14px] font-semibold outline-none focus:border-[#B5101F]" />
          <div className="mt-6 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="rounded-[12px] border-[1.5px] border-[#f1e3e3] bg-white px-5 py-2.5 text-[14px] font-extrabold text-[#5a4a4e]">Cancelar</button>
            <button type="submit" disabled={!ready || busy} className={`rounded-[12px] px-5 py-2.5 text-[14px] font-extrabold text-white disabled:opacity-40 ${live ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'}`}>Confirmar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
