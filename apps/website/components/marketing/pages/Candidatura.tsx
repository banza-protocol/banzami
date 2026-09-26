'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Badge, H1, HeroLead, Small, Icon, type IconName } from '../kit';
import { Field, Check, FGrid, SubmitBtn, BackBtn, SuccessMark } from '../form-kit';
import { Reveal } from '@/components/Reveal';
import { getPlatformMode, submitApplication } from '@/lib/api';
import { TERMS, isTermsPublished } from '@/lib/terms';
import { route, type Lang } from '@/lib/marketing/nav';

/**
 * Comerciantes · Candidatura — Public Beta Sandbox business onboarding.
 *
 * The Sandbox rehearses the SAME journey the real-money product will use later —
 * business → responsible person → documents → confirm — so applicants experience
 * the full flow. It is FLOW parity, not REGULATORY parity: the Sandbox uses
 * synthetic/test data and canonical TEST document fixtures only (no arbitrary file
 * uploads, no real KYB, no real-money capability). The two document slots mirror
 * the LIVE KYB types (Registo Comercial + documento de identidade do
 * representante) but are attached as fixtures, kept separate from the real LIVE
 * KYB pipeline. Submits for real to POST /v1/merchant/applications and shows the
 * server-issued reference; the strict LIVE/KYB policy is unchanged. Frozen visual
 * system.
 */

const CONTENT: CSSProperties = { position: 'relative', maxWidth: '1140px', margin: '0 auto' };
type Errs = Record<string, string>;

// The two canonical KYB document types, mirrored in the Sandbox as fixtures. Same
// identifiers the LIVE policy (business_requirements.go) requires — flow parity —
// but attached as synthetic test fixtures, never real uploads.
const SANDBOX_DOCS = [
  { id: 'BUSINESS_REGISTRATION', field: 'doc_registo' as const },
  { id: 'REPRESENTATIVE_ID', field: 'doc_id' as const },
];

