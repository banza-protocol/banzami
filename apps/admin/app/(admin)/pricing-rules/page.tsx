'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Copy, Power, Pencil, History, X } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type PricingRule, type PricingRuleInput, type PricingRuleFilters } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useDialog } from '@/components/ui/dialog';
import { formatKz, formatDate } from '@/lib/format';

const CATEGORIES = [
  'DONATION', 'CROWDFUNDING', 'MARKETPLACE', 'ECOMMERCE', 'DELIVERY', 'FOOD_DELIVERY',
  'RIDE_HAILING', 'SUBSCRIPTION', 'TICKETING', 'DIGITAL_GOODS', 'PHYSICAL_GOODS',
  'P2P', 'BILL_PAYMENT', 'NGO', 'GOVERNMENT',
];
const PROFILES = ['STANDARD', 'BUSINESS', 'ENTERPRISE', 'PARTNER', 'NGO', 'GOVERNMENT', 'CUSTOM'];
const CURRENCIES = ['AOA', 'USD', 'EUR'];
const ROUNDINGS = ['HALF_UP', 'HALF_EVEN', 'FLOOR', 'CEIL'] as const;

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

/** bps → percentage string, e.g. 200 → "2.00%". */
function pct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function emptyForm(): PricingRuleInput {
  return {
    rule_key: '', environment: 'LIVE', business_category: '', pricing_profile: '',
    fee_policy_ref: '', currency: 'AOA', country: '', rate_bps: 0, flat_minor: 0,
    min_fee_minor: null, max_fee_minor: null, rounding: 'HALF_UP', priority: 0,
    effective_from: null, effective_to: null, description: '',
  };
}

function ruleToForm(r: PricingRule): PricingRuleInput {
  return {
    rule_key: r.rule_key, environment: r.environment, business_category: r.business_category ?? '',
    pricing_profile: r.pricing_profile ?? '', fee_policy_ref: r.fee_policy_ref ?? '',
    currency: r.currency ?? '', country: r.country ?? '', rate_bps: r.rate_bps, flat_minor: r.flat_minor,
    min_fee_minor: r.min_fee_minor, max_fee_minor: r.max_fee_minor, rounding: r.rounding,
    priority: r.priority, effective_from: null, effective_to: r.effective_to, description: r.description ?? '',
  };
}

type Mode = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; rule: PricingRule } | { kind: 'versions'; rule: PricingRule };

