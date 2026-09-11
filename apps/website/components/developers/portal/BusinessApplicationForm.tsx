'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { developerApi, ApiError, type FinancialApplicationInput } from '@/lib/developer-api';
import {
  checkHandle,
  getApplicationRequirements,
  isValidHandleFormat,
  normalizeHandle,
  uploadKybDocument,
  type KybDocumentType,
} from '@/lib/api';
import { PROVINCIAS, municipiosDe } from '@/lib/angola';
import { CATEGORIES, OUTROS, VOLUME_FAIXAS, subcategoriasDe, volumeFaixaLabel } from '@/lib/business-categories';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_SLOTS,
  REPRESENTATIVE_ROLES,
  STORAGE_NOT_CONFIGURED_TEXT,
  documentProblem,
  handleUnavailableText,
  isAngolanPhone,
  isEmail,
  isNif,
  newIdempotencyKey,
  refusalText,
  requiredFrom,
} from '@/lib/financial-onboarding';
import { FIELD_ERROR, FIELD_HINT, FIELD_INPUT, FIELD_LABEL, SECONDARY_BUTTON, primaryButton } from './ui';

/**
 * Path A — apply for a NEW Business, from the Console.
 *
 * The same Business application the public form collects: the same fields,
 * the same documents, the same operator review in BANZADMIN. Nothing here
 * approves anything. Which fields are required comes from the Gateway's
 * requirements policy (GET /v1/merchant/application-requirements); the form
 * mirrors it so a developer learns what is missing before sending, and the
 * Gateway still refuses an approval whose requirements are not met.
 *
 * The application goes through developer-api, which adds the Project and the
 * submitting member from the session; the documents then go to the Gateway by
 * the returned application reference, exactly as the public form sends them.
 * One idempotency key per form session: a retried or double-clicked submission
 * returns the first application rather than making a second.
 */

const STEPS = ['Negócio', 'Responsável', 'Documentos', '@banza', 'Revisão'] as const;

type Fields = {
  business_name: string;
  category: string;
  category_other: string;
  subcategory: string;
  business_activity: string;
  estimated_volume: string;
  email: string;
  phone: string;
  nif: string;
  province: string;
  municipality: string;
  city: string;
  address: string;
  address_reference: string;
  legal_representative: string;
  representative_role: string;
  representative_email: string;
  representative_phone: string;
  desired_handle: string;
};

const EMPTY: Fields = {
  business_name: '', category: '', category_other: '', subcategory: '', business_activity: '', estimated_volume: '',
  email: '', phone: '', nif: '', province: '', municipality: '', city: '', address: '', address_reference: '',
  legal_representative: '', representative_role: '', representative_email: '', representative_phone: '',
  desired_handle: '',
};

type HandleState =
  | { k: 'idle' }
  | { k: 'checking' }
  | { k: 'available' }
  | { k: 'unavailable'; reason?: string; message: string };

type DocChoice = Partial<Record<KybDocumentType, File>>;

export type ApplicationSubmitted = { applicationId: string; notice?: string };

// ── Field primitives ───────────────────────────────────────────────────────

function Label({ id, label, required }: { id: string; label: string; required: boolean }) {
  return (
    <label htmlFor={id} style={FIELD_LABEL}>
      {label}
      {required
        ? <span aria-hidden="true" style={{ color: '#B5101F' }}> *</span>
        : <span style={{ fontWeight: 600, color: '#a89a9e' }}> (opcional)</span>}
    </label>
  );
}

function describedBy(id: string, error?: string | null, hint?: string) {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return ids || undefined;
}

function FieldFoot({ id, error, hint }: { id: string; error?: string | null; hint?: string }) {
  return (
    <>
      {hint && <p id={`${id}-hint`} style={FIELD_HINT}>{hint}</p>}
      {error && <p id={`${id}-error`} style={FIELD_ERROR}>{error}</p>}
    </>
  );
}