// ── copy ──────────────────────────────────────────────────────────────────
const T = {
  pt: {
    badge: 'Versão Beta · Sandbox',
    h1a: 'Registar o', h1b: 'negócio.',
    lead: 'Simule o processo completo de candidatura ao Banzami Business na Sandbox, com dados e documentos de teste.',
    smallPre: 'Já enviou? ', smallLink: 'Consulte o estado da candidatura', smallPost: '.',
    steps: ['Negócio', 'Responsável', 'Documentos', 'Confirmar'],
    of: (n: number) => `PASSO ${n} DE 4`,
    s1t: 'Dados do negócio', s1s: 'O essencial do negócio. Na Sandbox, utilize apenas dados de teste.',
    l_nome_comercial: 'Nome comercial', ph_nome_comercial: 'Cantina do Alex',
    l_handle: '@negócio', ph_handle: 'cantinadoalex', hint_handle: '3 a 30 letras minúsculas, dígitos ou _. É como recebe pagamentos.',
    l_categoria: 'Categoria', l_municipio: 'Município (opcional)', ph_municipio: 'Talatona',
    l_descricao: 'O que vende? (opcional)', ph_descricao: 'Refeições, bebidas…',
    l_email: 'E-mail de contacto', ph_email: 'alex@exemplo.ao',
    selectPh: 'Selecione…',
    categorias: ['Restauração', 'Comércio a retalho', 'Mercearia e alimentação', 'Serviços', 'Transporte', 'Educação', 'Saúde e beleza', 'Eventos', 'Outro'],
    continuar: 'Continuar',
    voltar: 'Voltar',
    // step 2 — responsável
    s2t: 'Responsável', s2s: 'Quem representa o negócio. Na Sandbox, utilize apenas dados de teste.',
    repWarn: 'Utilize apenas dados fictícios nesta Sandbox. Não introduza NIF, nomes, contactos ou documentos reais.',
    l_rep_nome: 'Nome do representante', ph_rep_nome: 'Alex Kiala',
    l_rep_papel: 'Cargo', ph_rep_papel: 'Sócio-gerente',
    l_rep_email: 'E-mail do representante', ph_rep_email: 'alex@exemplo.ao',
    l_rep_telefone: 'Telefone (opcional)', ph_rep_telefone: '+244 …',
    l_nif: 'NIF', ph_nif: '500…', hint_nif: 'Número de identificação fiscal do negócio.',
    // step 3 — documentos
    s3t: 'Documentos', s3s: 'Anexe os dois documentos necessários para simular a candidatura.',
    docWarn: 'Sandbox — utilize apenas documentos de teste. Não envie documentos pessoais ou empresariais reais.',
    doc1_t: 'Registo Comercial', doc1_d: 'Documento de registo do negócio.',
    doc2_t: 'Documento de identidade do representante', doc2_d: 'Identificação do representante do negócio.',
    docUseTest: 'Usar documento de teste', docLoaded: 'Documento de teste carregado',
    // step 4 — confirmar
    s4t: 'Confirmar', s4s: 'Reveja os dados antes de enviar.',
    sum: { negocio: 'Negócio', handle: '@negócio', categoria: 'Categoria', email: 'E-mail', rep: 'Representante', nif: 'NIF', docs: 'Documentos' },
    docsValue: 'Registo Comercial + Documento de identidade (teste)',
    confirmNote: 'Esta candidatura destina-se apenas à Sandbox e utiliza dados de teste.',
    enviar: 'Enviar candidatura',
    enviando: 'A enviar…',
    doneT: 'Candidatura enviada',
    donePre: 'Recebemos os dados de ', donePost: '. Guarde a referência para consultar o estado.',
    refLabel: 'Referência da candidatura',
    emailedPre: 'Enviaremos também esta referência para ', emailedPost: '.',
    verEstado: 'Ver estado da candidatura', nova: 'Nova candidatura',
    aside1: 'O que vai precisar',
    aside1rows: [
      { icon: 'store' as IconName, t: 'Dados do negócio', d: 'Nome, @negócio e categoria.' },
      { icon: 'user' as IconName, t: 'Responsável', d: 'Dados do representante.' },
      { icon: 'doc' as IconName, t: 'Documentos', d: 'Dois documentos de teste.' },
      { icon: 'mail' as IconName, t: 'Contacto', d: 'E-mail do negócio.' },
    ],
    asideSandbox: 'Esta candidatura simula o fluxo completo com dados e documentos de teste. As operações com dinheiro real permanecem indisponíveis.',
    aside3t: 'Precisa de ajuda?', aside3p: 'A nossa equipa responde por e-mail.', aside3link: 'Falar com o suporte',
    termosPre: 'Li e aceito os ', termos: 'Termos de Serviço', termosMid: '. Consulte a ', privacidade: 'Política de Privacidade', termosPost: '.',
    sandboxLabel: 'Compreendo que, nesta fase Beta, o negócio opera apenas na Sandbox, com dinheiro fictício.',
    v_default: 'Campo obrigatório.',
    v_email: 'Introduza um e-mail válido.',
    v_handle: 'O @negócio deve ter 3 a 30 letras minúsculas, dígitos ou _.',
    v_nif: 'Introduza um NIF (dados de teste na Sandbox).',
    v_doc: 'Anexe o documento de teste para continuar.',
    v_termos: 'É necessário aceitar os Termos.',
    v_sandbox: 'Confirme que compreende a fase Sandbox.',
    v_handle_taken: 'Este @negócio já está em uso. Escolha outro.',
    v_submit: 'Não foi possível enviar a candidatura. Tente novamente.',
    sbxFill: 'Usar dados de teste',
    sbxToast: 'Preenchido com dados sandbox.',
  },
  en: {
    badge: 'Beta · Sandbox',
    h1a: 'Register the', h1b: 'business.',
    lead: 'Rehearse the full Banzami Business application in the Sandbox, with test data and test documents.',
    smallPre: 'Already applied? ', smallLink: 'Check the application status', smallPost: '.',
    steps: ['Business', 'Representative', 'Documents', 'Confirm'],
    of: (n: number) => `STEP ${n} OF 4`,
    s1t: 'Business details', s1s: 'The business essentials. In the Sandbox, use test data only.',
    l_nome_comercial: 'Business name', ph_nome_comercial: 'Alex’s Canteen',
    l_handle: '@business', ph_handle: 'alexcanteen', hint_handle: '3 to 30 lowercase letters, digits or _. This is how you get paid.',
    l_categoria: 'Category', l_municipio: 'Municipality (optional)', ph_municipio: 'Talatona',
    l_descricao: 'What do you sell? (optional)', ph_descricao: 'Meals, drinks…',
    l_email: 'Contact email', ph_email: 'alex@example.ao',
    selectPh: 'Select…',
    categorias: ['Food and drink', 'Retail', 'Grocery', 'Services', 'Transport', 'Education', 'Health and beauty', 'Events', 'Other'],
    continuar: 'Continue',
    voltar: 'Back',
    s2t: 'Representative', s2s: 'Who represents the business. In the Sandbox, use test data only.',
    repWarn: 'Use only fictitious data in this Sandbox. Do not enter real tax IDs, names, contacts or documents.',
    l_rep_nome: 'Representative name', ph_rep_nome: 'Alex Kiala',
    l_rep_papel: 'Role', ph_rep_papel: 'Managing partner',
    l_rep_email: 'Representative email', ph_rep_email: 'alex@example.ao',
    l_rep_telefone: 'Phone (optional)', ph_rep_telefone: '+244 …',
    l_nif: 'Tax ID (NIF)', ph_nif: '500…', hint_nif: 'The business tax identification number.',
    s3t: 'Documents', s3s: 'Attach the two documents required to simulate the application.',
    docWarn: 'Sandbox — use test documents only. Do not upload real personal or company documents.',
    doc1_t: 'Business registration', doc1_d: 'The business registration document.',
    doc2_t: 'Representative ID document', doc2_d: 'Identification of the business representative.',
    docUseTest: 'Use test document', docLoaded: 'Test document loaded',
    s4t: 'Confirm', s4s: 'Review the details before sending.',
    sum: { negocio: 'Business', handle: '@business', categoria: 'Category', email: 'Email', rep: 'Representative', nif: 'Tax ID', docs: 'Documents' },
    docsValue: 'Business registration + ID document (test)',
    confirmNote: 'This application is for the Sandbox only and uses test data.',
    enviar: 'Send application',
    enviando: 'Sending…',
    doneT: 'Application sent',
    donePre: 'We have received the details for ', donePost: '. Keep the reference to check the status.',
    refLabel: 'Application reference',
    emailedPre: 'We will also email this reference to ', emailedPost: '.',
    verEstado: 'Check application status', nova: 'New application',
    aside1: 'What you will need',
    aside1rows: [
      { icon: 'store' as IconName, t: 'Business details', d: 'Name, @business and category.' },
      { icon: 'user' as IconName, t: 'Representative', d: 'The representative’s details.' },
      { icon: 'doc' as IconName, t: 'Documents', d: 'Two test documents.' },
      { icon: 'mail' as IconName, t: 'Contact', d: 'Business email.' },
    ],
    asideSandbox: 'This application rehearses the full flow with test data and test documents. Real-money operations remain unavailable.',
    aside3t: 'Need help?', aside3p: 'Our team replies by email.', aside3link: 'Contact support',
    termosPre: 'I have read and accept the ', termos: 'Terms of Service', termosMid: '. See the ', privacidade: 'Privacy Policy', termosPost: '.',
    sandboxLabel: 'I understand that, during this Beta, the business operates only in the Sandbox, with test money.',
    v_default: 'Required field.',
    v_email: 'Enter a valid email.',
    v_handle: 'The @business must be 3 to 30 lowercase letters, digits or _.',
    v_nif: 'Enter a tax ID (test data in the Sandbox).',
    v_doc: 'Attach the test document to continue.',
    v_termos: 'You must accept the Terms.',
    v_sandbox: 'Confirm you understand the Sandbox phase.',
    v_handle_taken: 'This @business is already taken. Choose another.',
    v_submit: 'Could not send the application. Please try again.',
    sbxFill: 'Use test data',
    sbxToast: 'Filled with sandbox data.',
  },
} as const;

