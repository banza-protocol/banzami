'use client';

import { useState } from 'react';
import { Field, SubmitBtn, SuccessMark } from './form-kit';
import {
  submitDeletionRequest,
  verifyDeletionRequest,
  type DeletionSubject,
} from '@/lib/account-deletion';
import type { Lang, Loc } from '@/lib/marketing/nav';

const L = (pt: string, en: string): Loc => ({ pt, en });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HANDLE_RE = /^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$/;

const T = {
  title: L('Solicitar supressão de conta', 'Request account deletion'),
  sub: L(
    'Preencha o pedido com o seu @banza e um e-mail de contacto. Enviamos um código para confirmar que controla o e-mail. A confirmação do e-mail não suprime a conta: a equipa verifica a titularidade antes de processar.',
    'File the request with your @banza and a contact email. We send a code to confirm you control the email. Confirming the email does not delete the account: the team verifies ownership before processing.',
  ),
  kind: L('Tipo de conta', 'Account type'),
  kindConsumer: L('Conta pessoal', 'Personal account'),
  kindBusiness: L('Conta de negócio', 'Business account'),
  handle: L('O seu @banza', 'Your @banza'),
  handleHint: L('Sem o @, em minúsculas. Ex.: fm65', 'Without the @, lowercase. E.g. fm65'),
  email: L('E-mail de contacto', 'Contact email'),
  send: L('Enviar código', 'Send code'),
  sending: L('A enviar…', 'Sending…'),
  code: L('Código de verificação', 'Verification code'),
  codeHint: L('Os 6 dígitos que enviámos para o seu e-mail.', 'The 6 digits we sent to your email.'),
  confirm: L('Confirmar e-mail', 'Confirm email'),
  confirming: L('A confirmar…', 'Confirming…'),
  reqField: L('Campo obrigatório.', 'Required field.'),
  badEmail: L('Introduza um e-mail válido.', 'Enter a valid email.'),
  badHandle: L('Introduza um @banza válido.', 'Enter a valid @banza.'),
  chooseKind: L('Escolha o tipo de conta.', 'Choose the account type.'),
  badCode: L('Código inválido ou expirado. Verifique ou peça um novo.', 'Invalid or expired code. Check it or request a new one.'),
  sendFail: L(
    'Não foi possível registar o pedido. Tente novamente mais tarde ou escreva para contact@banzami.com.',
    'We could not file the request. Try again later or write to contact@banzami.com.',
  ),
  doneTitle: L('Pedido registado', 'Request filed'),
  doneSub: L(
    'Confirmou o e-mail. O pedido segue para verificação de titularidade pela equipa antes de ser processado. Pode fechar esta página.',
    'You confirmed the email. The request now goes to the team for ownership verification before it is processed. You can close this page.',
  ),
  restart: L('Fazer outro pedido', 'File another request'),
};

type Step = 'request' | 'verify' | 'done';

const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #F3E3E1', borderRadius: '24px',
  padding: 'clamp(22px,3vw,34px)', boxShadow: '0 24px 50px -44px rgba(122,16,22,.4)',
};

