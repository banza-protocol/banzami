'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  checkHandle,
  submitApplication,
  uploadKybDocument,
  normalizeHandle,
  isValidHandleFormat,
  handleReasonMessage,
  getPlatformMode,
  type ApplicationInput,
  type KybDocumentType,
  type SubmitResult,
} from '@/lib/api';
import { PROVINCIAS, municipiosDe, cidadesDe } from '@/lib/angola';
import { CATEGORIES, OUTROS, subcategoriasDe, VOLUME_FAIXAS } from '@/lib/business-categories';
import {
  sandboxBusinessData,
  makeSandboxDoc,
  SANDBOX_DOC_FILENAMES,
  type SandboxBusiness,
} from '@/lib/sandbox-autofill';

// ===========================================================================
// Banzami Business — onboarding (Crie a sua conta Business em minutos).
// High-fidelity implementation of design_handoff_banzami_business/. 3 controlled
// steps (Dados do negócio → Documentos → Revisão) + success screen.
//
// Tokens (verbatim from the dossier): cherry #B5101F (hover #9A1B22), pinks
// #FBD2D0 / #FFF1F0 / #FFF7F6, success #1f9d57, Nunito + JetBrains Mono, inputs
// radius 14px / border 1.5px #f1e3e3, buttons pill radius 40px.
// ===========================================================================

const RED = '#B5101F';
const RED_DARK = '#9A1B22';
const GREEN = '#1f9d57';

// The sandbox notice follows the global Platform Status at runtime (ADR-025) —
// NOT the build-time API host — so a SANDBOX platform makes every step
// unmistakable and a test application is never confused with a real Business
// account. Resolved once on mount (fail-safe SANDBOX, like the rest of the site).

// --- Static data -----------------------------------------------------------

// Categorias, subcategorias (dependentes), províncias/municípios/cidades (Angola)
// e faixas de volume vêm de lib/business-categories + lib/angola.
const CARGOS = ['Proprietário(a)', 'Sócio(a)', 'Gerente', 'Administrador(a)', 'Representante legal'];

// Max 5MB, PDF/JPG/PNG — enforced client-side.
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png';
const DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png'];

type DocKey = 'docCertidao' | 'docBi' | 'docExtra';
type DocDef = { key: DocKey; label: string; hint?: string; icon: 'doc' | 'person' | 'home'; type: KybDocumentType; optional?: boolean };
// Dois documentos obrigatórios + um opcional. O NIF da empresa NÃO é documento:
// é um campo de texto no formulário. Sem prova de residência e sem dados de
// banco (estes pertencem a uma fase posterior de payout).
const DOC_DEFS: DocDef[] = [
  { key: 'docCertidao', label: 'Registo Comercial', icon: 'doc', type: 'BUSINESS_REGISTRATION' },
  { key: 'docBi', label: 'Documento de identidade do representante', hint: 'BI ou Passaporte', icon: 'person', type: 'REPRESENTATIVE_ID' },
  { key: 'docExtra', label: 'Documento adicional', hint: 'Comprovativo, licença, declaração ou outro documento relevante', icon: 'doc', type: 'OTHER', optional: true },
];

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';

type DocState = { file: File | null; name: string; error: string | null; sandbox?: boolean };
const emptyDoc: DocState = { file: null, name: '', error: null };

// --- Icons (inline SVG, from the dossier) ----------------------------------