// ── bespoke stepper (matches the dossier candidatura/activar stepper) ────────
function FlowStepper({ steps, current, done }: { steps: string[]; current: number; done?: boolean }) {
  const n = steps.length;
  const pct = (done ? 100 : Math.round(((current - 1) / Math.max(1, n - 1)) * 100)) + '%';
  const align = (i: number) => (i === 0 ? 'flex-start' : i === n - 1 ? 'flex-end' : 'center');
  return (
    <div className="bz-stepper" style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n},minmax(0,1fr))`, gap: '8px' }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: '16px', right: '16px', top: '15px', height: '3px', borderRadius: '3px', background: '#F4E6E4' }}>
        <div style={{ height: '100%', width: pct, borderRadius: '3px', background: 'linear-gradient(90deg,#D8121F,#9A1B22)', transition: 'width .5s cubic-bezier(.16,1,.3,1)' }} />
      </div>
      {steps.map((s, i) => {
        const nn = i + 1;
        const filled = nn < current || done;
        const active = nn <= current || done;
        return (
          <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: align(i), gap: '8px' }}>
            <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: filled ? '#1a1416' : nn === current ? 'linear-gradient(150deg,#D8121F,#8E1620)' : '#fff', color: active ? '#fff' : '#9a8487', border: `1.5px solid ${active ? 'transparent' : '#EFDCDA'}`, fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .4s,color .4s' }}>{nn}</span>
            <span className="bz-stl" style={{ fontSize: '12.5px', fontWeight: 800, color: active ? '#141014' : '#9a8487' }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

function StepHead({ kicker, title, sub, action }: { kicker: string; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div style={{ margin: '30px 0 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: '#B5101F' }}>{kicker}</p>
        <h2 style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{title}</h2>
        <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600, color: '#8a7a7e' }}>{sub}</p>
      </div>
      {action}
    </div>
  );
}

// SANDBOX-only "fill with test data" control — amber ghost, right-aligned.
const SbxSpark = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
);
function SbxFill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="bz-btnlift" style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '10px', border: '1.5px solid #F2CD6E', background: 'rgba(252,239,196,.6)', color: '#7A4A06', fontSize: '12.5px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {SbxSpark}{label}
    </button>
  );
}

function StepFooter({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '28px', paddingTop: '22px', borderTop: '1px solid #F5E8E6' }}>{children}</div>;
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '11px 0', borderBottom: '1px solid #F5E8E6' }}>
      <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#8a7a7e' }}>{label}</span>
      <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#141014', textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );
}

// One document slot — Sandbox fixtures only: a single "use test document" action,
// then a clear loaded state. No arbitrary file upload (no real documents in the
// Sandbox); the manual upload path belongs to the future real-money/KYB flow.
function DocCard({ name, title, desc, useLabel, loadedLabel, attached, error, onAttach }: {
  name: string; title: string; desc: string; useLabel: string; loadedLabel: string;
  attached: boolean; error?: string; onAttach: () => void;
}) {
  return (
    <div data-name={name} style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '16px 18px', borderRadius: '18px', border: `1.5px solid ${attached ? '#BFE3CE' : error ? '#E7B8BC' : '#EFDCDA'}`, background: attached ? '#F3FAF5' : '#fff' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
        <span style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '12px', background: attached ? '#E4F5EB' : '#FFF1F0', color: attached ? '#1F8A5B' : '#B5101F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={attached ? 'check' : 'doc'} color="currentColor" size={18} /></span>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: '#141014' }}>{title}</p>
          <p style={{ margin: '2px 0 0', fontSize: '12.5px', fontWeight: 600, color: '#8a7a7e', overflowWrap: 'anywhere' }}>{attached ? loadedLabel : desc}</p>
          {error && !attached && <p role="alert" style={{ margin: '4px 0 0', fontSize: '12px', fontWeight: 700, color: '#C4303C' }}>{error}</p>}
        </div>
      </div>
      {!attached && (
        <button type="button" name={name} onClick={onAttach} className="bz-btnlift" style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 14px', borderRadius: '12px', border: '1.5px solid #EFDCDA', background: '#fff', color: '#141014', fontSize: '13px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {SbxSpark}{useLabel}
        </button>
      )}
    </div>
  );
}

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;
const NIF_RE = /^[0-9A-Za-z]{5,20}$/;
// Mask an address for the on-screen "we'll email you" line: keep the first
// character and the domain, e.g. alex@exemplo.ao → a***@exemplo.ao. Purely
// presentational — the full address is never rendered here.
function maskEmail(e: string): string {
  const at = e.indexOf('@');
  if (at <= 0) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const stars = '*'.repeat(Math.max(1, Math.min(3, local.length - 1)));
  return `${local.slice(0, 1)}${stars}@${domain}`;
}

const initial = {
  nome_comercial: '', handle: '', categoria: '', municipio: '', descricao: '', email: '',
  rep_nome: '', rep_papel: '', rep_email: '', rep_telefone: '', nif: '',
  doc_registo: false, doc_id: false,
  termos: false, sandbox: false,
};
type FormState = typeof initial;

export function CandidaturaPage({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [f, setF] = useState<FormState>({ ...initial });
  const [err, setErr] = useState<Errs>({});
  const [appRef, setAppRef] = useState('');
  const [sending, setSending] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // SANDBOX-only autofill (ADR-025): follows the live Platform Mode, fails closed
  // to SANDBOX, never shown in LIVE.
  const [isSandbox, setIsSandbox] = useState(false);
  useEffect(() => {
    let active = true;
    void getPlatformMode().then((p) => { if (active) setIsSandbox(p.mode !== 'LIVE'); });
    return () => { active = false; };
  }, []);

  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const fillMany = (obj: Partial<FormState>) => {
    setF((s) => ({ ...s, ...obj }));
    setErr((e) => { const n = { ...e }; Object.keys(obj).forEach((k) => delete n[k]); return n; });
    setToast({ id: Date.now(), msg: t.sbxToast });
  };
  const seed = () => Math.floor(1000 + Math.random() * 9000);
  const step1Data = (): Partial<FormState> => ({
    nome_comercial: lang === 'en' ? 'Kilamba Canteen' : 'Cantina do Kilamba',
    handle: `cantina_teste_${seed()}`,
    categoria: t.categorias[0],
    municipio: 'Talatona',
    descricao: lang === 'en' ? 'Meals and drinks to go' : 'Refeições e bebidas para levar',
    email: `negocio.teste${seed()}@exemplo.co.ao`,
  });
  const step2Data = (): Partial<FormState> => ({
    rep_nome: lang === 'en' ? 'Alex Test' : 'Alex de Teste',
    rep_papel: lang === 'en' ? 'Managing partner' : 'Sócio-gerente',
    rep_email: `representante.teste${seed()}@exemplo.co.ao`,
    rep_telefone: '+244 900 000 000',
    // A clearly-synthetic tax ID — never the operator's real NIF.
    nif: `5000${seed()}00`,
  });
  const step3Data = (): Partial<FormState> => ({ doc_registo: true, doc_id: true });
  const fillStep1 = () => fillMany(step1Data());
  const fillStep2 = () => fillMany(step2Data());
  const fillStep3 = () => fillMany(step3Data());
  // One click from Step 1 populates the ENTIRE wizard (fields + both fixtures +
  // acknowledgements) so the whole Sandbox flow is valid without inventing data.
  const fillAll = () => fillMany({ ...step1Data(), ...step2Data(), ...step3Data(), termos: true, sandbox: true });

  const rules: Record<string, { re?: RegExp; bad?: string; msg?: string }> = {
    email: { re: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, bad: t.v_email },
    handle: { re: HANDLE_RE, bad: t.v_handle },
    rep_email: { re: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, bad: t.v_email },
    nif: { re: NIF_RE, bad: t.v_nif },
    doc_registo: { msg: t.v_doc },
    doc_id: { msg: t.v_doc },
    termos: { msg: t.v_termos },
    sandbox: { msg: t.v_sandbox },
  };
  const stepFields: Record<number, string[]> = {
    1: ['nome_comercial', 'handle', 'categoria', 'email'],
    2: ['rep_nome', 'rep_papel', 'rep_email', 'nif'],
    3: ['doc_registo', 'doc_id'],
    4: ['termos', 'sandbox'],
  };
  const LAST = 4;

  const set = (name: string, v: string | boolean) => {
    // The @handle is always lowercase; normalise as the user types.
    const val = name === 'handle' && typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, '') : v;
    setF((s) => ({ ...s, [name]: val }));
    setErr((e) => ({ ...e, [name]: '', submit: '' }));
  };

  const validate = (keys: string[]) => {
    const e: Errs = {};
    keys.forEach((k) => {
      const v = (f as Record<string, string | boolean>)[k];
      const r = rules[k];
      if (v === undefined || v === '' || v === false) e[k] = r && r.msg ? r.msg : t.v_default;
      else if (r && r.re && !r.re.test(String(v).trim())) e[k] = r.bad || t.v_default;
    });
    setErr(e);
    if (Object.keys(e).length && formRef.current) {
      const el = formRef.current.querySelector<HTMLElement>('[name="' + Object.keys(e)[0] + '"]');
      if (el && el.focus) el.focus();
    }
    return !Object.keys(e).length;
  };

  const next = () => { if (validate(stepFields[step] || [])) setStep((s) => Math.min(LAST, s + 1)); };
  const back = () => { setStep((s) => Math.max(1, s - 1)); setErr({}); };

  const submit = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (sending) return;
    if (!validate(stepFields[step] || [])) return;
    setSending(true);
    setErr((prev) => ({ ...prev, submit: '' }));
    try {
      const res = await submitApplication({
        business_name: f.nome_comercial.trim(),
        desired_handle: f.handle.trim(),
        category: f.categoria,
        email: f.email.trim(),
        municipality: f.municipio.trim() || undefined,
        business_activity: f.descricao.trim() || undefined,
        nif: f.nif.trim() || undefined,
        legal_representative: f.rep_nome.trim() || undefined,
        representative_role: f.rep_papel.trim() || undefined,
        representative_email: f.rep_email.trim() || undefined,
        representative_phone: f.rep_telefone.trim() || undefined,
        // The attached synthetic fixtures — recorded as Sandbox test documents,
        // kept separate from the real LIVE KYB pipeline.
        sandbox_documents: SANDBOX_DOCS.filter((d) => f[d.field]).map((d) => d.id),
        terms_accepted: true,
        // Only send a version once the Terms are actually published.
        terms_version: isTermsPublished() ? (TERMS.version ?? undefined) : undefined,
        locale: lang,
      });
      if (res.ok && res.applicationId) {
        setAppRef(res.applicationId);
        setDone(true);
        return;
      }
      // Map server refusals to a field where possible; otherwise a banner.
      if (res.code === 'INVALID_HANDLE') { setErr((prev) => ({ ...prev, handle: t.v_handle })); setStep(1); }
      else if (res.code && /HANDLE|TAKEN|RESERVED/i.test(res.code)) { setErr((prev) => ({ ...prev, handle: t.v_handle_taken })); setStep(1); }
      else setErr((prev) => ({ ...prev, submit: res.error || t.v_submit }));
    } catch {
      setErr((prev) => ({ ...prev, submit: t.v_submit }));
    } finally {
      setSending(false);
    }
  };

  const reset = () => { setDone(false); setStep(1); setF({ ...initial }); setErr({}); setAppRef(''); };

  const asideCard: CSSProperties = { position: 'relative', overflow: 'hidden', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '24px', padding: '24px', boxShadow: '0 26px 56px -40px rgba(122,16,22,.45)' };

  return (
    <>
      {/* ─── 00 · HERO ─── */}
      <section id="inicio" style={{ position: 'relative', padding: '128px 24px 56px', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-8%', top: '-20%', width: '640px', height: '640px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,210,208,.75),rgba(251,210,208,0) 68%)' }} />
          <div style={{ position: 'absolute', left: '-12%', bottom: '-40%', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,228,226,.8),rgba(255,228,226,0) 70%)' }} />
        </div>

        <div style={CONTENT}>
          <Reveal>
            <Badge>{t.badge}</Badge>
            <H1 a={t.h1a} b={t.h1b} size="clamp(36px,4.2vw,56px)" />
            <HeroLead mw={600}>{t.lead}</HeroLead>
            <Small mw={600}>{t.smallPre}<a href={route('estado', lang)} style={{ fontWeight: 800 }}>{t.smallLink}</a>{t.smallPost}</Small>
          </Reveal>
        </div>
      </section>

      {/* ─── 01 · FORM ─── */}
      <section id="candidatura" style={{ position: 'relative', padding: '8px 24px clamp(64px,8vw,110px)', overflow: 'clip' }}>
        <Reveal><div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,.7fr)', gap: '24px', alignItems: 'start' }}>
            {/* left — form card */}
            <div style={{ minWidth: 0 }}>
              <div ref={formRef} style={{ background: '#fff', border: '1px solid #F3E3E1', borderRadius: '28px', padding: 'clamp(22px,3.4vw,40px)', boxShadow: '0 40px 80px -50px rgba(122,16,22,.5)' }}>
                {!done && <FlowStepper steps={t.steps as unknown as string[]} current={step} done={done} />}

                {!done && step === 1 && (
                  <>
                    <StepHead kicker={t.of(1)} title={t.s1t} sub={t.s1s} action={isSandbox ? <SbxFill label={t.sbxFill} onClick={fillAll} /> : undefined} />
                    <FGrid>
                      <Field name="nome_comercial" label={t.l_nome_comercial} placeholder={t.ph_nome_comercial} autoComplete="organization" value={f.nome_comercial} error={err.nome_comercial} onChange={(v) => set('nome_comercial', v)} />
                      <Field name="handle" label={t.l_handle} placeholder={t.ph_handle} hint={t.hint_handle} mono value={f.handle} error={err.handle} onChange={(v) => set('handle', v)} />
                      <Field name="categoria" label={t.l_categoria} options={t.categorias as unknown as string[]} selectPlaceholder={t.selectPh} value={f.categoria} error={err.categoria} onChange={(v) => set('categoria', v)} />
                      <Field name="email" label={t.l_email} type="email" placeholder={t.ph_email} autoComplete="email" value={f.email} error={err.email} onChange={(v) => set('email', v)} />
                      <Field name="municipio" label={t.l_municipio} placeholder={t.ph_municipio} required={false} value={f.municipio} error={err.municipio} onChange={(v) => set('municipio', v)} />
                      <Field name="descricao" label={t.l_descricao} placeholder={t.ph_descricao} required={false} value={f.descricao} error={err.descricao} onChange={(v) => set('descricao', v)} />
                    </FGrid>
                    <StepFooter><span /><SubmitBtn type="button" onClick={next}>{t.continuar}</SubmitBtn></StepFooter>
                  </>
                )}

                {!done && step === 2 && (
                  <>
                    <StepHead kicker={t.of(2)} title={t.s2t} sub={t.s2s} action={isSandbox ? <SbxFill label={t.sbxFill} onClick={fillStep2} /> : undefined} />
                    {isSandbox && (
                      <div style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', padding: '12px 16px', borderRadius: '14px', background: '#FCEFC4', border: '1px solid #E9C66A', marginBottom: '16px' }}>
                        <span style={{ flex: 'none', color: '#7A4A06', marginTop: '1px' }}><Icon name="info" color="currentColor" size={16} /></span>
                        <p style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.5, fontWeight: 700, color: '#7A4A06' }}>{t.repWarn}</p>
                      </div>
                    )}
                    <FGrid>
                      <Field name="rep_nome" label={t.l_rep_nome} placeholder={t.ph_rep_nome} autoComplete="name" value={f.rep_nome} error={err.rep_nome} onChange={(v) => set('rep_nome', v)} />
                      <Field name="rep_papel" label={t.l_rep_papel} placeholder={t.ph_rep_papel} value={f.rep_papel} error={err.rep_papel} onChange={(v) => set('rep_papel', v)} />
                      <Field name="rep_email" label={t.l_rep_email} type="email" placeholder={t.ph_rep_email} autoComplete="email" value={f.rep_email} error={err.rep_email} onChange={(v) => set('rep_email', v)} />
                      <Field name="rep_telefone" label={t.l_rep_telefone} type="tel" placeholder={t.ph_rep_telefone} required={false} autoComplete="tel" value={f.rep_telefone} error={err.rep_telefone} onChange={(v) => set('rep_telefone', v)} />
                      <Field name="nif" label={t.l_nif} placeholder={t.ph_nif} hint={t.hint_nif} mono value={f.nif} error={err.nif} onChange={(v) => set('nif', v)} />
                    </FGrid>
                    <StepFooter><BackBtn onClick={back}>{t.voltar}</BackBtn><SubmitBtn type="button" onClick={next}>{t.continuar}</SubmitBtn></StepFooter>
                  </>
                )}

                {!done && step === 3 && (
                  <>
                    <StepHead kicker={t.of(3)} title={t.s3t} sub={t.s3s} action={isSandbox ? <SbxFill label={t.sbxFill} onClick={fillStep3} /> : undefined} />
                    <div style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', padding: '12px 16px', borderRadius: '14px', background: '#FCEFC4', border: '1px solid #E9C66A', marginBottom: '16px' }}>
                      <span style={{ flex: 'none', color: '#7A4A06', marginTop: '1px' }}><Icon name="info" color="currentColor" size={16} /></span>
                      <p style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.5, fontWeight: 700, color: '#7A4A06' }}>{t.docWarn}</p>
                    </div>
                    <FGrid>
                      <DocCard name="doc_registo" title={t.doc1_t} desc={t.doc1_d} useLabel={t.docUseTest} loadedLabel={t.docLoaded} attached={f.doc_registo} error={err.doc_registo} onAttach={() => set('doc_registo', true)} />
                      <DocCard name="doc_id" title={t.doc2_t} desc={t.doc2_d} useLabel={t.docUseTest} loadedLabel={t.docLoaded} attached={f.doc_id} error={err.doc_id} onAttach={() => set('doc_id', true)} />
                    </FGrid>
                    <StepFooter><BackBtn onClick={back}>{t.voltar}</BackBtn><SubmitBtn type="button" onClick={next}>{t.continuar}</SubmitBtn></StepFooter>
                  </>
                )}

                {!done && step === 4 && (
                  <>
                    <StepHead kicker={t.of(4)} title={t.s4t} sub={t.s4s} action={isSandbox ? <SbxFill label={t.sbxFill} onClick={fillAll} /> : undefined} />
                    <div style={{ padding: '4px 18px', borderRadius: '18px', background: '#FFFBFA', border: '1px solid #F5E8E6', marginBottom: '18px' }}>
                      <SumRow label={t.sum.negocio} value={f.nome_comercial} />
                      <SumRow label={t.sum.handle} value={f.handle ? '@' + f.handle : ''} />
                      <SumRow label={t.sum.categoria} value={f.categoria} />
                      <SumRow label={t.sum.email} value={f.email} />
                      <SumRow label={t.sum.rep} value={[f.rep_nome, f.rep_papel].filter(Boolean).join(' · ')} />
                      <SumRow label={t.sum.nif} value={f.nif} />
                      <SumRow label={t.sum.docs} value={f.doc_registo && f.doc_id ? t.docsValue : ''} />
                    </div>
                    <p style={{ margin: '0 0 16px', fontSize: '12.5px', lineHeight: 1.5, fontWeight: 700, color: '#7A4A06' }}>{t.confirmNote}</p>
                    <FGrid>
                      <Check name="termos" checked={f.termos} error={err.termos} onChange={(v) => set('termos', v)} label={<>{t.termosPre}<a href={route('termos', lang)} target="_blank" rel="noopener noreferrer">{t.termos}</a>{t.termosMid}<a href={route('privacidade', lang)} target="_blank" rel="noopener noreferrer">{t.privacidade}</a>{t.termosPost}</>} />
                      <Check name="sandbox" checked={f.sandbox} error={err.sandbox} onChange={(v) => set('sandbox', v)} label={t.sandboxLabel} />
                    </FGrid>
                    {err.submit && <p role="alert" style={{ margin: '14px 0 0', fontSize: '13.5px', fontWeight: 700, color: '#C4303C' }}>{err.submit}</p>}
                    <StepFooter><BackBtn onClick={back}>{t.voltar}</BackBtn><SubmitBtn type="submit" onClick={() => submit()}>{sending ? t.enviando : t.enviar}</SubmitBtn></StepFooter>
                  </>
                )}

                {done && (
                  <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px 0 8px' }}>
                    <SuccessMark />
                    <h2 style={{ margin: '20px 0 0', fontSize: '26px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{t.doneT}</h2>
                    <p style={{ margin: '8px 0 0', maxWidth: '440px', fontSize: '15px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{t.donePre}<strong style={{ color: '#141014' }}>{f.nome_comercial}</strong>{t.donePost}</p>
                    <p style={{ margin: '18px 0 0', fontSize: '11px', fontWeight: 900, letterSpacing: '.14em', color: '#9a8487' }}>{t.refLabel.toUpperCase()}</p>
                    <div style={{ marginTop: '6px', padding: '12px 20px', borderRadius: '16px', background: '#FFF1F0', border: '1px dashed rgba(181,16,31,.35)', fontFamily: "'JetBrains Mono',monospace", fontSize: '14px', fontWeight: 600, letterSpacing: '.02em', color: '#B5101F', overflowWrap: 'anywhere', maxWidth: '100%' }}>{appRef}</div>
                    <p style={{ margin: '14px 0 0', maxWidth: '440px', fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#6a5a5e' }}>{t.emailedPre}<strong style={{ color: '#141014' }}>{maskEmail(f.email)}</strong>{t.emailedPost}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
                      <a href={`${route('estado', lang)}?ref=${encodeURIComponent(appRef)}`} className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '13px 24px', borderRadius: '40px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 14px 28px -14px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)' }}>{t.verEstado}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
                      <button type="button" onClick={reset} style={{ padding: '12px 20px', borderRadius: '40px', border: '1px solid #F3E3E1', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', color: '#141014' }}>{t.nova}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* right — sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'sticky', top: '104px' }}>
              <div style={asideCard}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{t.aside1}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                  {t.aside1rows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ flex: 'none', width: '38px', height: '38px', borderRadius: '12px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={r.icon} color="currentColor" size={17} /></span>
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: '#141014' }}>{r.t}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '12.5px', fontWeight: 600, color: '#8a7a7e' }}>{r.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={asideCard}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', background: '#FCEFC4', border: '1px solid #E9C66A', fontSize: '11px', fontWeight: 900, letterSpacing: '.04em', color: '#7A4A06' }}>SANDBOX</span>
                </div>
                <p style={{ margin: '12px 0 0', fontSize: '13.5px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{t.asideSandbox}</p>
              </div>
              <div style={asideCard}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{t.aside3t}</h3>
                <p style={{ margin: '8px 0 14px', fontSize: '13.5px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{t.aside3p}</p>
                <a href={route('suporte', lang)} className="bz-btntext" style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', color: '#141014', fontWeight: 800, fontSize: '14.5px', whiteSpace: 'nowrap', textDecoration: 'none' }}>{t.aside3link}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
              </div>
            </div>
          </div>
        </div></Reveal>
      </section>

      {/* SANDBOX autofill toast */}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', insetInline: 0, bottom: '24px', zIndex: 90, display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '14px', background: '#2a2024', color: '#fff', padding: '12px 20px', fontSize: '13.5px', fontWeight: 800, boxShadow: '0 16px 40px -12px rgba(0,0,0,.5)' }}>
            <span style={{ color: '#F2CD6E' }}>{SbxSpark}</span>{toast.msg}
          </div>
        </div>
      )}
    </>
  );
}