function TextField({
  id, label, required, value, onChange, error, hint, type = 'text', multiline, prefix, autoComplete, inputMode, placeholder,
}: {
  id: string; label: string; required: boolean; value: string; onChange: (v: string) => void;
  error?: string | null; hint?: string; type?: string; multiline?: boolean; prefix?: string;
  autoComplete?: string; inputMode?: 'text' | 'email' | 'tel' | 'numeric'; placeholder?: string;
}) {
  const common = {
    id,
    name: id,
    value,
    placeholder,
    autoComplete,
    'aria-required': required || undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(id, error, hint),
  } as const;
  return (
    <div>
      <Label id={id} label={label} required={required} />
      {multiline ? (
        <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} style={{ ...FIELD_INPUT, resize: 'vertical' }} />
      ) : prefix ? (
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <span
            aria-hidden="true"
            style={{ padding: '10px 10px', border: '1.5px solid #EBDBD9', borderRight: 'none', borderRadius: '10px 0 0 10px', background: '#FDFAFA', fontSize: 14, fontWeight: 800, color: '#6a5a5e' }}
          >
            {prefix}
          </span>
          <input {...common} type={type} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} style={{ ...FIELD_INPUT, borderRadius: '0 10px 10px 0' }} />
        </div>
      ) : (
        <input {...common} type={type} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} style={FIELD_INPUT} />
      )}
      <FieldFoot id={id} error={error} hint={hint} />
    </div>
  );
}

function SelectField({
  id, label, required, value, onChange, options, error, hint, disabled, labelFor,
}: {
  id: string; label: string; required: boolean; value: string; onChange: (v: string) => void;
  options: string[]; error?: string | null; hint?: string; disabled?: boolean;
  /** What a person reads for a value; the value submitted stays as it is. */
  labelFor?: (value: string) => string;
}) {
  return (
    <div>
      <Label id={id} label={label} required={required} />
      <select
        id={id}
        name={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        style={FIELD_INPUT}
      >
        <option value="">Selecione…</option>
        {options.map((o) => <option key={o} value={o}>{labelFor ? labelFor(o) : o}</option>)}
      </select>
      <FieldFoot id={id} error={error} hint={hint} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '18px 0 0' }}>
      <legend style={{ padding: 0, fontSize: 13, fontWeight: 900, color: '#2a2024', marginBottom: 10 }}>{title}</legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>{children}</div>
    </fieldset>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '7px 0', borderBottom: '1px solid #F3EDEC', fontSize: 13.5 }}>
      <dt style={{ color: '#8a7a7e', fontWeight: 700 }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 800, color: '#2a2024', textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</dd>
    </div>
  );
}

// ── The form ───────────────────────────────────────────────────────────────

