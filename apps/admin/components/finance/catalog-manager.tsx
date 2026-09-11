'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Power, Pencil, X } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, AdminApiError, type CatalogEntry, type CatalogInput, type CatalogFilters } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useDialog } from '@/components/ui/dialog';
import { formatDate } from '@/lib/format';
import { actionErrorPt } from '@/lib/errors';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

const selClass = 'rounded-[11px] border border-[#f1e3e3] bg-white px-[12px] py-[8px] text-[13px] font-semibold text-[#3a2e32] outline-none focus:border-[#B5101F]';
const inputClass = 'w-full rounded-[10px] border border-[#f1e3e3] bg-white px-[11px] py-[8px] text-[13px] outline-none focus:border-[#B5101F]';
const labelClass = 'mb-[4px] block text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-[#9a8a8e]';

export interface CatalogManagerProps {
  /** Selects which catalog API to use. */
  kind: 'profiles' | 'policies';
  title: string;
  intro: string;
  /** "ex.: STANDARD" / "ex.: pol_donation_standard" */
  codePlaceholder: string;
  /** Fee policies expose a metadata note; profiles do not. */
  withMetadata?: boolean;
}

type Mode = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; entry: CatalogEntry };

function emptyForm(): CatalogInput {
  return { code: '', name: '', description: '', environment: 'LIVE', metadata: {} };
}