export function DeletionRequestForm({ lang }: { lang: Lang }) {
  const [step, setStep] = useState<Step>('request');
  const [subject, setSubject] = useState<DeletionSubject | ''>('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const normHandle = (v: string) => v.trim().replace(/^@/, '').toLowerCase();

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!subject) next.subject = T.chooseKind[lang];
    const h = normHandle(handle);
    if (!h) next.handle = T.reqField[lang];
    else if (!HANDLE_RE.test(h)) next.handle = T.badHandle[lang];
    if (!email.trim()) next.email = T.reqField[lang];
    else if (!EMAIL_RE.test(email.trim())) next.email = T.badEmail[lang];
    setErr(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormErr('');
    const r = await submitDeletionRequest({
      subjectType: subject as DeletionSubject,
      handle: h,
      email: email.trim(),
    });
    setBusy(false);
    if (r.ok) {
      setRequestId(r.requestId);
      setStep('verify');
    } else {
      setFormErr(T.sendFail[lang]);
    }
  };

  const submitVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim();
    if (c.length !== 6) {
      setErr({ code: T.badCode[lang] });
      return;
    }
    setBusy(true);
    setFormErr('');
    const r = await verifyDeletionRequest(requestId, c);
    setBusy(false);
    if (r.ok) {
      setStep('done');
    } else {
      setErr({ code: T.badCode[lang] });
    }
  };

  const restart = () => {
    setStep('request');
    setSubject('');
    setHandle('');
    setEmail('');
    setCode('');
    setRequestId('');
    setErr({});
    setFormErr('');
  };

  return (
    <div style={cardStyle}>
      {step === 'request' && (
        <form onSubmit={submitRequest} noValidate>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{T.title[lang]}</h2>
          <p style={{ margin: '8px 0 20px', fontSize: '13.5px', lineHeight: 1.6, fontWeight: 600, color: '#8a7a7e' }}>{T.sub[lang]}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '16px 18px' }} className="bz-fgrid">
            <div role="radiogroup" aria-label={T.kind[lang]} style={{ display: 'flex', flexDirection: 'column', gap: '7px', gridColumn: '1 / -1' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#2a2024' }}>{T.kind[lang]}<span aria-hidden="true" style={{ color: '#B5101F' }}> *</span></span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '10px' }}>
                {([['CONSUMER', T.kindConsumer[lang]], ['BUSINESS', T.kindBusiness[lang]]] as const).map(([val, lbl]) => {
                  const on = subject === val;
                  return (
                    <button key={val} type="button" role="radio" aria-checked={on} onClick={() => { setSubject(val); setErr((e) => ({ ...e, subject: '' })); }} style={{ textAlign: 'left', padding: '14px', borderRadius: '16px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 800, color: '#141014', border: `1.5px solid ${on ? '#D8121F' : '#EFDCDA'}`, background: on ? '#FFF6F5' : '#fff', transition: 'border-color .2s, background .2s' }}>
                      {lbl}
                    </button>
                  );
                })}
              </div>
              {err.subject && <p role="alert" style={{ margin: 0, fontSize: '12.5px', fontWeight: 700, color: '#C8101F' }}>{err.subject}</p>}
            </div>
            <Field name="handle" label={T.handle[lang]} placeholder="fm65" hint={T.handleHint[lang]} mono value={handle} error={err.handle} onChange={(v) => { setHandle(v); setErr((e) => ({ ...e, handle: '' })); }} />
            <Field name="email" label={T.email[lang]} type="email" placeholder="nome@exemplo.ao" autoComplete="email" value={email} error={err.email} onChange={(v) => { setEmail(v); setErr((e) => ({ ...e, email: '' })); }} />
          </div>
          {formErr && <p role="alert" style={{ margin: '16px 0 0', fontSize: '12.5px', fontWeight: 700, color: '#C8101F' }}>{formErr}</p>}
          <div style={{ marginTop: '22px' }}><SubmitBtn>{busy ? T.sending[lang] : T.send[lang]}</SubmitBtn></div>
        </form>
      )}

      {step === 'verify' && (
        <form onSubmit={submitVerify} noValidate>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{T.code[lang]}</h2>
          <p style={{ margin: '8px 0 20px', fontSize: '13.5px', lineHeight: 1.6, fontWeight: 600, color: '#8a7a7e' }}>{T.codeHint[lang]}</p>
          <div style={{ display: 'grid', gap: '16px' }}>
            <Field name="code" label={T.code[lang]} placeholder="000000" mono value={code} error={err.code} onChange={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setErr((e) => ({ ...e, code: '' })); }} />
          </div>
          {formErr && <p role="alert" style={{ margin: '16px 0 0', fontSize: '12.5px', fontWeight: 700, color: '#C8101F' }}>{formErr}</p>}
          <div style={{ marginTop: '22px' }}><SubmitBtn>{busy ? T.confirming[lang] : T.confirm[lang]}</SubmitBtn></div>
        </form>
      )}

      {step === 'done' && (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '14px 0 6px' }}>
          <SuccessMark />
          <h2 style={{ margin: '18px 0 0', fontSize: '20px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{T.doneTitle[lang]}</h2>
          <p style={{ margin: '8px 0 0', maxWidth: '420px', fontSize: '14px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e' }}>{T.doneSub[lang]}</p>
          <button type="button" onClick={restart} style={{ marginTop: '22px', padding: '12px 22px', borderRadius: '40px', border: '1px solid #F3E3E1', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '14px', color: '#141014' }}>{T.restart[lang]}</button>
        </div>
      )}
    </div>
  );
}