export function BusinessApplicationForm({
  projectId,
  csrf,
  onCancel,
  onSubmitted,
  onUseExisting,
  onStale,
}: {
  projectId: string;
  csrf: string;
  onCancel: () => void;
  onSubmitted: (r: ApplicationSubmitted) => void;
  /** The @ belongs to an existing Business: go to the consent-code path. */
  onUseExisting: () => void;
  /** The Project's state moved on under this form (an application already in
   *  progress, a Business already connected): reload it and say why. */
  onStale: (message: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Fields>(EMPTY);
  const [docs, setDocs] = useState<DocChoice>({});
  const [docErrors, setDocErrors] = useState<Partial<Record<KybDocumentType, string>>>({});
  const [terms, setTerms] = useState(false);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [handle, setHandle] = useState<HandleState>({ k: 'idle' });
  const [required, setRequired] = useState(() => requiredFrom(null));
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [uploading, setUploading] = useState<Partial<Record<KybDocumentType, 'pending' | 'sending' | 'done' | 'failed'>> | null>(null);

  // The requirements policy — the Gateway's, mirrored. The fallback copy keeps
  // the form requiring something while the policy is on its way or unreachable.
  useEffect(() => {
    let live = true;
    void getApplicationRequirements().then((p) => { if (live && p) setRequired(requiredFrom(p)); });
    return () => { live = false; };
  }, []);

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const need = (code: string) => required.fields.has(code);
  const handleClean = normalizeHandle(f.desired_handle);

  // Live @banza availability, against the same public check the public form uses.
  useEffect(() => {
    if (!handleClean) { setHandle({ k: 'idle' }); return; }
    if (!isValidHandleFormat(handleClean)) {
      setHandle({ k: 'unavailable', reason: 'INVALID', message: handleUnavailableText('INVALID') });
      return;
    }
    setHandle({ k: 'checking' });
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await checkHandle(handleClean);
        if (!live) return;
        if (r && r.available === true) setHandle({ k: 'available' });
        else setHandle({ k: 'unavailable', reason: r?.reason ?? 'INVALID', message: handleUnavailableText(r?.reason ?? 'INVALID') });
      } catch {
        if (live) setHandle({ k: 'unavailable', reason: 'UNCHECKED', message: 'Não foi possível verificar a disponibilidade. Tente novamente.' });
      }
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [handleClean]);

  const municipios = municipiosDe(f.province);
  const subcategorias = subcategoriasDe(f.category);
  const requiredDocs = DOCUMENT_SLOTS.filter((d) => required.documents.has(d.type));

  // Every field's problem, or null. Computed always; shown only after a
  // failed attempt to leave the step, then kept live while it is fixed.
  const missing = (code: keyof Fields) => need(code) && !f[code].trim();
  const errors = {
    business_name: missing('business_name') ? 'Indique o nome do negócio.' : null,
    category: missing('category') ? 'Selecione a categoria.' : null,
    category_other: f.category === OUTROS && !f.category_other.trim() ? 'Descreva a categoria do negócio.' : null,
    business_activity: missing('business_activity') ? 'Descreva a atividade do negócio.' : null,
    email: missing('email') ? 'Indique o email do negócio.' : f.email.trim() && !isEmail(f.email) ? 'Email inválido.' : null,
    phone: missing('phone')
      ? 'Indique o telefone do negócio.'
      : f.phone.trim() && !isAngolanPhone(f.phone) ? 'Telefone inválido — 9 dígitos (ex: 923 456 789).' : null,
    nif: missing('nif') ? 'Indique o NIF da empresa.' : f.nif.trim() && !isNif(f.nif) ? 'NIF inválido — apenas dígitos (9 a 14).' : null,
    province: missing('province') ? 'Selecione a província.' : null,
    municipality: missing('municipality') ? 'Selecione o município.' : null,
    city: missing('city') ? 'Indique a cidade, bairro ou zona.' : null,
    address: missing('address') ? 'Indique o endereço do negócio.' : null,
    legal_representative: missing('legal_representative') ? 'Indique o nome do responsável legal.' : null,
    representative_role: missing('representative_role') ? 'Selecione o cargo do responsável.' : null,
    representative_email: f.representative_email.trim() && !isEmail(f.representative_email) ? 'Email inválido.' : null,
    representative_phone: f.representative_phone.trim() && !isAngolanPhone(f.representative_phone)
      ? 'Telefone inválido — 9 dígitos (ex: 923 456 789).' : null,
    desired_handle: !handleClean
      ? 'Escolha o @banza do negócio.'
      : handle.k === 'available' ? null
        : handle.k === 'checking' || handle.k === 'idle' ? 'A verificar a disponibilidade…'
          : handle.message,
    terms: need('terms_accepted') && !terms ? 'Tem de aceitar os termos e condições.' : null,
  };

  const STEP_FIELDS: (keyof typeof errors)[][] = [
    ['business_name', 'category', 'category_other', 'business_activity', 'email', 'phone', 'nif', 'province', 'municipality', 'city', 'address'],
    ['legal_representative', 'representative_role', 'representative_email', 'representative_phone'],
    [],
    ['desired_handle'],
    ['terms'],
  ];

  const docMissing = requiredDocs.filter((d) => !docs[d.type]);
  const stepValid = (s: number) =>
    STEP_FIELDS[s].every((k) => errors[k] === null) && (s !== 2 || docMissing.length === 0);
  const show = (k: keyof typeof errors) => (tried[step] ? errors[k] : null);

  function focusFirstInvalid() {
    if (typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="business-application"] [aria-invalid="true"]');
      el?.focus();
    });
  }

  function next() {
    if (!stepValid(step)) {
      setTried((t) => ({ ...t, [step]: true }));
      focusFirstInvalid();
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function back() {
    if (step === 0) onCancel();
    else setStep((s) => s - 1);
  }

  function pickDoc(type: KybDocumentType, file: File | undefined) {
    if (!file) return;
    const problem = documentProblem(file);
    setDocs((d) => ({ ...d, [type]: problem ? undefined : file }));
    setDocErrors((e) => ({ ...e, [type]: problem ?? undefined }));
  }

  const digits = (s: string) => s.replace(/\D/g, '');

  async function submit() {
    if (submitting) return;
    for (let s = 0; s < STEPS.length; s++) {
      if (!stepValid(s)) {
        setTried((t) => ({ ...t, [s]: true }));
        setStep(s);
        focusFirstInvalid();
        return;
      }
    }
    setSubmitting(true);
    setSubmitError('');
    const category = f.category === OUTROS ? (f.category_other.trim() || OUTROS) : f.category;
    const body: FinancialApplicationInput = {
      desired_handle: handleClean,
      business_name: f.business_name.trim(),
      category,
      subcategory: f.subcategory || undefined,
      email: f.email.trim(),
      phone: f.phone.trim() ? `+244 ${digits(f.phone)}` : '',
      nif: digits(f.nif),
      province: f.province,
      municipality: f.municipality,
      city: f.city.trim() || undefined,
      address: f.address.trim(),
      address_reference: f.address_reference.trim() || undefined,
      legal_representative: f.legal_representative.trim(),
      representative_role: f.representative_role,
      representative_email: f.representative_email.trim() || undefined,
      representative_phone: f.representative_phone.trim() ? `+244 ${digits(f.representative_phone)}` : undefined,
      business_activity: f.business_activity.trim(),
      estimated_volume: f.estimated_volume || undefined,
      terms_accepted: true,
    };

    let applicationId: string;
    try {
      const r = await developerApi.submitFinancialApplication(projectId, body, idempotencyKey, csrf);
      applicationId = r.application_id;
    } catch (e) {
      setSubmitting(false);
      const code = e instanceof ApiError ? e.code : 'UNAVAILABLE';
      if (code === 'APPLICATION_IN_PROGRESS' || code === 'PROJECT_ALREADY_RECEIVING') {
        onStale(refusalText(code));
        return;
      }
      if (['INVALID_HANDLE', 'HANDLE_RESERVED', 'HANDLE_OWNED_BY_BUSINESS', 'HANDLE_TAKEN'].includes(code)) {
        setHandle({
          k: 'unavailable',
          reason: code === 'HANDLE_OWNED_BY_BUSINESS' ? 'BUSINESS' : code,
          message: refusalText(code),
        });
        setTried((t) => ({ ...t, 3: true }));
        setStep(3);
        return;
      }
      setSubmitError(refusalText(code));
      return;
    }

    // The application exists. Now its documents, one at a time, by reference.
    const chosen = DOCUMENT_SLOTS.filter((d) => docs[d.type]);
    const progress: Partial<Record<KybDocumentType, 'pending' | 'sending' | 'done' | 'failed'>> = {};
    for (const d of chosen) progress[d.type] = 'pending';
    setUploading({ ...progress });
    let storageOff = false;
    let failed = 0;
    for (const d of chosen) {
      progress[d.type] = 'sending';
      setUploading({ ...progress });
      let res;
      try {
        res = await uploadKybDocument(applicationId, d.type, docs[d.type] as File);
      } catch {
        res = { ok: false as const, reason: 'ERROR' as const, message: '' };
      }
      if (res.ok) {
        progress[d.type] = 'done';
      } else if (res.reason === 'NOT_CONFIGURED') {
        // Nothing else will go either; stop rather than pretend.
        storageOff = true;
        for (const rest of chosen) if (progress[rest.type] !== 'done') progress[rest.type] = 'failed';
        setUploading({ ...progress });
        break;
      } else {
        progress[d.type] = 'failed';
        failed++;
      }
      setUploading({ ...progress });
    }
    setSubmitting(false);
    onSubmitted({
      applicationId,
      notice: storageOff
        ? `${STORAGE_NOT_CONFIGURED_TEXT} A candidatura foi registada sem documentos; envie-os quando o envio estiver disponível.`
        : failed > 0
          ? `A candidatura foi registada, mas ${failed === 1 ? 'um documento não foi enviado' : `${failed} documentos não foram enviados`}. Envie-${failed === 1 ? 'o' : 'os'} abaixo.`
          : undefined,
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (uploading) {
    return (
      <div role="status" aria-live="polite" style={{ marginTop: 18 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Candidatura enviada. A enviar os documentos…</p>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13.5, fontWeight: 700, color: '#6a5a5e', lineHeight: 1.7 }}>
          {DOCUMENT_SLOTS.filter((d) => uploading[d.type]).map((d) => (
            <li key={d.type}>
              {d.label}: {uploading[d.type] === 'done' ? 'enviado' : uploading[d.type] === 'failed' ? 'não enviado' : uploading[d.type] === 'sending' ? 'a enviar…' : 'em espera'}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form
      data-testid="business-application"
      aria-labelledby="fo-new-heading"
      noValidate
      onSubmit={(e) => { e.preventDefault(); if (step === STEPS.length - 1) void submit(); else next(); }}
      style={{ marginTop: 18 }}
    >
      <h3 id="fo-new-heading" style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>Criar/verificar um novo negócio</h3>
      <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#6a5a5e', fontWeight: 600, lineHeight: 1.6 }}>
        A mesma candidatura de qualquer negócio Banzami. Um operador do Banzami analisa-a; quando for aprovada, o
        Banzami cria o negócio (@banza e carteira) e liga-o a este projeto.
      </p>

      <ol aria-label="Passos da candidatura" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? 'step' : undefined}
            style={{
              padding: '5px 11px', borderRadius: 30, fontSize: 12, fontWeight: 800,
              background: i === step ? '#B5101F' : i < step ? '#FFF1F0' : '#F3EDEC',
              color: i === step ? '#fff' : i < step ? '#B5101F' : '#8a7a7e',
            }}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          <Section title="Identificação">
            <TextField id="fo-business-name" label="Nome do negócio" required={need('business_name')} value={f.business_name} onChange={(v) => set('business_name', v)} error={show('business_name')} autoComplete="organization" />
            <TextField id="fo-nif" label="NIF da empresa" required={need('nif')} value={f.nif} onChange={(v) => set('nif', v)} error={show('nif')} inputMode="numeric" />
            <SelectField
              id="fo-category"
              label="Categoria do negócio"
              required={need('category')}
              value={f.category}
              onChange={(v) => setF((p) => ({ ...p, category: v, subcategory: '', category_other: v === OUTROS ? p.category_other : '' }))}
              options={CATEGORIES}
              error={show('category')}
            />
            {f.category === OUTROS ? (
              <TextField id="fo-category-other" label="Descreva a categoria" required value={f.category_other} onChange={(v) => set('category_other', v)} error={show('category_other')} />
            ) : subcategorias.length > 0 ? (
              <SelectField id="fo-subcategory" label="Subcategoria" required={false} value={f.subcategory} onChange={(v) => set('subcategory', v)} options={subcategorias} />
            ) : null}
          </Section>
          <Section title="Atividade">
            <TextField id="fo-business-activity" label="Atividade do negócio" required={need('business_activity')} value={f.business_activity} onChange={(v) => set('business_activity', v)} error={show('business_activity')} multiline hint="O que o negócio vende ou faz, em poucas palavras." />
            <SelectField id="fo-estimated-volume" label="Volume mensal estimado" required={need('estimated_volume')} value={f.estimated_volume} onChange={(v) => set('estimated_volume', v)} options={VOLUME_FAIXAS} labelFor={volumeFaixaLabel} />
          </Section>
          <Section title="Contacto">
            <TextField id="fo-email" label="Email do negócio" required={need('email')} value={f.email} onChange={(v) => set('email', v)} error={show('email')} type="email" inputMode="email" autoComplete="email" />
            <TextField id="fo-phone" label="Telefone do negócio" required={need('phone')} value={f.phone} onChange={(v) => set('phone', v)} error={show('phone')} type="tel" inputMode="tel" prefix="+244" placeholder="923 456 789" />
          </Section>
          <Section title="Localização">
            <SelectField id="fo-province" label="Província" required={need('province')} value={f.province} onChange={(v) => setF((p) => ({ ...p, province: v, municipality: '' }))} options={PROVINCIAS} error={show('province')} />
            <SelectField id="fo-municipality" label="Município" required={need('municipality')} value={f.municipality} onChange={(v) => set('municipality', v)} options={municipios} error={show('municipality')} disabled={!f.province} hint={f.province ? undefined : 'Escolha primeiro a província.'} />
            <TextField id="fo-city" label="Cidade, bairro ou zona" required={need('city')} value={f.city} onChange={(v) => set('city', v)} error={show('city')} />
            <TextField id="fo-address" label="Endereço do negócio" required={need('address')} value={f.address} onChange={(v) => set('address', v)} error={show('address')} autoComplete="street-address" />
            <TextField id="fo-address-reference" label="Ponto de referência" required={need('address_reference')} value={f.address_reference} onChange={(v) => set('address_reference', v)} />
          </Section>
        </>
      )}

      {step === 1 && (
        <Section title="Responsável legal">
          <TextField id="fo-legal-representative" label="Responsável legal" required={need('legal_representative')} value={f.legal_representative} onChange={(v) => set('legal_representative', v)} error={show('legal_representative')} autoComplete="name" hint="Nome completo, como no documento de identidade." />
          <SelectField id="fo-representative-role" label="Cargo do responsável" required={need('representative_role')} value={f.representative_role} onChange={(v) => set('representative_role', v)} options={REPRESENTATIVE_ROLES} error={show('representative_role')} />
          <TextField id="fo-representative-email" label="Email do responsável" required={need('representative_email')} value={f.representative_email} onChange={(v) => set('representative_email', v)} error={show('representative_email')} type="email" inputMode="email" />
          <TextField id="fo-representative-phone" label="Telefone do responsável" required={need('representative_phone')} value={f.representative_phone} onChange={(v) => set('representative_phone', v)} error={show('representative_phone')} type="tel" inputMode="tel" prefix="+244" />
        </Section>
      )}

      {step === 2 && (
        <fieldset style={{ border: 'none', padding: 0, margin: '18px 0 0' }}>
          <legend style={{ padding: 0, fontSize: 13, fontWeight: 900, color: '#2a2024', marginBottom: 6 }}>Documentos</legend>
          <p style={{ ...FIELD_HINT, marginTop: 0 }}>
            PDF, JPEG ou PNG, até 5 MB cada. São enviados logo depois da candidatura, directamente para o armazenamento
            de documentos do Banzami.
          </p>
          <div style={{ display: 'grid', gap: 14, marginTop: 10 }}>
            {DOCUMENT_SLOTS.map((d) => {
              const id = `fo-doc-${d.type.toLowerCase()}`;
              const req = required.documents.has(d.type);
              const err = docErrors[d.type] ?? (tried[2] && req && !docs[d.type] ? `Escolha o ficheiro: ${d.label}.` : null);
              return (
                <div key={d.type}>
                  <Label id={id} label={d.label} required={req} />
                  <input
                    id={id}
                    type="file"
                    accept={DOCUMENT_ACCEPT}
                    aria-required={req || undefined}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={describedBy(id, err, d.hint)}
                    onChange={(e) => pickDoc(d.type, e.target.files?.[0])}
                    style={{ fontSize: 13 }}
                  />
                  <FieldFoot id={id} hint={docs[d.type] ? `${d.hint} · escolhido: ${docs[d.type]!.name}` : d.hint} error={err} />
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      {step === 3 && (
        <Section title="@banza do negócio">
          <div>
            <TextField
              id="fo-desired-handle"
              label="@banza do negócio"
              required
              value={f.desired_handle}
              onChange={(v) => set('desired_handle', v)}
              error={tried[3] || (handle.k === 'unavailable' && handleClean) ? errors.desired_handle : null}
              prefix="@"
              hint="O nome com que o negócio recebe pagamentos. 3 a 30 caracteres: letras minúsculas, números ou _."
            />
            <p role="status" aria-live="polite" style={{ ...FIELD_HINT, fontWeight: 800, color: handle.k === 'available' ? '#1F8A5B' : '#8a7a7e' }}>
              {handle.k === 'checking' ? 'A verificar a disponibilidade…' : handle.k === 'available' ? `@${handleClean} está disponível.` : ''}
            </p>
            {handle.k === 'unavailable' && handle.reason === 'BUSINESS' && (
              <button type="button" onClick={onUseExisting} style={{ ...SECONDARY_BUTTON, marginTop: 8 }}>
                Ligar com o código do negócio
              </button>
            )}
          </div>
        </Section>
      )}

      {step === 4 && (
        <div style={{ marginTop: 18 }}>
          <dl style={{ margin: 0 }}>
            <ReviewRow label="Nome do negócio" value={f.business_name} />
            <ReviewRow label="@banza" value={handleClean ? `@${handleClean}` : ''} />
            <ReviewRow label="NIF" value={f.nif} />
            <ReviewRow label="Categoria" value={f.category === OUTROS ? f.category_other : [f.category, f.subcategory].filter(Boolean).join(' · ')} />
            <ReviewRow label="Atividade" value={f.business_activity} />
            <ReviewRow label="Contacto" value={[f.email, f.phone ? `+244 ${f.phone}` : ''].filter(Boolean).join(' · ')} />
            <ReviewRow label="Localização" value={[f.address, f.city, f.municipality, f.province].filter(Boolean).join(', ')} />
            <ReviewRow label="Responsável legal" value={[f.legal_representative, f.representative_role].filter(Boolean).join(' · ')} />
            <ReviewRow label="Documentos" value={DOCUMENT_SLOTS.filter((d) => docs[d.type]).map((d) => d.label).join(' · ')} />
          </dl>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input
              id="fo-terms"
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              aria-invalid={show('terms') ? true : undefined}
              aria-describedby={show('terms') ? 'fo-terms-error' : undefined}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: '#B5101F' }}
            />
            <label htmlFor="fo-terms" style={{ fontSize: 13.5, fontWeight: 700, color: '#2a2024', lineHeight: 1.5 }}>
              Li e aceito os termos e condições do Banzami Business, e confirmo que os dados são verdadeiros.
            </label>
          </div>
          {show('terms') && <p id="fo-terms-error" style={FIELD_ERROR}>{errors.terms}</p>}
        </div>
      )}

      {submitError && <p role="alert" style={{ ...FIELD_ERROR, marginTop: 14 }}>{submitError}</p>}

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {step < STEPS.length - 1 ? (
          <button type="submit" style={primaryButton(false)}>Continuar</button>
        ) : (
          <button type="submit" disabled={submitting} style={primaryButton(submitting)}>
            {submitting ? 'A enviar…' : 'Enviar para verificação'}
          </button>
        )}
        <button type="button" onClick={back} disabled={submitting} style={SECONDARY_BUTTON}>Voltar</button>
      </div>
    </form>
  );
}