export function CatalogManager({ kind, title, intro, codePlaceholder, withMetadata }: CatalogManagerProps) {
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [filters, setFilters] = useState<CatalogFilters>({ environment: 'LIVE' });
  const [mode, setMode] = useState<Mode>({ kind: 'none' });
  const [form, setForm] = useState<CatalogInput>(emptyForm());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const api = getApi();
  const list = kind === 'profiles' ? api?.listPricingProfiles.bind(api) : api?.listFeePolicies.bind(api);
  const create = kind === 'profiles' ? api?.createPricingProfile.bind(api) : api?.createFeePolicy.bind(api);
  const update = kind === 'profiles' ? api?.updatePricingProfile.bind(api) : api?.updateFeePolicy.bind(api);
  const setEnabled = kind === 'profiles' ? api?.setPricingProfileEnabled.bind(api) : api?.setFeePolicyEnabled.bind(api);

  const load = useCallback(async (f: CatalogFilters) => {
    if (!list) return;
    setLoading(true);
    setError('');
    try {
      setRows((await list(f)).data);
    } catch {
      setError('Não foi possível carregar o catálogo.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => { void load(filters); }, [load, filters]);

  function set<K extends keyof CatalogFilters>(k: K, v: string) {
    setFilters({ ...filters, [k]: v || undefined });
  }

  function openCreate() {
    setForm(emptyForm());
    setNote('');
    setMode({ kind: 'create' });
  }
  function openEdit(e: CatalogEntry) {
    setForm({ code: e.code, name: e.name, description: e.description ?? '', environment: e.environment, metadata: e.metadata });
    setNote(typeof e.metadata?.note === 'string' ? e.metadata.note : '');
    setMode({ kind: 'edit', entry: e });
  }

  async function save() {
    if (!create || !update) return;
    if (!form.code.trim() || !form.name.trim()) { toast('danger', 'Código e nome são obrigatórios.'); return; }
    const body: CatalogInput = { ...form, description: form.description || null };
    if (withMetadata) body.metadata = note ? { ...form.metadata, note } : { ...form.metadata };
    setSaving(true);
    try {
      if (mode.kind === 'edit') { await update(mode.entry.id, body); toast('success', 'Atualizado.'); }
      else { await create(body); toast('success', 'Criado.'); }
      setMode({ kind: 'none' });
      await load(filters);
    } catch (e) {
      toast('danger', e instanceof AdminApiError && e.status === 409
        ? 'Não foi possível guardar. Já existe uma entrada com este código neste ambiente.'
        : actionErrorPt(e, 'Não foi possível guardar.'));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(e: CatalogEntry) {
    if (!setEnabled) return;
    const off = e.enabled;
    const ok = await dialog.confirm({
      title: off ? 'Desativar' : 'Ativar',
      message: off ? `Desativar “${e.code}”? Deixa de aparecer para seleção em novas regras.` : `Ativar “${e.code}”?`,
      confirmLabel: off ? 'Desativar' : 'Ativar',
      danger: off,
    });
    if (!ok) return;
    setBusy(e.id);
    try {
      await setEnabled(e.id, !off);
      toast('success', off ? 'Desativado.' : 'Ativado.');
      await load(filters);
    } catch (e) {
      toast('danger', actionErrorPt(e, 'Não foi possível alterar o estado.'));
    } finally {
      setBusy(null);
    }
  }

  const open = mode.kind !== 'none';

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-[18px] bg-[#1a1416] px-[26px] py-[22px] text-white">
        <h1 className="text-[23px] font-black tracking-[-0.02em]">{title}</h1>
        <p className="mt-1 max-w-[760px] text-[13.5px] text-white/70">{intro}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select className={selClass} value={filters.environment ?? ''} onChange={(e) => set('environment', e.target.value)}>
          <option value="">Todos os ambientes</option>
          <option value="LIVE">LIVE</option>
          <option value="SANDBOX">SANDBOX</option>
        </select>
        <select className={selClass} value={filters.status ?? ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">Todos os estados</option>
          <option value="enabled">Ativos</option>
          <option value="disabled">Inativos</option>
        </select>
        <input className={selClass} placeholder="Procurar código" value={filters.code ?? ''} onChange={(e) => set('code', e.target.value)} />
      </div>

      <div className={`grid gap-5 ${open ? 'grid-cols-1 xl:grid-cols-[1fr_minmax(360px,420px)]' : 'grid-cols-1'}`}>
        <Card>
          <CardHeader
            title={title}
            action={
              <button onClick={openCreate} className="flex items-center gap-2 rounded-[11px] bg-[#B5101F] px-[14px] py-[9px] text-[13px] font-extrabold text-white hover:bg-[#9a0d1a]">
                <Plus size={16} strokeWidth={2.6} /> Novo
              </button>
            }
          />
          {loading ? (
            <div className="adm-skel m-6 h-[200px] rounded-[14px]" />
          ) : error ? (
            <ErrorState message={error} />
          ) : rows.length === 0 ? (
            <EmptyMsg title="Sem entradas" hint="Crie a primeira entrada deste catálogo." />
          ) : (
            <TableWrap>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#FFF7F6]">
                    <Th>Código</Th>
                    <Th>Nome</Th>
                    <Th>Estado</Th>
                    <Th right>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="adm-row transition-colors hover:bg-[#FFF7F6]">
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold">{r.code}</span>
                          <Badge label={r.environment} variant={r.environment === 'LIVE' ? 'maroon' : 'info'} />
                        </div>
                      </Td>
                      <Td>{r.name}</Td>
                      <Td><Badge label={r.enabled ? 'ATIVO' : 'INATIVO'} variant={r.enabled ? 'success' : 'neutral'} /></Td>
                      <Td right>
                        <div className="flex justify-end gap-1">
                          <button title="Editar" onClick={() => openEdit(r)} className="flex h-[32px] w-[32px] items-center justify-center rounded-[9px] border border-[#f1e3e3] text-[#5a4a4e] hover:bg-[#FFF7F6]"><Pencil size={15} strokeWidth={2.2} /></button>
                          <button title={r.enabled ? 'Desativar' : 'Ativar'} disabled={busy === r.id} onClick={() => toggle(r)} className={`flex h-[32px] w-[32px] items-center justify-center rounded-[9px] border border-[#f1e3e3] disabled:opacity-40 ${r.enabled ? 'text-[#B5101F] hover:bg-[#FFF1F0]' : 'text-[#5a4a4e] hover:bg-[#FFF7F6]'}`}><Power size={15} strokeWidth={2.2} /></button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        {open && (
          <Card>
            <CardHeader
              title={mode.kind === 'edit' ? `Editar ${mode.entry.code}` : 'Nova entrada'}
              action={<button title="Fechar" onClick={() => setMode({ kind: 'none' })} className="flex h-[32px] w-[32px] items-center justify-center rounded-[9px] border border-[#f1e3e3] text-[#5a4a4e] hover:bg-[#FFF7F6]"><X size={15} strokeWidth={2.2} /></button>}
            />
            <div className="flex flex-col gap-[14px] p-[22px]">
              <div>
                <span className={labelClass}>Código</span>
                <input className={inputClass} value={form.code} disabled={mode.kind === 'edit'} placeholder={codePlaceholder} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div>
                <span className={labelClass}>Ambiente</span>
                <select className={inputClass} value={form.environment} disabled={mode.kind === 'edit'} onChange={(e) => setForm({ ...form, environment: e.target.value as CatalogInput['environment'] })}>
                  <option value="LIVE">LIVE</option>
                  <option value="SANDBOX">SANDBOX</option>
                </select>
              </div>
              <div>
                <span className={labelClass}>Nome</span>
                <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <span className={labelClass}>Descrição</span>
                <input className={inputClass} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              {withMetadata && (
                <div>
                  <span className={labelClass}>Nota interna (sem percentagens)</span>
                  <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setMode({ kind: 'none' })} className="rounded-[11px] border border-[#f1e3e3] px-[15px] py-[9px] text-[13px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6]">Cancelar</button>
                <button onClick={save} disabled={saving} className="rounded-[11px] bg-[#B5101F] px-[16px] py-[9px] text-[13px] font-extrabold text-white hover:bg-[#9a0d1a] disabled:opacity-60">
                  {saving ? 'A guardar…' : mode.kind === 'edit' ? 'Guardar' : 'Criar'}
                </button>
              </div>
              <p className="text-[11.5px] leading-[1.5] text-[#9a8a8e]">
                Este catálogo é apenas de referência — não contém percentagens. Os valores de taxa vivem somente nas Regras de preço.
              </p>
              {mode.kind === 'edit' && <p className="text-[11px] text-[#b3a3a7]">Criado {formatDate(mode.entry.created_at)}</p>}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