const Ic = {
  logo: (
    <svg width="19" height="19" viewBox="0 0 100 100" fill="none">
      <rect x="6" y="6" width="42" height="42" rx="13" fill="#fff" />
      <rect x="56" y="10" width="32" height="32" rx="10" fill="#FBD2D0" />
      <rect x="10" y="56" width="38" height="38" rx="11" fill="#FBD2D0" />
      <rect x="58" y="60" width="28" height="28" rx="9" fill="#fff" />
    </svg>
  ),
  shield: (c = RED, s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 11.5l2 2 4-4" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bolt: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M13 2L5 13h6l-1 9 8-12h-6l1-8z" stroke={RED} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
  card: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="18" height="13" rx="3" stroke={RED} strokeWidth="1.8" />
      <path d="M3 10h18" stroke={RED} strokeWidth="1.8" />
      <circle cx="16.5" cy="14.5" r="1.4" fill="#E8434B" />
    </svg>
  ),
  store: (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
      <path d="M4 8l1.2-3.5h13.6L20 8M4 8v11a1 1 0 001 1h14a1 1 0 001-1V8M4 8h16M8 13h8" stroke={RED} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  pin: (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
      <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" stroke={RED} strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.6" stroke={RED} strokeWidth="1.7" />
    </svg>
  ),
  personLg: (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.4" stroke={RED} strokeWidth="1.7" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke={RED} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  docLg: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={RED} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M14 3v4h4M9 13h6M9 16.5h4" stroke={RED} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  search: (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke={RED} strokeWidth="1.8" />
      <path d="M20 20l-3.5-3.5" stroke={RED} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 11l2 2 4-4" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  lock: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="10" width="16" height="11" rx="2.5" stroke={RED} strokeWidth="1.7" />
      <path d="M8 10V7a4 4 0 018 0v3" stroke={RED} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  headset: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M4 11a8 8 0 0116 0v4a3 3 0 01-3 3h-1v-6h4M4 11v4a3 3 0 003 3h1v-6H4" stroke={RED} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (c = RED, w = 2.8, s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M20 6L9 17l-5-5" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  circleCheck: (c = GREEN, s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.8" />
      <path d="M8.5 12l2.2 2.2L15.5 9.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  upload: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M12 16V4m0 0L8 8m4-4l4 4" stroke={RED} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke={RED} strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  ),
  chevron: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute right-[15px] top-1/2 -translate-y-1/2">
      <path d="M6 9l6 6 6-6" stroke="#9a8a8e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // small per-document tile icons (step 1 / step 2 tiles)
  docSm: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={RED} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M14 3v4h4" stroke={RED} strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
  personSm: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.2" stroke={RED} strokeWidth="1.7" />
      <path d="M5.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" stroke={RED} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  homeSm: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 11l8-6 8 6v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9z" stroke={RED} strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
};

function docTileIcon(icon: 'doc' | 'person' | 'home') {
  return icon === 'person' ? Ic.personSm : icon === 'home' ? Ic.homeSm : Ic.docSm;
}

const AngolaFlag = ({ w = 22, h = 15 }: { w?: number; h?: number }) => (
  <span
    style={{ width: w, height: h }}
    className="inline-flex flex-col overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
  >
    <span className="flex-1 bg-[#cc092f]" />
    <span className="flex-1 bg-[#1a1a1a]" />
  </span>
);

// --- Reusable field primitives ---------------------------------------------

// Border colour is the only token that changes between valid / error states.
const ERR_BORDER = 'border-[#e8a3a3]';
const OK_BORDER = 'border-[#f1e3e3]';
const inputBase =
  'w-full rounded-[14px] border-[1.5px] bg-white px-4 py-3.5 text-[15px] font-semibold text-[#2a2024] outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-semibold placeholder:text-[#bca9ab] focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';
const inputClass = (bad?: boolean) => `${inputBase} ${bad ? ERR_BORDER : OK_BORDER}`;
const labelCls = 'mb-2 block text-[13px] font-extrabold text-[#2a2024]';

function FieldError({ error }: { error?: string | null }) {
  if (!error) return null;
  return <p className="mt-1.5 text-[13px] font-semibold text-[#B5101F]">{error}</p>;
}

function Field({
  label,
  optional,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div data-invalid={error ? 'true' : undefined} className="scroll-mt-24">
      <label className={labelCls}>
        {label}
        {optional && <span className="font-bold text-[#b9a9ab]"> (opcional)</span>}
      </label>
      {children}
      <FieldError error={error} />
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  error?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full cursor-pointer appearance-none rounded-[14px] border-[1.5px] ${
          error ? ERR_BORDER : OK_BORDER
        } bg-white py-3.5 pl-4 pr-10 text-[15px] font-semibold outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10`}
        style={{ color: value ? '#2a2024' : '#bca9ab' }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o} className="text-[#2a2024]">
            {o}
          </option>
        ))}
      </select>
      {Ic.chevron}
    </div>
  );
}

function PhoneField({
  value,
  onChange,
  flagW = 22,
  flagH = 15,
  compact,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  flagW?: number;
  flagH?: number;
  compact?: boolean;
  error?: boolean;
}) {
  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-[14px] border-[1.5px] ${
        error ? ERR_BORDER : OK_BORDER
      } bg-white transition-[border-color,box-shadow] duration-150 focus-within:border-[#B5101F] focus-within:ring-4 focus-within:ring-[#B5101F]/10`}
    >
      <span
        className={`flex items-center border-r-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] font-bold text-[#5a4a4e] ${
          compact ? 'gap-[7px] px-[11px] text-[14px]' : 'gap-2 px-[14px] text-[15px]'
        }`}
      >
        <AngolaFlag w={flagW} h={flagH} />
        +244
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="923 456 789"
        inputMode="tel"
        className={`min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-[#2a2024] outline-none placeholder:font-semibold placeholder:text-[#bca9ab] ${
          compact ? 'px-3 py-3.5' : 'px-4 py-3.5'
        }`}
      />
    </div>
  );
}

function SectionHead({ icon, title, subtitle, action }: { icon: ReactNode; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div className="flex items-center gap-[14px]">
        <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px] bg-[#FFF1F0]">
          {icon}
        </span>
        <div>
          <h2 className="m-0 text-[20px] font-black tracking-[-0.01em]">{title}</h2>
          <p className="m-0 mt-0.5 text-[14px] font-semibold text-[#9a8a8e]">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

// Small sandbox spark icon for the fill controls.
const SparkIc = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

// Tiny "Sandbox" badge for generated documents.
function SandboxBadge() {
  return (
    <span className="inline-flex flex-none items-center rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
      Sandbox
    </span>
  );
}

// SANDBOX-only per-section fill button — ghost/outline, small, right-aligned in
// the section header. Never the big cherry primary; deliberately unobtrusive.
function SbxFillButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex flex-none items-center gap-1.5 rounded-[10px] border-[1.5px] border-amber-300 bg-amber-50/70 px-3 py-[7px] text-[12.5px] font-extrabold text-amber-700 transition-colors hover:bg-amber-100"
    >
      {SparkIc}
      {label}
    </button>
  );
}

// --- Stepper ---------------------------------------------------------------

function Stepper({ step }: { step: number }) {
  const dot = (n: number, label: string) => {
    const reached = step >= n;
    const done = step > n && n < 3;
    return (
      <div className="relative flex-none">
        <div
          className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 text-[16px] font-black transition-all duration-300"
          style={{
            background: reached ? RED : '#fff',
            borderColor: reached ? RED : '#c9bcbe',
            color: reached ? '#fff' : '#9a8a8e',
          }}
        >
          {done ? Ic.check('#fff') : n}
        </div>
        <span
          className="absolute left-1/2 top-[calc(100%+9px)] -translate-x-1/2 whitespace-nowrap text-[13px] font-extrabold"
          style={{ color: step === n ? RED : '#9a8a8e' }}
        >
          {label}
        </span>
      </div>
    );
  };
  const line = (n: number) => (
    <div
      className="mx-[6px] h-[3px] flex-1 rounded-[3px] transition-[background] duration-300"
      style={{ background: step >= n ? RED : '#f0dede' }}
    />
  );
  return (
    <div className="mx-auto mb-[38px] flex max-w-[560px] items-center">
      {dot(1, 'Dados do negócio')}
      {line(2)}
      {dot(2, 'Documentos')}
      {line(3)}
      {dot(3, 'Revisão')}
    </div>
  );
}

// --- Handle availability state ---------------------------------------------

type HandleState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  // An existing Business Account uses the handle. Not available as new — but
  // its owner can apply to regularise that account (resolved by an operator
  // linking the application to it; nothing new is created).
  | { status: 'business' }
  | { status: 'unavailable'; message: string };

// ===========================================================================

export function CandidaturaForm() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  // Sandbox notice follows the global Platform Status (fail-safe SANDBOX).
  const [isSandbox, setIsSandbox] = useState(true);
  useEffect(() => {
    let active = true;
    void getPlatformMode().then((p) => { if (active) setIsSandbox(p.mode !== 'LIVE'); });
    return () => { active = false; };
  }, []);

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [category, setCategory] = useState('');
  const [categoryOther, setCategoryOther] = useState(''); // quando categoria = Outros
  const [subcategory, setSubcategory] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [provincia, setProvincia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [cidade, setCidade] = useState('');
  const [endereco, setEndereco] = useState('');
  const [referencia, setReferencia] = useState('');

  const [repNome, setRepNome] = useState('');
  const [nif, setNif] = useState('');
  const [cargo, setCargo] = useState('');
  const [emailPessoal, setEmailPessoal] = useState('');
  const [telPessoal, setTelPessoal] = useState('');

  const [descricao, setDescricao] = useState(''); // descrição curta da atividade
  const [volume, setVolume] = useState(''); // volume mensal estimado

  const [docs, setDocs] = useState<Record<DocKey, DocState>>({
    docCertidao: { ...emptyDoc },
    docBi: { ...emptyDoc },
    docExtra: { ...emptyDoc },
  });

  const [accepted, setAccepted] = useState(false);
  const [handleState, setHandleState] = useState<HandleState>({ status: 'idle' });
  // The applicant confirms the existing Business Account behind the handle is theirs.
  const [existingBusiness, setExistingBusiness] = useState(false);
  // One key per form session: a double click or a retried request returns the
  // application the first submission created, instead of a second one.
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `cand-${Date.now()}-${Math.random()}`);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // KYB document upload (Track 3) — runs after the application is created.
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [storageNotConfigured, setStorageNotConfigured] = useState(false);
  const [docUpload, setDocUpload] = useState<Record<DocKey, { status: UploadStatus; message?: string }>>({
    docCertidao: { status: 'pending' },
    docBi: { status: 'pending' },
    docExtra: { status: 'pending' },
  });

  // Transient sandbox toast ("Formulário preenchido…" / "Secção preenchida…").
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const showToast = (msg: string) => setToast({ id: Date.now(), msg });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // SANDBOX-only autofill. Each applier fills ONLY its own section (never
  // touches or clears other sections); the global button composes them all and
  // also generates the sandbox documents + accepts the terms. Values come from
  // lib/sandbox-autofill (unit-tested). Set the raw state directly (not via the
  // onChange* handlers) so cascading parents don't wipe the children we set.
  function applyNegocio(d: SandboxBusiness) {
    setName(d.name);
    setHandle(d.handle);
    setCategory(d.category);
    setCategoryOther('');
    setSubcategory(d.subcategory);
    setPhone(d.phone);
    setEmail(d.email);
  }
  function applyLocalizacao(d: SandboxBusiness) {
    setProvincia(d.provincia);
    setMunicipio(d.municipio);
    setCidade(d.cidade);
    setEndereco(d.endereco);
    setReferencia(d.referencia);
  }
  function applyResponsavel(d: SandboxBusiness) {
    setRepNome(d.repNome);
    setNif(d.nif);
    setCargo(d.cargo);
    setEmailPessoal(d.emailPessoal);
    setTelPessoal(d.telPessoal);
  }
  function applyAtividade(d: SandboxBusiness) {
    setDescricao(d.descricao);
    setVolume(d.volume);
  }
  // Generate the sandbox documents as real Files so they upload through the
  // normal presigned-URL path (into the environment's own bucket) after submit.
  function generateSandboxDocs() {
    setDocs({
      docCertidao: { file: makeSandboxDoc(SANDBOX_DOC_FILENAMES.docCertidao, 'Registo Comercial'), name: SANDBOX_DOC_FILENAMES.docCertidao, error: null, sandbox: true },
      docBi: { file: makeSandboxDoc(SANDBOX_DOC_FILENAMES.docBi, 'Documento de identidade do representante'), name: SANDBOX_DOC_FILENAMES.docBi, error: null, sandbox: true },
      docExtra: { file: makeSandboxDoc(SANDBOX_DOC_FILENAMES.docExtra, 'Documento adicional'), name: SANDBOX_DOC_FILENAMES.docExtra, error: null, sandbox: true },
    });
  }

  // Section handlers (fresh seed each) — fill one section + confirm with a toast.
  const fillNegocioSection = () => { applyNegocio(sandboxBusinessData()); showToast('Secção preenchida com dados sandbox.'); };
  const fillLocalizacaoSection = () => { applyLocalizacao(sandboxBusinessData()); showToast('Secção preenchida com dados sandbox.'); };
  const fillResponsavelSection = () => { applyResponsavel(sandboxBusinessData()); showToast('Secção preenchida com dados sandbox.'); };
  const fillAtividadeSection = () => { applyAtividade(sandboxBusinessData()); showToast('Secção preenchida com dados sandbox.'); };
  const fillDocumentosSection = () => { generateSandboxDocs(); showToast('Documentos sandbox gerados.'); };

  // Dependências Angola/categorias: município depende da província, cidade do
  // município, subcategoria da categoria. Mudar o pai limpa os filhos.
  const municipiosDisponiveis = municipiosDe(provincia);
  const cidadesSugeridas = cidadesDe(municipio);
  const subcategoriasDisponiveis = subcategoriasDe(category);

  function onChangeProvincia(v: string) {
    setProvincia(v);
    setMunicipio('');
    setCidade('');
  }
  function onChangeMunicipio(v: string) {
    setMunicipio(v);
    setCidade('');
  }
  function onChangeCategoria(v: string) {
    setCategory(v);
    setSubcategory('');
    if (v !== OUTROS) setCategoryOther('');
  }
  // Per-step "validation revealed" flags — errors only show after a failed
  // attempt to advance, then update live as the user fixes them.
  const [tried, setTried] = useState<{ 1?: boolean; 2?: boolean }>({});

  const handleClean = normalizeHandle(handle);
  const handleDisplay = handleClean || 'oseunegocio';

  // Debounced live @handle availability check against the real onboarding API.
  useEffect(() => {
    if (handleClean === '') {
      setHandleState({ status: 'idle' });
      return;
    }
    if (!isValidHandleFormat(handleClean)) {
      setHandleState({ status: 'unavailable', message: handleReasonMessage('INVALID') });
      return;
    }
    setHandleState({ status: 'checking' });
    const t = setTimeout(async () => {
      try {
        const r = await checkHandle(handleClean);
        setExistingBusiness(false);
        setHandleState(
          r.available
            ? { status: 'available' }
            : r.reason === 'BUSINESS'
              ? { status: 'business' }
              : { status: 'unavailable', message: handleReasonMessage(r.reason) },
        );
      } catch {
        setHandleState({ status: 'unavailable', message: 'Não foi possível verificar. Tente novamente.' });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [handleClean]);

  function onPickDoc(key: DocKey, file: File | undefined) {
    if (!file) return;
    let error: string | null = null;
    const okType = DOC_MIME.includes(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!okType) error = 'Formato inválido. Use PDF, JPG ou PNG.';
    else if (file.size > MAX_DOC_BYTES) error = 'Ficheiro demasiado grande (máx. 5MB).';
    setDocs((d) => ({
      ...d,
      [key]: error ? { file: null, name: '', error } : { file, name: file.name, error: null, sandbox: false },
    }));
  }

  // Bring the form panel — not the top of the page — into view. On a phone the
  // introduction column sits above the form, so scrolling to the top left the
  // next step, and the "Candidatura enviada" confirmation, a long scroll away.
  function showPanel() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('candidatura-panel');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function go(next: number) {
    showPanel();
    setStep(Math.max(1, Math.min(3, next)));
  }

  async function onSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    // Each field maps to its own structured column (no folding into free-text).
    // "Outros" category sends the typed description as the category.
    const finalCategory = category === OUTROS ? (categoryOther.trim() || OUTROS) : category;

    const input: ApplicationInput = {
      desired_handle: handleClean,
      business_name: name.trim(),
      category: finalCategory || undefined,
      subcategory: subcategory || undefined,
      email: email.trim(),
      phone: phone.trim() ? `+244 ${phone.trim()}` : undefined,
      nif: nif.trim() || undefined,
      country: 'Angola',
      province: provincia || undefined,
      municipality: municipio || undefined,
      city: cidade.trim() || undefined,
      address: endereco.trim() || undefined,
      address_reference: referencia.trim() || undefined,
      legal_representative: repNome.trim() || undefined,
      representative_role: cargo || undefined,
      representative_email: emailPessoal.trim() || undefined,
      representative_phone: telPessoal.trim() ? `+244 ${telPessoal.trim()}` : undefined,
      business_activity: descricao.trim() || undefined,
      estimated_volume: volume || undefined,
      terms_accepted: accepted,
      existing_business: handleState.status === 'business' && existingBusiness,
    };

    // A request the browser never completes (offline, a refused preflight)
    // rejects instead of returning a status. Without this the button stayed on
    // "A enviar…" forever. The idempotency key is kept, so trying again cannot
    // create a second application.
    const r = await submitApplication(input, idempotencyKey).catch((): SubmitResult => ({ ok: false, status: 0 }));
    setSubmitting(false);
    if (r.ok) {
      showPanel();
      setSubmitted(true);
      if (r.applicationId) {
        setApplicationId(r.applicationId);
        void uploadAllDocs(r.applicationId);
      }
    } else if (r.status === 409) {
      setHandleState({ status: 'unavailable', message: 'Este @negócio já não está disponível.' });
      setSubmitError('O @negócio escolhido já não está disponível. Volte ao passo 1 e escolha outro.');
    } else if (r.status === 0) {
      setSubmitError('Sem ligação ao Banzami. A candidatura não foi enviada — tente novamente.');
    } else {
      setSubmitError('Não foi possível enviar a candidatura. Verifique os dados e tente novamente.');
    }
  }

  // Upload one document and reflect its status. Returns false to stop the run
  // (storage not configured — never fakes success).
  async function uploadOne(appId: string, key: DocKey): Promise<boolean> {
    const def = DOC_DEFS.find((d) => d.key === key)!;
    const file = docs[key].file;
    if (!file) return true;
    setDocUpload((p) => ({ ...p, [key]: { status: 'uploading' } }));
    const res = await uploadKybDocument(appId, def.type, file);
    if (res.ok) {
      setDocUpload((p) => ({ ...p, [key]: { status: 'done' } }));
      return true;
    }
    if (res.reason === 'NOT_CONFIGURED') {
      setStorageNotConfigured(true);
      setDocUpload((p) => ({ ...p, [key]: { status: 'pending' } }));
      return false;
    }
    setDocUpload((p) => ({ ...p, [key]: { status: 'error', message: res.message } }));
    return true;
  }

  // While a document is still on its way, closing the tab would lose it with no
  // word to the applicant: the browser is asked to confirm first.
  const uploadingNow = Object.values(docUpload).some((u) => u?.status === 'uploading');
  useEffect(() => {
    if (!uploadingNow) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploadingNow]);

  async function uploadAllDocs(appId: string) {
    for (const d of DOC_DEFS) {
      const keepGoing = await uploadOne(appId, d.key);
      if (!keepGoing) break; // storage not configured — stop, don't fake the rest
    }
  }

  // ---- Validation ---------------------------------------------------------
  const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
  const phoneOk = (s: string) => /^\d{9}$/.test(s.replace(/\D/g, ''));
  const nifOk = (s: string) => /^\d{9,14}$/.test(s.replace(/\D/g, ''));
  const docsComplete = DOC_DEFS.filter((d) => !d.optional).every((d) => !!docs[d.key].name);

  const errors = {
    name: name.trim() ? null : 'Indique o nome do negócio.',
    handle: !handleClean
      ? 'Escolha o seu @negócio.'
      : !isValidHandleFormat(handleClean)
        ? 'Use 3 a 30 caracteres: letras minúsculas, números ou _.'
        : handleState.status === 'available' || (handleState.status === 'business' && existingBusiness)
          ? null
          : handleState.status === 'business'
            ? 'Este @negócio pertence a uma Business Account existente. Se é sua, confirme abaixo para a regularizar.'
          : handleState.status === 'checking'
            ? 'A verificar disponibilidade…'
            : handleState.status === 'unavailable'
              ? handleState.message
              : 'Este @negócio não está disponível.',
    category: category ? null : 'Selecione a categoria.',
    categoryOther: category === OUTROS && !categoryOther.trim() ? 'Descreva a categoria do seu negócio.' : null,
    phone: phoneOk(phone) ? null : 'Telefone inválido — 9 dígitos (ex: 923 456 789).',
    email: emailOk(email) ? null : 'Email inválido.',
    provincia: provincia ? null : 'Selecione a província.',
    municipio: municipio ? null : 'Selecione o município.',
    cidade: cidade.trim() ? null : 'Indique a cidade, bairro ou zona.',
    endereco: endereco.trim() ? null : 'Indique o endereço do negócio.',
    repNome: repNome.trim() ? null : 'Indique o nome do responsável.',
    nif: nifOk(nif) ? null : 'NIF inválido — apenas dígitos.',
    cargo: cargo ? null : 'Selecione o cargo.',
    emailPessoal: !emailPessoal.trim() || emailOk(emailPessoal) ? null : 'Email pessoal inválido.',
    telPessoal: !telPessoal.trim() || phoneOk(telPessoal) ? null : 'Telefone pessoal inválido.',
    descricao: descricao.trim() ? null : 'Descreva brevemente a atividade do negócio.',
    volume: volume ? null : 'Selecione o volume mensal estimado.',
    docs: docsComplete ? null : 'Envie os documentos obrigatórios.',
    accepted: accepted ? null : 'Tem de aceitar os termos e condições.',
  };
  const step1Valid = Object.values(errors).every((e) => e === null);
  const show1 = !!tried[1];
  const show2 = !!tried[2];

  function focusFirstError() {
    if (typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      const el = document.querySelector('[data-invalid="true"]');
      if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function onPrimary() {
    if (step === 1) {
      if (!step1Valid) {
        setTried((t) => ({ ...t, 1: true }));
        focusFirstError();
        return;
      }
      go(2);
    } else if (step === 2) {
      if (!docsComplete) {
        setTried((t) => ({ ...t, 2: true }));
        return;
      }
      go(3);
    } else {
      // Step 3 — final guard: if anything regressed, send the user back.
      if (!step1Valid || !docsComplete) {
        setTried({ 1: true, 2: true });
        go(1);
        return;
      }
      onSubmit();
    }
  }

  const showFooter = !(step === 3 && submitted);
  const primaryLabel = step === 3 ? 'Submeter candidatura' : 'Continuar';
  const dash = (v: string) => (v ? v : '—');

  return (
    <>
      {/* TOP BAR */}
      <div className="mb-[26px] flex items-center justify-between gap-4">
        <Link
          href="/comerciantes"
          className="flex items-center gap-[11px] text-[22px] font-black tracking-[-0.02em] text-[#2a2024] no-underline"
        >
          <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-[#B5101F] shadow-[0_6px_14px_-4px_rgba(181,16,31,0.5)]">
            {Ic.logo}
          </span>
          Banzami
        </Link>
        <div className="flex items-center gap-[11px]">
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] bg-white shadow-[0_4px_14px_-8px_rgba(181,16,31,0.4)]">
            {Ic.shield(RED, 20)}
          </span>
          <div className="leading-[1.25]">
            <div className="text-[14px] font-extrabold text-[#2a2024]">Seguro e confiável</div>
            <div className="text-[12.5px] font-semibold text-[#9a8a8e]">Os seus dados estão protegidos</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[330px_1fr] items-start gap-[30px] max-[980px]:grid-cols-1">
        {/* SIDEBAR */}
        <aside className="sticky top-6 flex flex-col gap-[22px] max-[980px]:static">
          <div>
            <span className="mb-[18px] inline-flex items-center gap-[7px] rounded-[30px] bg-[#FBD2D0] px-[14px] py-[7px] text-[12.5px] font-extrabold text-[#9A1B22]">
              <span className="h-[7px] w-[7px] rounded-full bg-[#B5101F]" />
              Banzami Business
            </span>
            <h1 className="m-0 text-[34px] font-black leading-[1.06] tracking-[-0.02em]">
              Crie a sua conta Business em minutos
            </h1>
            <p className="m-0 mt-4 text-[15.5px] font-semibold leading-[1.55] text-[#6a5a5e]">
              Simples. Rápido. 100% online. Tudo o que precisa para começar a aceitar pagamentos.
            </p>
          </div>

          <div className="flex flex-col gap-[18px]">
            {[
              { icon: Ic.bolt, title: 'Rápido', text: 'Registe o seu negócio em menos de 5 minutos' },
              { icon: Ic.shield(RED, 20), title: 'Seguro', text: 'Os seus dados estão protegidos com encriptação de ponta a ponta' },
              { icon: Ic.card, title: 'Feito para Angola', text: 'Desenhado para comerciantes e empresas angolanas' },
            ].map((f) => (
              <div key={f.title} className="flex gap-[13px]">
                <span className="flex h-[40px] w-[40px] flex-none items-center justify-center rounded-[12px] bg-[#FFF1F0]">
                  {f.icon}
                </span>
                <div>
                  <div className="text-[15.5px] font-extrabold">{f.title}</div>
                  <div className="mt-0.5 text-[13.5px] font-semibold leading-[1.45] text-[#7a6a6e]">{f.text}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[18px] border-[1.5px] border-[#f4e6e6] bg-white p-5">
            <div className="mb-[13px] text-[13.5px] font-black text-[#2a2024]">Vai precisar de:</div>
            <div className="flex flex-col gap-[9px]">
              {['Registo Comercial', 'Documento de identidade (BI ou Passaporte)', 'NIF da empresa'].map((t) => (
                <div key={t} className="flex items-center gap-[9px] text-[13.5px] font-bold text-[#5a4a4e]">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke={RED} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t}
                </div>
              ))}
            </div>
            <p className="m-0 mt-[14px] text-[12.5px] font-semibold leading-[1.5] text-[#9a8a8e]">
              Documentos em formato PDF, JPG ou PNG. Máx. 5MB por ficheiro.
            </p>
          </div>

          <div className="rounded-[18px] bg-[#FFF1F0] p-5">
            <div className="mb-1.5 text-[14.5px] font-black text-[#9A1B22]">Precisa de ajuda?</div>
            <p className="m-0 mb-3 text-[13.5px] font-semibold leading-[1.5] text-[#7a6a6e]">
              A nossa equipa está pronta para ajudar.
            </p>
            <a
              href="mailto:contact@banzami.com?subject=Apoio%20Banzami%20Business"
              className="inline-flex items-center gap-2 text-[14px] font-extrabold text-[#B5101F] no-underline"
            >
              {Ic.headset}
              Contactar suporte
            </a>
          </div>
        </aside>

        {/* RIGHT PANEL */}
        <main id="candidatura-panel" className="scroll-mt-4 overflow-hidden rounded-[26px] bg-white shadow-[0_30px_80px_-50px_rgba(181,16,31,0.4)]">
          <div className="px-[38px] pb-[14px] pt-[34px]">
            <Stepper step={step} />
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="px-[38px] pt-2">
              <section className="border-b-[1.5px] border-[#f6eded] py-[18px] pb-[30px]">
                <SectionHead
                  icon={Ic.store}
                  title="Sobre o seu negócio"
                  subtitle="Informações básicas da sua empresa."
                  action={isSandbox ? <SbxFillButton label="Usar dados de teste" onClick={fillNegocioSection} /> : undefined}
                />
                <div className="grid grid-cols-2 gap-x-5 gap-y-[18px] max-[980px]:grid-cols-1">
                  <Field label="Nome do negócio" error={show1 ? errors.name : null}>
                    <input className={inputClass(show1 && !!errors.name)} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Cantina do Alex" />
                  </Field>
                  <Field label="@negócio desejado" error={show1 ? errors.handle : null}>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[15px] font-semibold text-[#9a8a8e]">@</span>
                      <input
                        className={`w-full rounded-[14px] border-[1.5px] ${
                          show1 && !!errors.handle ? ERR_BORDER : OK_BORDER
                        } bg-white py-3.5 pl-8 pr-[110px] font-mono text-[15px] font-semibold text-[#2a2024] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#bca9ab] focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10`}
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder="cantina_alex"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      <HandleBadge state={handleState} />
                    </div>
                    {handleState.status === 'business' && (
                      <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 rounded-[12px] border-[1.5px] border-[#f1d9a8] bg-[#FFF8EC] p-3 text-[13px] font-bold leading-[1.5] text-[#7a5a1e]">
                        <input type="checkbox" className="mt-0.5" checked={existingBusiness} onChange={(e) => setExistingBusiness(e.target.checked)} />
                        <span>
                          @{handleClean} já é uma Business Account no Banzami. Se é o seu negócio, confirme para regularizar essa
                          conta com os documentos da empresa. Nada novo é criado: a equipa Banzami verifica e associa a candidatura à
                          conta existente.
                        </span>
                      </label>
                    )}
                  </Field>
                  <Field label="Categoria do negócio" error={show1 ? errors.category : null}>
                    <Select value={category} onChange={onChangeCategoria} placeholder="Selecione uma categoria" options={CATEGORIES} error={show1 && !!errors.category} />
                  </Field>
                  {category === OUTROS ? (
                    <Field label="Descreva a categoria" error={show1 ? errors.categoryOther : null}>
                      <input className={inputClass(show1 && !!errors.categoryOther)} value={categoryOther} onChange={(e) => setCategoryOther(e.target.value)} placeholder="Ex: Aluguer de equipamento de eventos" />
                    </Field>
                  ) : (
                    <Field label="Subcategoria" optional>
                      <Select
                        value={subcategory}
                        onChange={setSubcategory}
                        placeholder={category ? 'Selecione uma subcategoria' : 'Selecione primeiro a categoria'}
                        options={subcategoriasDisponiveis}
                      />
                    </Field>
                  )}
                  <Field label="Telefone" error={show1 ? errors.phone : null}>
                    <PhoneField value={phone} onChange={setPhone} error={show1 && !!errors.phone} />
                  </Field>
                  <Field label="Email" error={show1 ? errors.email : null}>
                    <input className={inputClass(show1 && !!errors.email)} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ex: contacto@seudominio.co.ao" inputMode="email" />
                  </Field>
                </div>
              </section>

              <section className="border-b-[1.5px] border-[#f6eded] py-[28px] pb-[30px]">
                <SectionHead
                  icon={Ic.pin}
                  title="Localização"
                  subtitle="Onde o seu negócio está localizado."
                  action={isSandbox ? <SbxFillButton label="Usar dados de teste" onClick={fillLocalizacaoSection} /> : undefined}
                />
                <div className="grid grid-cols-3 gap-x-5 gap-y-[18px] max-[980px]:grid-cols-1">
                  <Field label="Província" error={show1 ? errors.provincia : null}>
                    <Select value={provincia} onChange={onChangeProvincia} placeholder="Selecione" options={PROVINCIAS} error={show1 && !!errors.provincia} />
                  </Field>
                  <Field label="Município" error={show1 ? errors.municipio : null}>
                    <Select
                      value={municipio}
                      onChange={onChangeMunicipio}
                      placeholder={provincia ? 'Selecione' : 'Selecione a província'}
                      options={municipiosDisponiveis}
                      error={show1 && !!errors.municipio}
                    />
                  </Field>
                  <Field label="Cidade / bairro / zona" error={show1 ? errors.cidade : null}>
                    <input
                      className={inputClass(show1 && !!errors.cidade)}
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      placeholder="Ex: Talatona"
                      list="cidade-sugestoes"
                      autoComplete="off"
                    />
                    <datalist id="cidade-sugestoes">
                      {cidadesSugeridas.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </Field>
                </div>
                <div className="mt-[18px]">
                  <Field label="Endereço do negócio" error={show1 ? errors.endereco : null}>
                    <input className={inputClass(show1 && !!errors.endereco)} value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Ex: Rua Direita do Kilamba, Bairro Talatona" />
                  </Field>
                </div>
                <div className="mt-[18px]">
                  <Field label="Referência" optional>
                    <input className={inputClass()} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ex: Próximo ao supermercado X" />
                  </Field>
                </div>
              </section>

              <section className="py-[28px] pb-[30px]">
                <SectionHead
                  icon={Ic.personLg}
                  title="Responsável legal"
                  subtitle="Pessoa responsável pelo negócio."
                  action={isSandbox ? <SbxFillButton label="Usar dados de teste" onClick={fillResponsavelSection} /> : undefined}
                />
                <div className="grid grid-cols-2 gap-x-5 gap-y-[18px] max-[980px]:grid-cols-1">
                  <Field label="Nome completo" error={show1 ? errors.repNome : null}>
                    <input className={inputClass(show1 && !!errors.repNome)} value={repNome} onChange={(e) => setRepNome(e.target.value)} placeholder="Ex: João da Silva" />
                  </Field>
                  <Field label="NIF da Empresa" error={show1 ? errors.nif : null}>
                    <input className={inputClass(show1 && !!errors.nif)} value={nif} onChange={(e) => setNif(e.target.value)} placeholder="Ex: 5001234567" inputMode="numeric" />
                  </Field>
                </div>
                <div className="mt-[18px] grid grid-cols-3 gap-x-5 gap-y-[18px] max-[980px]:grid-cols-1">
                  <Field label="Cargo no negócio" error={show1 ? errors.cargo : null}>
                    <Select value={cargo} onChange={setCargo} placeholder="Selecione o cargo" options={CARGOS} error={show1 && !!errors.cargo} />
                  </Field>
                  <Field label="Email pessoal" error={show1 ? errors.emailPessoal : null}>
                    <input className={inputClass(show1 && !!errors.emailPessoal)} value={emailPessoal} onChange={(e) => setEmailPessoal(e.target.value)} placeholder="Ex: joao.silva@email.com" inputMode="email" />
                  </Field>
                  <Field label="Telefone pessoal" error={show1 ? errors.telPessoal : null}>
                    <PhoneField value={telPessoal} onChange={setTelPessoal} compact flagW={20} flagH={14} error={show1 && !!errors.telPessoal} />
                  </Field>
                </div>
              </section>

              <section className="border-b-[1.5px] border-[#f6eded] py-[28px] pb-[30px]">
                <SectionHead
                  icon={Ic.card}
                  title="Atividade do negócio"
                  subtitle="Ajuda-nos a conhecer o seu negócio."
                  action={isSandbox ? <SbxFillButton label="Usar dados de teste" onClick={fillAtividadeSection} /> : undefined}
                />
                <div className="grid grid-cols-1 gap-x-5 gap-y-[18px]">
                  <Field label="Descrição curta do negócio" error={show1 ? errors.descricao : null}>
                    <input className={inputClass(show1 && !!errors.descricao)} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Cantina com refeições e bebidas para levar" />
                  </Field>
                  <Field label="Volume mensal estimado" error={show1 ? errors.volume : null}>
                    <Select value={volume} onChange={setVolume} placeholder="Selecione uma faixa (Kz)" options={VOLUME_FAIXAS} error={show1 && !!errors.volume} />
                  </Field>
                </div>
              </section>

              {/* DOCUMENTOS */}
              <section className="mb-2 scroll-mt-24 rounded-[20px] bg-[#FFF7F6] p-[26px]" data-invalid={show1 && !!errors.docs ? 'true' : undefined}>
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-[14px]">
                    <span className="flex h-[44px] w-[44px] flex-none items-center justify-center rounded-[13px] bg-white">
                      {Ic.docLg}
                    </span>
                    <div>
                      <h2 className="m-0 text-[19px] font-black tracking-[-0.01em]">Documentos necessários</h2>
                      <p className="m-0 mt-0.5 text-[13.5px] font-semibold text-[#9a8a8e]">
                        Para analisar a candidatura, precisamos apenas dos documentos essenciais da empresa.
                      </p>
                    </div>
                  </div>
                  {isSandbox && <SbxFillButton label="Gerar documentos sandbox" onClick={fillDocumentosSection} />}
                </div>
                <div className="grid grid-cols-3 gap-[14px] max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
                  {DOC_DEFS.map((d) => {
                    const st = docs[d.key];
                    const up = !!st.name;
                    return (
                      <label
                        key={d.key}
                        className="flex cursor-pointer flex-col gap-[10px] rounded-[16px] border-[1.5px] bg-white p-4 transition-[border-color,box-shadow] duration-150 hover:border-[#f0c9c9] hover:shadow-[0_8px_22px_-14px_rgba(181,16,31,0.3)]"
                        style={{ borderColor: st.error ? '#e8a3a3' : up ? '#bfe6cd' : (show1 && !d.optional) ? '#e8a3a3' : '#f1e3e3' }}
                      >
                        <input
                          type="file"
                          accept={DOC_ACCEPT}
                          className="hidden"
                          onChange={(e) => onPickDoc(d.key, e.target.files?.[0])}
                        />
                        <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#FFF1F0]">
                          {docTileIcon(d.icon)}
                        </span>
                        <div>
                          <div className="text-[13.5px] font-extrabold leading-[1.25]">{d.label}</div>
                          <div className="mt-0.5 text-[12px] font-bold text-[#b09498]">{d.optional ? 'Opcional' : 'Obrigatório'}</div>
                          {d.hint && <div className="mt-0.5 text-[11.5px] font-semibold leading-[1.3] text-[#b09498]">{d.hint}</div>}
                        </div>
                        {st.error ? (
                          <span className="text-[12.5px] font-bold text-[#B5101F]">{st.error}</span>
                        ) : up ? (
                          <span className="flex flex-col gap-1">
                            <span className="inline-flex max-w-full items-center gap-[6px] overflow-hidden text-[12.5px] font-extrabold text-[#1f9d57]">
                              {Ic.circleCheck(GREEN, 15)}
                              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                                {st.sandbox ? 'Documento sandbox pronto' : st.name}
                              </span>
                            </span>
                            {st.sandbox && <SandboxBadge />}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-[6px] text-[13px] font-extrabold text-[#B5101F]">
                            {Ic.upload}
                            Enviar ficheiro
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {show1 && errors.docs && (
                  <p className="mt-3 text-[13px] font-semibold text-[#B5101F]">{errors.docs}</p>
                )}
              </section>

              {/* TERMOS */}
              <div className="scroll-mt-24 pt-[22px]" data-invalid={show1 && !!errors.accepted ? 'true' : undefined}>
                <div className="flex items-center gap-[11px] px-0.5 pb-1">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={accepted}
                    aria-label="Aceito os termos e condições"
                    onClick={() => setAccepted((a) => !a)}
                    className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] border-2 transition-all duration-150"
                    style={{ borderColor: show1 && errors.accepted ? '#e8a3a3' : accepted ? RED : '#d8c6c8', background: accepted ? RED : '#fff' }}
                  >
                    {accepted && Ic.check('#fff', 3, 14)}
                  </button>
                  <span className="text-[14.5px] font-semibold text-[#5a4a4e]">
                    <span className="cursor-pointer" onClick={() => setAccepted((a) => !a)}>
                      Li e aceito os{' '}
                    </span>
                    <Link href="/suporte" className="font-extrabold text-[#B5101F] underline">
                      termos e condições
                    </Link>
                    <span className="cursor-pointer" onClick={() => setAccepted((a) => !a)}>
                      {' '}
                      do Banzami Business
                    </span>
                  </span>
                </div>
                {show1 && errors.accepted && (
                  <p className="mt-1.5 text-[13px] font-semibold text-[#B5101F]">{errors.accepted}</p>
                )}
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="px-[38px] pt-2">
              <section className="py-[18px] pb-[30px]">
                <div className="mb-2 flex items-center gap-[14px]">
                  <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px] bg-[#FFF1F0]">
                    {Ic.docLg}
                  </span>
                  <div>
                    <h2 className="m-0 text-[20px] font-black">Confirme os seus documentos</h2>
                    <p className="m-0 mt-0.5 text-[14px] font-semibold text-[#9a8a8e]">
                      Verifique se todos os ficheiros estão enviados e nítidos.
                    </p>
                  </div>
                </div>
                {isSandbox && (
                  <div className="mt-3 rounded-[12px] border-[1.5px] border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] font-bold text-amber-800">
                    Sandbox — pode enviar documentos de teste. Não serão usados para uma conta real.
                  </div>
                )}
                <div className="mt-[22px] flex flex-col gap-3">
                  {DOC_DEFS.map((d) => {
                    const st = docs[d.key];
                    const up = !!st.name;
                    return (
                      <label
                        key={d.key}
                        className="flex cursor-pointer items-center gap-4 rounded-[16px] border-[1.5px] bg-[#FFF7F6] px-[18px] py-4 transition-[border-color] duration-150 hover:border-[#f0c9c9]"
                        style={{ borderColor: st.error ? '#e8a3a3' : up ? '#bfe6cd' : (show2 && !d.optional) ? '#e8a3a3' : '#f1e3e3' }}
                      >
                        <input
                          type="file"
                          accept={DOC_ACCEPT}
                          className="hidden"
                          onChange={(e) => onPickDoc(d.key, e.target.files?.[0])}
                        />
                        <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px] bg-[#FFF1F0]">
                          {docTileIcon(d.icon)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[15px] font-extrabold">
                            {d.label}
                            {d.optional && <span className="ml-2 text-[12px] font-bold text-[#b09498]">Opcional</span>}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[13px] font-bold text-[#9a8a8e]">
                            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                              {st.error || (up ? (st.sandbox ? 'Documento sandbox pronto' : st.name) : (d.hint ?? 'Toque para enviar (PDF, JPG ou PNG)'))}
                            </span>
                            {st.sandbox && <SandboxBadge />}
                          </div>
                        </div>
                        {up ? (
                          <span className="inline-flex flex-none items-center gap-[6px] rounded-[30px] bg-[#eafaf0] px-[14px] py-2 text-[13px] font-extrabold text-[#1f9d57]">
                            {Ic.check(GREEN, 2.6, 15)}
                            Enviado
                          </span>
                        ) : (
                          <span className="flex-none rounded-[30px] bg-[#FFF1F0] px-4 py-2 text-[13px] font-extrabold text-[#B5101F]">
                            Enviar
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {show2 && !docsComplete && (
                  <p className="mt-3 text-[13px] font-semibold text-[#B5101F]">
                    Envie os documentos obrigatórios para continuar.
                  </p>
                )}
              </section>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="px-[38px] pt-2">
              {submitted ? (
                <div className="mx-auto max-w-[460px] py-10 pb-[60px] text-center">
                  <div className="mx-auto mb-6 flex h-[84px] w-[84px] items-center justify-center rounded-full bg-[#FFF1F0]">
                    {Ic.check(RED, 2.4, 42)}
                  </div>
                  <h2 className="m-0 text-[28px] font-black tracking-[-0.02em]">Candidatura enviada</h2>
                  {isSandbox && (
                    <div className="mx-auto mt-4 max-w-[440px] rounded-[12px] border-[1.5px] border-amber-300 bg-amber-50 px-4 py-2.5 text-[13.5px] font-bold text-amber-800">
                      Candidatura enviada para <span className="font-black">SANDBOX</span> — ambiente de teste. Não é uma conta Business real.
                    </div>
                  )}
                  <p className="m-0 mt-[14px] text-[16px] font-semibold leading-[1.55] text-[#6a5a5e]">
                    A equipa Banzami vai analisar os dados e documentos do seu negócio. Se for aprovado, receberá um
                    link de ativação no email indicado para definir o PIN de acesso à sua Conta Business.
                  </p>
                  {/* The whole reference, exactly as the status page takes it.
                      Eight characters of it were shown here, and the status page
                      looks an application up only by the full id — and no email
                      carries it, so this screen is the one place it is given. */}
                  {applicationId && (
                    <div className="mx-auto mt-4 max-w-[440px] rounded-[12px] border-[1.5px] border-[#f4e6e6] bg-white px-4 py-3">
                      <p className="m-0 text-[13px] font-bold text-[#9a8a8e]">Referência da candidatura</p>
                      <p
                        data-testid="application-reference"
                        className="m-0 mt-1 select-all break-all font-mono text-[14px] font-extrabold text-[#5a4a4e]"
                      >
                        {applicationId}
                      </p>
                      <p className="m-0 mt-2 text-[12.5px] font-semibold text-[#9a8a8e]">
                        Guarde esta referência: é com ela que acompanha o estado da candidatura.
                      </p>
                    </div>
                  )}
                  {applicationId && (
                    <p className="m-0 mt-2 text-[13px] font-bold">
                      <Link
                        data-testid="application-status-link"
                        href={`/comerciantes/candidatura/estado?ref=${applicationId}`}
                        className="font-extrabold"
                        style={{ color: RED }}
                      >
                        Acompanhar o estado da candidatura →
                      </Link>
                    </p>
                  )}

                  <div className="mx-auto mt-7 max-w-[400px] rounded-[16px] border-[1.5px] border-[#f4e6e6] bg-white p-5 text-left">
                    <div className="flex items-center justify-between gap-3 text-[14px] font-bold text-[#5a4a4e]">
                      <span className="text-[#9a8a8e]">{existingBusiness ? '@negócio a regularizar' : '@negócio reservado'}</span>
                      <span className="font-mono font-extrabold text-[#B5101F]">@{handleDisplay}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[14px] font-bold text-[#5a4a4e]">
                      <span className="text-[#9a8a8e]">Email de contacto</span>
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-extrabold text-[#2a2024]">{email || '—'}</span>
                    </div>
                  </div>

                  <div className="mx-auto mt-4 max-w-[400px] rounded-[16px] bg-[#FFF7F6] p-5 text-left">
                    <div className="mb-3 text-[12px] font-black tracking-[0.05em] text-[#9A1B22]">PRÓXIMOS PASSOS</div>
                    <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                      {['Análise da candidatura e documentos', 'Aprovação pela equipa Banzami', 'Ativação da conta e definição do PIN', 'Começar a receber pagamentos'].map((s, i) => (
                        <li key={s} className="flex items-center gap-[11px] text-[13.5px] font-bold text-[#5a4a4e]">
                          <span className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-full bg-[#FFF1F0] text-[12px] font-black text-[#B5101F]">
                            {i + 1}
                          </span>
                          {s}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* KYB document upload status (Track 3). */}
                  <div className="mx-auto mt-7 max-w-[400px] rounded-[16px] bg-[#FFF7F6] p-5 text-left">
                    <div className="mb-3 text-[12px] font-black tracking-[0.05em] text-[#9A1B22]">DOCUMENTOS</div>
                    {storageNotConfigured ? (
                      <p className="m-0 text-[13.5px] font-semibold leading-[1.5] text-[#7a6a6e]">
                        O envio de documentos ainda não está disponível. A nossa equipa irá solicitar os
                        documentos durante a fase de verificação.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {DOC_DEFS.map((d) => {
                          const u = docUpload[d.key];
                          return (
                            <div key={d.key} className="flex items-center justify-between gap-3 text-[13.5px] font-bold text-[#5a4a4e]">
                              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{d.label}</span>
                              {u.status === 'done' ? (
                                <span className="inline-flex flex-none items-center gap-[5px] text-[12.5px] font-extrabold text-[#1f9d57]">
                                  {Ic.circleCheck(GREEN, 15)} Recebido
                                </span>
                              ) : u.status === 'uploading' ? (
                                <span className="flex-none text-[12.5px] font-extrabold text-[#9a8a8e]">A enviar…</span>
                              ) : u.status === 'error' ? (
                                <button
                                  type="button"
                                  onClick={() => applicationId && uploadOne(applicationId, d.key)}
                                  className="flex-none text-[12.5px] font-extrabold text-[#B5101F] underline"
                                >
                                  Tentar novamente
                                </button>
                              ) : (
                                <span className="flex-none text-[12.5px] font-extrabold text-[#9a8a8e]">Pendente</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Link
                    href="/comerciantes"
                    className="mt-7 inline-flex items-center gap-2 rounded-[40px] bg-[#B5101F] px-[30px] py-[15px] text-[15px] font-extrabold text-white no-underline shadow-[0_14px_30px_-10px_rgba(181,16,31,0.5)]"
                  >
                    Voltar ao início
                  </Link>
                </div>
              ) : (
                <section className="py-[18px] pb-6">
                  <div className="mb-[22px] flex items-center gap-[14px]">
                    <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px] bg-[#FFF1F0]">
                      {Ic.search}
                    </span>
                    <div>
                      <h2 className="m-0 text-[20px] font-black">Reveja antes de enviar</h2>
                      <p className="m-0 mt-0.5 text-[14px] font-semibold text-[#9a8a8e]">Confirme que está tudo correto.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-[14px] max-[980px]:grid-cols-1">
                    <ReviewCard title="NEGÓCIO">
                      <ReviewRow label="Nome" value={dash(name)} />
                      <ReviewRow label="@negócio" mono value={`@${handleDisplay}`} />
                      <ReviewRow label="Categoria" value={dash(category === OUTROS ? categoryOther : category)} />
                      <ReviewRow label="Subcategoria" value={dash(subcategory)} />
                      <ReviewRow label="Atividade" value={dash(descricao)} />
                      <ReviewRow label="Volume mensal" value={dash(volume)} />
                      <ReviewRow label="Telefone" value={phone ? `+244 ${phone}` : '—'} />
                      <ReviewRow label="Email" value={dash(email)} />
                    </ReviewCard>
                    <ReviewCard title="LOCALIZAÇÃO & RESPONSÁVEL">
                      <ReviewRow label="Província" value={dash(provincia)} />
                      <ReviewRow label="Município" value={dash(municipio)} />
                      <ReviewRow label="Cidade / zona" value={dash(cidade)} />
                      <ReviewRow label="Endereço" value={dash(endereco)} />
                      <ReviewRow label="Responsável" value={dash(repNome)} />
                      <ReviewRow label="NIF da Empresa" value={dash(nif)} />
                      <ReviewRow label="Cargo" value={dash(cargo)} />
                    </ReviewCard>
                  </div>

                  <div className="mt-[14px] rounded-[16px] bg-[#FFF7F6] p-5">
                    <div className="mb-3 text-[12px] font-black tracking-[0.05em] text-[#9A1B22]">DOCUMENTOS</div>
                    <div className="grid grid-cols-2 gap-[10px] max-[980px]:grid-cols-1">
                      {DOC_DEFS.map((d) => {
                        const up = !!docs[d.key].name;
                        return (
                          <div key={d.key} className="flex items-center gap-[9px] text-[13.5px] font-bold text-[#5a4a4e]">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-none">
                              <circle cx="12" cy="12" r="9" stroke={up ? GREEN : '#c9a3a6'} strokeWidth="1.8" />
                              {up && (
                                <path d="M8.5 12l2.2 2.2L15.5 9.5" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              )}
                            </svg>
                            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{d.label}</span>
                            <span className="text-[12.5px] font-extrabold" style={{ color: up ? GREEN : '#b09498' }}>
                              {up ? 'Enviado' : 'Em falta'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {submitError && (
                    <div className="mt-4 rounded-[14px] border-[1.5px] border-[#B5101F]/30 bg-[#B5101F]/[0.06] px-4 py-3 text-[14px] font-semibold text-[#B5101F]">
                      {submitError}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* FOOTER BAR */}
          {showFooter && (
            <div className="flex items-center justify-between gap-4 border-t-[1.5px] border-[#f6eded] bg-white px-[38px] py-[22px] max-[560px]:flex-col max-[560px]:items-stretch">
              <div className="flex items-center gap-[11px]">
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] bg-[#FFF1F0]">{Ic.lock}</span>
                <div className="leading-[1.3]">
                  <div className="text-[13.5px] font-extrabold">Os seus dados estão protegidos</div>
                  <div className="text-[12.5px] font-semibold text-[#9a8a8e]">Encriptação de ponta a ponta</div>
                </div>
              </div>
              <div className="flex items-center gap-3 max-[560px]:flex-col max-[560px]:items-stretch">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => go(step - 1)}
                    className="inline-flex items-center justify-center gap-2 rounded-[40px] border-[1.5px] border-[#f1e3e3] bg-white px-6 py-[15px] text-[15px] font-extrabold text-[#5a4a4e] transition-[background] duration-150 hover:bg-[#FFF7F6]"
                  >
                    ← Voltar
                  </button>
                )}
                <button
                  type="button"
                  onClick={onPrimary}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-[9px] rounded-[40px] bg-[#B5101F] px-[34px] py-4 text-[15.5px] font-extrabold text-white shadow-[0_14px_30px_-10px_rgba(181,16,31,0.5)] transition-[transform,background] duration-150 hover:-translate-y-0.5 hover:bg-[#9A1B22] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {submitting ? 'A enviar…' : `${primaryLabel} →`}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* SANDBOX autofill toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4" role="status" aria-live="polite">
          <div className="inline-flex items-center gap-2 rounded-[14px] bg-[#2a2024] px-5 py-3 text-[13.5px] font-extrabold text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)]">
            <span className="text-amber-300">{SparkIc}</span>
            {toast.msg}
          </div>
        </div>
      )}
    </>
  );
}

// --- Review helpers --------------------------------------------------------

function ReviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[16px] bg-[#FFF7F6] p-5">
      <div className="mb-3 text-[12px] font-black tracking-[0.05em] text-[#9A1B22]">{title}</div>
      <div className="flex flex-col gap-2 text-[14px] font-bold text-[#5a4a4e]">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-[14px]">
      <span className="text-[#9a8a8e]">{label}</span>
      <span className={mono ? 'font-mono text-[#B5101F]' : 'text-right text-[#2a2024]'}>{value}</span>
    </div>
  );
}

// --- Handle availability UI ------------------------------------------------

function HandleBadge({ state }: { state: HandleState }) {
  if (state.status === 'checking')
    return (
      <span className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#9a8a8e]">
        A verificar…
      </span>
    );
  if (state.status === 'available')
    return (
      <span className="absolute right-[14px] top-1/2 inline-flex -translate-y-1/2 items-center gap-[5px] text-[13px] font-extrabold text-[#1f9d57]">
        {Ic.circleCheck(GREEN, 16)}
        Disponível
      </span>
    );
  if (state.status === 'business')
    return (
      <span className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[12.5px] font-extrabold text-[#7a5a1e]">
        Conta existente
      </span>
    );
  if (state.status === 'unavailable')
    return (
      <span className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[15px] font-extrabold text-[#B5101F]">
        ✕
      </span>
    );
  return null;
}
