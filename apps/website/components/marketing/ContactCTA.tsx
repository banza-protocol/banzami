'use client';

import { useEffect, useRef, useState } from 'react';
import { Field, SubmitBtn, SuccessMark } from './form-kit';
import { submitContact } from '@/lib/contact';
import type { Lang, Loc } from '@/lib/marketing/nav';

const L = (pt: string, en: string): Loc => ({ pt, en });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const T = {
  title: L('Falar com a equipa', 'Talk to the team'),
  sub: L('Enviamos a sua mensagem para contact@banzami.com e respondemos para o e-mail que indicar.', 'We send your message to contact@banzami.com and reply to the email you give.'),
  name: L('Nome', 'Name'), namePh: L('O seu nome', 'Your name'),
  email: L('E-mail', 'Email'),
  subject: L('Assunto', 'Subject'), subjectPh: L('Selecione…', 'Select…'),
  other: L('Qual é o assunto?', 'What is it about?'), otherPh: L('Escreva o assunto', 'Type the subject'),
  message: L('Mensagem', 'Message'), messagePh: L('Como podemos ajudar?', 'How can we help?'),
  send: L('Enviar mensagem', 'Send message'), sending: L('A enviar…', 'Sending…'),
  reqField: L('Campo obrigatório.', 'Required field.'),
  badEmail: L('Introduza um e-mail válido.', 'Enter a valid email.'),
  chooseSubject: L('Escolha um assunto.', 'Choose a subject.'),
  sendFail: L('Não foi possível enviar. Tente novamente ou escreva para contact@banzami.com.', 'We could not send it. Try again or write to contact@banzami.com.'),
  sentTitle: L('Mensagem enviada', 'Message sent'),
  sentSub: L('Recebemos a sua mensagem e respondemos para o e-mail que indicou.', 'We received your message and will reply to the email you gave.'),
  close: L('Fechar', 'Close'),
};
const SUBJECTS: Loc[] = [
  L('Parceria / Integração', 'Partnership / Integration'),
  L('Developers e API', 'Developers and API'),
  L('Comerciantes e negócios', 'Merchants and business'),
  L('Suporte / dúvida', 'Support / question'),
  L('Imprensa', 'Press'),
  L('Outro', 'Other'),
];

export function ContactCTA({ lang, label }: { lang: Lang; label?: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nome: '', email: '', assunto: '', assunto_outro: '', mensagem: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [done, setDone] = useState(false);
  const isOther = f.assunto === SUBJECTS[SUBJECTS.length - 1][lang];
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  const set = (k: string, v: string) => { setF((s) => ({ ...s, [k]: v })); setErr((e) => ({ ...e, [k]: '' })); };
  const reset = () => { setF({ nome: '', email: '', assunto: '', assunto_outro: '', mensagem: '' }); setErr({}); setSendErr(''); setDone(false); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!f.nome.trim()) next.nome = T.reqField[lang];
    if (!f.email.trim()) next.email = T.reqField[lang]; else if (!EMAIL_RE.test(f.email.trim())) next.email = T.badEmail[lang];
    if (!f.assunto) next.assunto = T.chooseSubject[lang];
    if (isOther && !f.assunto_outro.trim()) next.assunto_outro = T.reqField[lang];
    if (!f.mensagem.trim()) next.mensagem = T.reqField[lang];
    setErr(next);
    if (Object.keys(next).length) return;
    setSending(true); setSendErr('');
    const subject = isOther ? f.assunto_outro.trim() : f.assunto;
    try {
      await submitContact({ name: f.nome.trim(), email: f.email.trim(), subject, message: f.mensagem.trim() });
      setDone(true);
    } catch {
      setSendErr(T.sendFail[lang]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => { reset(); setOpen(true); }} style={{ flex: 1, minWidth: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.4)', color: '#fff', borderRadius: '12px', padding: '12px 16px', fontWeight: 800, fontSize: '13.5px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        {label ?? T.title[lang]}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={T.title[lang]} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(60,20,22,.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
          <div ref={dialogRef} style={{ position: 'relative', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '26px', padding: 'clamp(22px,3vw,32px)', boxShadow: '0 40px 90px -30px rgba(0,0,0,.5)', color: '#2a2024' }}>
            <button type="button" aria-label={T.close[lang]} onClick={() => setOpen(false)} style={{ position: 'absolute', top: '16px', right: '16px', width: '36px', height: '36px', borderRadius: '12px', border: '1px solid #F3E3E1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#141014" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            {!done ? (
              <form onSubmit={submit} noValidate>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{T.title[lang]}</h2>
                <p style={{ margin: '6px 0 20px', fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#8a7a7e' }}>{T.sub[lang]}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '16px 18px' }} className="bz-fgrid">
                  <Field name="nome" label={T.name[lang]} placeholder={T.namePh[lang]} autoComplete="name" value={f.nome} error={err.nome} onChange={(v) => set('nome', v)} />
                  <Field name="email" label={T.email[lang]} type="email" placeholder="nome@exemplo.ao" autoComplete="email" value={f.email} error={err.email} onChange={(v) => set('email', v)} />
                  <Field name="assunto" label={T.subject[lang]} options={SUBJECTS.map((s) => s[lang])} selectPlaceholder={T.subjectPh[lang]} span2 value={f.assunto} error={err.assunto} onChange={(v) => set('assunto', v)} />
                  {isOther && <Field name="assunto_outro" label={T.other[lang]} placeholder={T.otherPh[lang]} span2 value={f.assunto_outro} error={err.assunto_outro} onChange={(v) => set('assunto_outro', v)} />}
                  <Field name="mensagem" label={T.message[lang]} type="textarea" placeholder={T.messagePh[lang]} span2 value={f.mensagem} error={err.mensagem} onChange={(v) => set('mensagem', v)} />
                </div>
                {sendErr && <p role="alert" style={{ margin: '16px 0 0', fontSize: '12.5px', fontWeight: 700, color: '#C8101F' }}>{sendErr}</p>}
                <div style={{ marginTop: '22px' }}><SubmitBtn>{sending ? T.sending[lang] : T.send[lang]}</SubmitBtn></div>
              </form>
            ) : (
              <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '14px 0 6px' }}>
                <SuccessMark />
                <h2 style={{ margin: '18px 0 0', fontSize: '22px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{T.sentTitle[lang]}</h2>
                <p style={{ margin: '8px 0 0', maxWidth: '380px', fontSize: '14px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{T.sentSub[lang]}</p>
                <button type="button" onClick={() => setOpen(false)} style={{ marginTop: '22px', padding: '12px 22px', borderRadius: '40px', border: '1px solid #F3E3E1', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', color: '#141014' }}>{T.close[lang]}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
