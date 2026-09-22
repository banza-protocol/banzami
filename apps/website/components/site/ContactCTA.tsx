'use client';

// "Falar com a equipa" — the footer red-card contact button (PUBLIC-WEBSITE-
// CONTACT-001). It opens an inline modal with a small contact form that is
// delivered by email to the team (contact@banzami.com). No navigation, no
// mailto: — the visitor writes the message here and gets an in-place
// confirmation. The dialog shell (focus trap, Escape, backdrop) is the same one
// the beta modal uses.

import { useId, useRef, useState } from 'react';
import { BetaRegisterModal } from '@/components/site/BetaRegisterModal';
import { submitContact } from '@/lib/contact';

function looksLikeEmail(e: string): boolean {
  const t = e.trim();
  if (t.length < 5 || t.length > 254 || /\s/.test(t)) return false;
  const at = t.indexOf('@');
  return at > 0 && at === t.lastIndexOf('@') && at < t.length - 1 && t.slice(at + 1).includes('.');
}

export function ContactCTA({ label = 'Falar com a equipa' }: { label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bz-foot-cta mt-[12px] flex w-full items-center justify-between rounded-[16px] border border-white/25 bg-white/[0.12] px-[20px] py-[16px] text-[15px] font-extrabold text-white transition hover:bg-white/[0.2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        {label}
        <svg className="bz-foot-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <BetaRegisterModal
        open={open}
        onClose={() => setOpen(false)}
        title="Falar com a equipa"
        subtitle="Deixe a sua mensagem e responderemos por e-mail. Para parcerias, integração ou qualquer dúvida."
        labelledById="contact-modal-title"
      >
        <ContactForm onSuccess={() => { /* keep the modal open on the success panel */ }} />
      </BetaRegisterModal>
    </>
  );
}

function ContactForm({ onSuccess }: { onSuccess?: () => void }) {
  const uid = useId();
  const firstRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!name.trim() || !email.trim() || !message.trim()) return setErr('Preencha o nome, o e-mail e a mensagem.');
    if (!looksLikeEmail(email)) return setErr('Indique um e-mail válido.');

    setBusy(true);
    const res = await submitContact({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim() || undefined,
      message: message.trim(),
      website,
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      onSuccess?.();
    } else {
      setErr(res.message === 'default' ? 'Não foi possível enviar agora. Tente novamente daqui a pouco.' : res.message);
    }
  }

  if (done) {
    return (
      <div role="status" aria-live="polite" className="rounded-2xl border border-green-200 bg-green-50 p-6">
        <div className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="#16a34a" />
            <path d="M8 12.5l2.5 2.5L16 9.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3 className="text-lg font-black text-green-900">Mensagem enviada</h3>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-green-900/90">
          Obrigado pelo contacto. Respondemos por e-mail assim que possível.
        </p>
      </div>
    );
  }

  const field =
    'w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 outline-none transition focus:border-cherry focus:ring-2 focus:ring-cherry/20';
  const label = 'mb-1 block text-[13px] font-bold text-neutral-700';

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {/* Honeypot: off-screen, not a tab stop, never seen by a human. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
        <label htmlFor={`${uid}-website`}>Website</label>
        <input id={`${uid}-website`} type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      <div>
        <label htmlFor={`${uid}-name`} className={label}>Nome</label>
        <input id={`${uid}-name`} ref={firstRef} type="text" autoComplete="name" autoFocus className={field} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div>
        <label htmlFor={`${uid}-email`} className={label}>E-mail</label>
        <input id={`${uid}-email`} type="email" inputMode="email" autoComplete="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>

      <div>
        <label htmlFor={`${uid}-subject`} className={label}>Assunto <span className="font-semibold text-neutral-400">(opcional)</span></label>
        <input id={`${uid}-subject`} type="text" className={field} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="ex.: Parceria, integração, dúvida" />
      </div>

      <div>
        <label htmlFor={`${uid}-message`} className={label}>Mensagem</label>
        <textarea id={`${uid}-message`} rows={4} className={`${field} resize-y`} value={message} onChange={(e) => setMessage(e.target.value)} required />
      </div>

      {err && <p role="alert" className="text-[13.5px] font-semibold text-cherry">{err}</p>}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(180deg,#B5101F,#9A1B22)] px-5 py-3 text-[15px] font-black text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? 'A enviar…' : 'Enviar mensagem'}
      </button>
    </form>
  );
}