export default function PricingRulesPage() {
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [filters, setFilters] = useState<PricingRuleFilters>({ environment: 'LIVE' });
  const [mode, setMode] = useState<Mode>({ kind: 'none' });
  const [form, setForm] = useState<PricingRuleInput>(emptyForm());
  const [versions, setVersions] = useState<PricingRule[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (f: PricingRuleFilters) => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listPricingRules(f);
      setRows(r.data);
    } catch {
      setError('Não foi possível carregar as regras de preço.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filters); }, [load, filters]);

  function openCreate() {
    setForm(emptyForm());
    setMode({ kind: 'create' });
  }
  function openEdit(rule: PricingRule) {
    setForm(ruleToForm(rule));
    setMode({ kind: 'edit', rule });
  }
  async function openVersions(rule: PricingRule) {
    const api = getApi();
    if (!api) return;
    setMode({ kind: 'versions', rule });
    setVersions([]);
    try {
      const r = await api.getPricingRuleVersions(rule.id);
      setVersions(r.data);
    } catch {
      toast('danger', 'Não foi possível carregar as versões.');
    }
  }
  function closePanel() { setMode({ kind: 'none' }); }

  async function save() {
    const api = getApi();
    if (!api) return;
    if (!form.rule_key.trim()) { toast('danger', 'A chave da regra é obrigatória.'); return; }
    // normalize empty strings → null so "any" matchers are stored as NULL
    const body: PricingRuleInput = {
      ...form,
      business_category: form.business_category || null,
      pricing_profile: form.pricing_profile || null,
      fee_policy_ref: form.fee_policy_ref || null,
      currency: form.currency || null,
      country: form.country || null,
      description: form.description || null,
      effective_to: form.effective_to || null,
    };
    setSaving(true);
    try {
      if (mode.kind === 'edit') {
        const r = await api.updatePricingRule(mode.rule.id, body);
        toast('success', mode.rule.used
          ? `Regra usada — criada a versão ${r.version}.`
          : 'Regra atualizada.');
      } else {
        await api.createPricingRule(body);
        toast('success', 'Regra criada.');
      }
      closePanel();
      await load(filters);
    } catch (e) {
      toast('danger', e instanceof Error ? e.message : 'Falha ao guardar a regra.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(rule: PricingRule) {
    const api = getApi();
    if (!api) return;
    const turningOff = rule.enabled;
    const ok = await dialog.confirm({
      title: turningOff ? 'Desativar regra' : 'Ativar regra',
      message: turningOff
        ? `Desativar “${rule.rule_key}” (v${rule.version})? Deixa de ser aplicada, mas permanece auditável.`
        : `Ativar “${rule.rule_key}” (v${rule.version})?`,
      confirmLabel: turningOff ? 'Desativar' : 'Ativar',
      danger: turningOff,
    });
    if (!ok) return;
    setBusy(rule.id);
    try {
      if (turningOff) await api.disablePricingRule(rule.id);
      else await api.enablePricingRule(rule.id);
      toast('success', turningOff ? 'Regra desativada.' : 'Regra ativada.');
      await load(filters);
    } catch {
      toast('danger', 'Não foi possível alterar o estado da regra.');
    } finally {
      setBusy(null);
    }
  }

  async function duplicate(rule: PricingRule) {
    const api = getApi();
    if (!api) return;
    const key = await dialog.prompt({
      title: 'Duplicar regra',
      label: 'Nova chave (rule_key)',
      placeholder: `${rule.rule_key}-copy`,
      defaultValue: `${rule.rule_key}-copy`,
      required: true,
    });
    if (!key) return;
    setBusy(rule.id);
    try {
      await api.duplicatePricingRule(rule.id, key);
      toast('success', 'Regra duplicada.');
      await load(filters);
    } catch (e) {
      toast('danger', e instanceof Error ? e.message : 'Não foi possível duplicar.');
    } finally {
      setBusy(null);
    }
  }

  const panelOpen = mode.kind !== 'none';
  const editingUsed = mode.kind === 'edit' && mode.rule.used;

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-[18px] bg-[#1a1416] px-[26px] py-[22px] text-white">
        <h1 className="text-[23px] font-black tracking-[-0.02em]">Regras de preço</h1>
        <p className="mt-1 max-w-[760px] text-[13.5px] text-white/70">
          A taxa do operador é calculada exclusivamente a partir destas regras. As aplicações
          enviam apenas referências — nunca percentagens. Uma regra já usada nunca é editada:
          ao guardar, é criada uma nova versão.
        </p>
      </header>

      <Filters value={filters} onChange={setFilters} />

      <div className={`grid gap-5 ${panelOpen ? 'grid-cols-1 xl:grid-cols-[1fr_minmax(380px,440px)]' : 'grid-cols-1'}`}>
        <Card>
          <CardHeader
            title="Regras"
            action={
              <button
                onClick={openCreate}
                className="flex items-center gap-2 rounded-[11px] bg-[#B5101F] px-[14px] py-[9px] text-[13px] font-extrabold text-white transition-colors hover:bg-[#9a0d1a]"
              >
                <Plus size={16} strokeWidth={2.6} /> Nova regra
              </button>
            }
          />
          {loading ? (
            <div className="adm-skel m-6 h-[220px] rounded-[14px]" />
          ) : error ? (
            <ErrorState message={error} />
          ) : rows.length === 0 ? (
            <EmptyMsg title="Sem regras" hint="Crie a primeira regra de preço para este filtro." />
          ) : (
            <TableWrap>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#FFF7F6]">
                    <Th>Chave</Th>
                    <Th>Categoria</Th>
                    <Th>Perfil</Th>
                    <Th right>Taxa</Th>
                    <Th right>Fixo</Th>
                    <Th right>Prio.</Th>
                    <Th>Estado</Th>
                    <Th right>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="adm-row transition-colors hover:bg-[#FFF7F6]">
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold">{r.rule_key}</span>
                          <span className="rounded-[6px] bg-[#f3e9e9] px-[6px] py-[1px] font-mono text-[11px] font-bold text-[#7a6a6e]">v{r.version}</span>
                          <Badge label={r.environment} variant={r.environment === 'LIVE' ? 'maroon' : 'info'} />
                          {r.used && <Badge label="USADA" variant="neutral" />}
                        </div>
                      </Td>
                      <Td>{r.business_category ?? <span className="text-[#b3a3a7]">qualquer</span>}</Td>
                      <Td>{r.pricing_profile ?? <span className="text-[#b3a3a7]">qualquer</span>}</Td>
                      <Td right mono className="font-extrabold">{pct(r.rate_bps)}</Td>
                      <Td right mono>{r.flat_minor ? formatKz(r.flat_minor) : '—'}</Td>
                      <Td right mono>{r.priority}</Td>
                      <Td><Badge label={r.enabled ? 'ATIVA' : 'INATIVA'} variant={r.enabled ? 'success' : 'neutral'} /></Td>
                      <Td right>
                        <div className="flex justify-end gap-1">
                          <IconBtn title="Editar" onClick={() => openEdit(r)} Icon={Pencil} />
                          <IconBtn title="Versões" onClick={() => openVersions(r)} Icon={History} />
                          <IconBtn title="Duplicar" onClick={() => duplicate(r)} Icon={Copy} disabled={busy === r.id} />
                          <IconBtn
                            title={r.enabled ? 'Desativar' : 'Ativar'}
                            onClick={() => toggleEnabled(r)}
                            Icon={Power}
                            danger={r.enabled}
                            disabled={busy === r.id}
                          />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        {mode.kind === 'create' || mode.kind === 'edit' ? (
          <Card>
            <CardHeader
              title={mode.kind === 'edit' ? `Editar ${mode.rule.rule_key}` : 'Nova regra'}
              action={<IconBtn title="Fechar" onClick={closePanel} Icon={X} />}
            />
            <div className="flex flex-col gap-[14px] p-[22px]">
              {editingUsed && (
                <p className="rounded-[11px] bg-[#FFF7E8] px-[13px] py-[10px] text-[12.5px] font-bold text-[#9a7a1a]">
                  Esta regra já priçou pagamentos reais. Guardar criará a versão {mode.kind === 'edit' ? mode.rule.version + 1 : ''} e desativará a atual — o histórico permanece intacto.
                </p>
              )}
              <RuleForm form={form} setForm={setForm} lockKey={mode.kind === 'edit'} />
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={closePanel} className="rounded-[11px] border border-[#f1e3e3] px-[15px] py-[9px] text-[13px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6]">
                  Cancelar
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-[11px] bg-[#B5101F] px-[16px] py-[9px] text-[13px] font-extrabold text-white hover:bg-[#9a0d1a] disabled:opacity-60"
                >
                  {saving ? 'A guardar…' : mode.kind === 'edit' ? (editingUsed ? 'Guardar nova versão' : 'Guardar') : 'Criar regra'}
                </button>
              </div>
            </div>
          </Card>
        ) : mode.kind === 'versions' ? (
          <Card>
            <CardHeader title={`Versões · ${mode.rule.rule_key}`} action={<IconBtn title="Fechar" onClick={closePanel} Icon={X} />} />
            <div className="flex flex-col gap-2 p-[18px]">
              {versions.length === 0 ? (
                <div className="adm-skel h-[120px] rounded-[12px]" />
              ) : versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-[12px] border border-[#f1e3e3] px-[14px] py-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="rounded-[6px] bg-[#f3e9e9] px-[7px] py-[2px] font-mono text-[12px] font-bold text-[#7a6a6e]">v{v.version}</span>
                    <span className="font-mono text-[13px] font-extrabold">{pct(v.rate_bps)}</span>
                    {v.flat_minor > 0 && <span className="text-[12px] text-[#7a6a6e]">+{formatKz(v.flat_minor)}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-[#7a6a6e]">
                    <span>{formatDate(v.created_at)}</span>
                    <Badge label={v.enabled ? 'ATIVA' : 'INATIVA'} variant={v.enabled ? 'success' : 'neutral'} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function IconBtn({ title, onClick, Icon, danger, disabled }: {
  title: string; onClick: () => void; Icon: typeof Plus; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[32px] w-[32px] items-center justify-center rounded-[9px] border border-[#f1e3e3] transition-colors disabled:opacity-40 ${
        danger ? 'text-[#B5101F] hover:bg-[#FFF1F0]' : 'text-[#5a4a4e] hover:bg-[#FFF7F6]'
      }`}
    >
      <Icon size={15} strokeWidth={2.2} />
    </button>
  );
}

function Filters({ value, onChange }: { value: PricingRuleFilters; onChange: (f: PricingRuleFilters) => void }) {
  function set<K extends keyof PricingRuleFilters>(k: K, v: string) {
    onChange({ ...value, [k]: v || undefined });
  }
  const selClass = 'rounded-[11px] border border-[#f1e3e3] bg-white px-[12px] py-[8px] text-[13px] font-semibold text-[#3a2e32] outline-none focus:border-[#B5101F]';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={selClass} value={value.environment ?? ''} onChange={(e) => set('environment', e.target.value)}>
        <option value="">Todos os ambientes</option>
        <option value="LIVE">LIVE</option>
        <option value="SANDBOX">SANDBOX</option>
      </select>
      <select className={selClass} value={value.business_category ?? ''} onChange={(e) => set('business_category', e.target.value)}>
        <option value="">Todas as categorias</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select className={selClass} value={value.currency ?? ''} onChange={(e) => set('currency', e.target.value)}>
        <option value="">Todas as moedas</option>
        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select className={selClass} value={value.status ?? ''} onChange={(e) => set('status', e.target.value)}>
        <option value="">Todos os estados</option>
        <option value="enabled">Ativas</option>
        <option value="disabled">Inativas</option>
      </select>
    </div>
  );
}

function RuleForm({ form, setForm, lockKey }: {
  form: PricingRuleInput; setForm: (f: PricingRuleInput) => void; lockKey: boolean;
}) {
  function set<K extends keyof PricingRuleInput>(k: K, v: PricingRuleInput[K]) {
    setForm({ ...form, [k]: v });
  }
  const num = (v: string): number => (v === '' ? 0 : Number(v));
  const numOrNull = (v: string): number | null => (v === '' ? null : Number(v));
  const inputClass = 'w-full rounded-[10px] border border-[#f1e3e3] bg-white px-[11px] py-[8px] text-[13px] outline-none focus:border-[#B5101F]';
  const labelClass = 'mb-[4px] block text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-[#9a8a8e]';

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-[12px]">
      <Field className="col-span-2" label="Chave da regra (rule_key)">
        <input className={inputClass} value={form.rule_key} disabled={lockKey}
          onChange={(e) => set('rule_key', e.target.value)} placeholder="ex.: donation-standard" />
      </Field>
      <Field label="Ambiente" labelClass={labelClass}>
        <select className={inputClass} value={form.environment} disabled={lockKey}
          onChange={(e) => set('environment', e.target.value as PricingRuleInput['environment'])}>
          <option value="LIVE">LIVE</option>
          <option value="SANDBOX">SANDBOX</option>
        </select>
      </Field>
      <Field label="Moeda (vazio = qualquer)" labelClass={labelClass}>
        <select className={inputClass} value={form.currency ?? ''} onChange={(e) => set('currency', e.target.value)}>
          <option value="">qualquer</option>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Categoria (vazio = qualquer)" labelClass={labelClass}>
        <input className={inputClass} list="pr-cats" value={form.business_category ?? ''} onChange={(e) => set('business_category', e.target.value)} />
        <datalist id="pr-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Perfil (vazio = qualquer)" labelClass={labelClass}>
        <input className={inputClass} list="pr-profiles" value={form.pricing_profile ?? ''} onChange={(e) => set('pricing_profile', e.target.value)} />
        <datalist id="pr-profiles">{PROFILES.map((p) => <option key={p} value={p} />)}</datalist>
      </Field>
      <Field label="Fee policy ref" labelClass={labelClass}>
        <input className={inputClass} value={form.fee_policy_ref ?? ''} onChange={(e) => set('fee_policy_ref', e.target.value)} placeholder="pol_…" />
      </Field>
      <Field label="País (ISO-2, vazio = qualquer)" labelClass={labelClass}>
        <input className={inputClass} value={form.country ?? ''} maxLength={2} onChange={(e) => set('country', e.target.value.toUpperCase())} placeholder="AO" />
      </Field>
      <Field label={`Taxa (bps) — ${pct(form.rate_bps)}`} labelClass={labelClass}>
        <input className={inputClass} type="number" min={0} value={form.rate_bps} onChange={(e) => set('rate_bps', num(e.target.value))} />
      </Field>
      <Field label="Taxa fixa (cêntimos)" labelClass={labelClass}>
        <input className={inputClass} type="number" min={0} value={form.flat_minor} onChange={(e) => set('flat_minor', num(e.target.value))} />
      </Field>
      <Field label="Mín. (cêntimos)" labelClass={labelClass}>
        <input className={inputClass} type="number" min={0} value={form.min_fee_minor ?? ''} onChange={(e) => set('min_fee_minor', numOrNull(e.target.value))} />
      </Field>
      <Field label="Máx. (cêntimos)" labelClass={labelClass}>
        <input className={inputClass} type="number" min={0} value={form.max_fee_minor ?? ''} onChange={(e) => set('max_fee_minor', numOrNull(e.target.value))} />
      </Field>
      <Field label="Arredondamento" labelClass={labelClass}>
        <select className={inputClass} value={form.rounding} onChange={(e) => set('rounding', e.target.value as PricingRuleInput['rounding'])}>
          {ROUNDINGS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Prioridade" labelClass={labelClass}>
        <input className={inputClass} type="number" value={form.priority ?? 0} onChange={(e) => set('priority', num(e.target.value))} />
      </Field>
      <Field label="Em vigor até (opcional)" labelClass={labelClass}>
        <input className={inputClass} type="datetime-local" value={toLocalInput(form.effective_to)} onChange={(e) => set('effective_to', e.target.value ? new Date(e.target.value).toISOString() : null)} />
      </Field>
      <Field className="col-span-2" label="Descrição (interno)">
        <input className={inputClass} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>
    </div>
  );
}

function Field({ label, children, className = '', labelClass }: { label: string; children: React.ReactNode; className?: string; labelClass?: string }) {
  return (
    <div className={className}>
      <span className={labelClass ?? 'mb-[4px] block text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-[#9a8a8e]'}>{label}</span>
      {children}
    </div>
  );
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
