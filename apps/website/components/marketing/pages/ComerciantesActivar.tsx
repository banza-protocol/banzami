'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge, H1, H2, HeroLead, Small, SectionLabel, Icon, type IconName } from '../kit';
import { Field, Check, FGrid, SubmitBtn, SuccessMark } from '../form-kit';
import { Rotator } from '../Rotator';
import { Reveal } from '@/components/Reveal';
import { validateActivation, completeActivation, type ActivationStatus } from '@/lib/api';
import { route, APP_URL, type Lang } from '@/lib/marketing/nav';

/**
 * Comerciantes · Activar — real activation of an approved Sandbox business.
 * The approval email links here with ?token=<capability>. We validate the token,
 * then take a PIN and call POST /v1/merchant/activation/complete. No manual code,
 * no fabricated success. Body only; header/footer come from <SiteShell>.
 */

const CONTENT: CSSProperties = { position: 'relative', maxWidth: '1140px', margin: '0 auto' };
type Errs = Record<string, string>;

const T = {
  pt: {
    badge: 'Versão Beta · Sandbox',
    h1a: 'Ativar o', h1b: 'negócio.',
    lead: 'A candidatura foi aprovada. Defina um PIN e aceite os termos para começar a receber na Sandbox.',
    smallPre: 'Sem link de ativação? ', smallLink: 'Consulte o estado da candidatura', smallPost: '.',
    validating: 'A validar o link de ativação…',
    noToken: 'Abra o link de ativação que recebeu no e-mail de aprovação. O link identifica o seu negócio com segurança.',
    invalid: 'Este link de ativação não é válido.',
    expired: 'Este link de ativação expirou. Peça um novo à equipa Banzami.',
    used: 'Este link de ativação já foi utilizado.',
    rate: 'Demasiadas tentativas. Tente novamente mais tarde.',
    unavailable: 'Não foi possível validar o link agora. Tente novamente.',
    activatePre: 'Ativar ', activateFallback: 'o seu negócio',
    l_pin: 'Defina um PIN', hint_pin: '4 a 8 dígitos. Vai usá-lo para entrar na app Banzami Business.',
    l_pin2: 'Confirmar PIN',
    c2pre: 'Aceito os ', c2terms: 'Termos de Serviço', c2mid: ' e a ', c2priv: 'Política de Privacidade', c2post: ' do Banzami.',
    c3: 'Compreendo que, nesta fase, o negócio recebe apenas dinheiro fictício na Sandbox.',
    ativar: 'Ativar o negócio', ativando: 'A ativar…',
    doneT: 'Negócio ativado na Sandbox',
    doneP: 'Já pode criar cobranças por QR e links de pagamento com dinheiro fictício.',
    abrir: 'Abrir Beta Web', ver: 'Ver Banzami Business',
    verEstado: 'Consultar estado', suporte: 'Falar com o suporte',
    depoisLabel: 'DEPOIS DE ATIVAR', depoisA: 'Pronto para', depoisB: 'receber.',
    depoisLead: 'Assim que ativa, o negócio fica disponível na Sandbox.',
    cards: [
      { icon: 'qr' as IconName, t: 'Criar cobranças', d: 'QR com valor e descrição.', tag: '01' },
      { icon: 'link' as IconName, t: 'Links de pagamento', d: 'Partilhe por qualquer canal.', tag: '02' },
      { icon: 'list' as IconName, t: 'Histórico e comprovativos', d: 'Cada venda fica registada.', tag: '03' },
    ],
    v_pin: 'O PIN deve ter 4 a 8 dígitos.', v_pin_match: 'Os PINs não coincidem.',
    v_c2: 'É necessário aceitar os Termos.', v_c3: 'Confirme que compreende a fase Sandbox.',
    v_submit: 'Não foi possível ativar. Tente novamente.',
  },
  en: {
    badge: 'Beta · Sandbox',
    h1a: 'Activate your', h1b: 'business.',
    lead: 'Your application has been approved. Set a PIN and accept the terms to start receiving in the Sandbox.',
    smallPre: 'No activation link? ', smallLink: 'Check your application status', smallPost: '.',
    validating: 'Validating the activation link…',
    noToken: 'Open the activation link from your approval email. The link securely identifies your business.',
    invalid: 'This activation link is not valid.',
    expired: 'This activation link has expired. Ask the Banzami team for a new one.',
    used: 'This activation link has already been used.',
    rate: 'Too many attempts. Please try again later.',
    unavailable: 'Could not validate the link right now. Please try again.',
    activatePre: 'Activate ', activateFallback: 'your business',
    l_pin: 'Set a PIN', hint_pin: '4 to 8 digits. You will use it to sign in to the Banzami Business app.',
    l_pin2: 'Confirm PIN',
    c2pre: 'I accept the ', c2terms: 'Terms of Service', c2mid: ' and the ', c2priv: 'Privacy Policy', c2post: ' of Banzami.',
    c3: 'I understand that, in this phase, the business only receives test money in the Sandbox.',
    ativar: 'Activate your business', ativando: 'Activating…',
    doneT: 'Business activated in the Sandbox',
    doneP: 'You can now create QR charges and payment links with test money.',
    abrir: 'Open Beta Web', ver: 'See Banzami Business',
    verEstado: 'Check status', suporte: 'Contact support',
    depoisLabel: 'AFTER ACTIVATION', depoisA: 'Ready to', depoisB: 'get paid.',
    depoisLead: 'Once activated, the business is available in the Sandbox.',
    cards: [
      { icon: 'qr' as IconName, t: 'Create charges', d: 'QR with amount and description.', tag: '01' },
      { icon: 'link' as IconName, t: 'Payment links', d: 'Share on any channel.', tag: '02' },
      { icon: 'list' as IconName, t: 'History and receipts', d: 'Every sale is recorded.', tag: '03' },
    ],
    v_pin: 'The PIN must be 4 to 8 digits.', v_pin_match: 'The PINs do not match.',
    v_c2: 'You must accept the Terms.', v_c3: 'Confirm you understand the Sandbox phase.',
    v_submit: 'Could not activate. Please try again.',
  },
} as const;

function StepFooter({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: '28px', paddingTop: '22px', borderTop: '1px solid #F5E8E6' }}>{children}</div>;
}

const PIN_RE = /^[0-9]{4,8}$/;
type Phase = 'validating' | 'no_token' | 'error' | 'ready' | 'done';

export function ComerciantesActivarPage({ lang }: { lang: Lang }) {
  const t = T[lang];
  const sp = useSearchParams();
  const [phase, setPhase] = useState<Phase>('validating');
  const [errorMsg, setErrorMsg] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [token, setToken] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const [err, setErr] = useState<Errs>({});
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const reasonMsg = (r: string) =>
    r === 'EXPIRED' ? t.expired : r === 'USED' ? t.used : r === 'RATE_LIMITED' ? t.rate : r === 'UNAVAILABLE' ? t.unavailable : t.invalid;

  useEffect(() => {
    const tok = sp.get('token') || '';
    if (!tok) { setPhase('no_token'); return; }
    setToken(tok);
    let active = true;
    void validateActivation(tok).then((res: ActivationStatus) => {
      if (!active) return;
      if (res.valid) {
        setBusinessName(res.business_name || '');
        setPhase('ready');
      } else {
        setErrorMsg(reasonMsg(res.reason));
        setPhase('error');
      }
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const submit = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (submitting) return;
    const e2: Errs = {};
    if (!PIN_RE.test(pin.trim())) e2.pin = t.v_pin;
    else if (pin.trim() !== pin2.trim()) e2.pin2 = t.v_pin_match;
    if (!c2) e2.c2 = t.v_c2;
    if (!c3) e2.c3 = t.v_c3;
    setErr(e2);
    if (Object.keys(e2).length) {
      formRef.current?.querySelector<HTMLElement>('[name="' + Object.keys(e2)[0] + '"]')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await completeActivation(token, pin.trim());
      if (res.ok) { setPhase('done'); return; }
      if (res.status === 429) setErr({ submit: t.rate });
      else if (res.error && /PIN/i.test(res.error)) setErr({ pin: t.v_pin });
      else setErr({ submit: t.v_submit });
    } catch {
      setErr({ submit: t.v_submit });
    } finally {
      setSubmitting(false);
    }
  };

  const activateTitle = t.activatePre + (businessName || t.activateFallback);

  return (
    <>
      {/* ─── 00 · HERO ─── */}
      <section id="inicio" style={{ position: 'relative', padding: '128px 24px 56px', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-8%', top: '-20%', width: '640px', height: '640px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,210,208,.75),rgba(251,210,208,0) 68%)' }} />
          <div style={{ position: 'absolute', left: '-12%', bottom: '-40%', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,228,226,.8),rgba(255,228,226,0) 70%)' }} />
        </div>

        <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '56px', alignItems: 'center' }}>
          <Reveal>
            <Badge>{t.badge}</Badge>
            <H1 a={t.h1a} b={t.h1b} size="clamp(36px,4.2vw,56px)" />
            <HeroLead mw={600}>{t.lead}</HeroLead>
            <Small mw={600}>{t.smallPre}<a href={route('estado', lang)} style={{ fontWeight: 800 }}>{t.smallLink}</a>{t.smallPost}</Small>
          </Reveal>
          <Reveal delay={120}>
            <div ref={formRef} style={{ position: 'relative', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '28px', padding: 'clamp(22px,3vw,32px)', boxShadow: '0 40px 80px -50px rgba(122,16,22,.5)' }}>
              {phase === 'validating' && (
                <p role="status" style={{ margin: 0, padding: '20px 0', textAlign: 'center', fontSize: '14.5px', fontWeight: 700, color: '#8a7a7e' }}>{t.validating}</p>
              )}

              {(phase === 'no_token' || phase === 'error') && (
                <div role="status">
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{t.h1a} {t.h1b}</h3>
                  <p style={{ margin: '10px 0 0', fontSize: '14px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{phase === 'no_token' ? t.noToken : errorMsg}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '20px' }}>
                    <a href={route('estado', lang)} className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '12px 22px', borderRadius: '40px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none', whiteSpace: 'nowrap' }}>{t.verEstado}</a>
                    <a href={route('suporte', lang)} className="bz-btntext" style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', color: '#141014', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none' }}>{t.suporte}</a>
                  </div>
                </div>
              )}

              {phase === 'ready' && (
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{activateTitle}</h3>
                  <p style={{ margin: '6px 0 18px', fontSize: '13.5px', fontWeight: 600, color: '#8a7a7e' }}>{t.hint_pin}</p>
                  <FGrid cols={1}>
                    <Field name="pin" label={t.l_pin} type="password" placeholder="••••" mono span2 value={pin} error={err.pin} onChange={(v) => { setPin(v.replace(/[^0-9]/g, '')); setErr((x) => ({ ...x, pin: '', submit: '' })); }} />
                    <Field name="pin2" label={t.l_pin2} type="password" placeholder="••••" mono span2 value={pin2} error={err.pin2} onChange={(v) => { setPin2(v.replace(/[^0-9]/g, '')); setErr((x) => ({ ...x, pin2: '', submit: '' })); }} />
                    <Check name="c2" checked={c2} error={err.c2} onChange={(v) => { setC2(v); setErr((x) => ({ ...x, c2: '' })); }} label={<>{t.c2pre}<a href={route('termos', lang)} target="_blank" rel="noopener noreferrer">{t.c2terms}</a>{t.c2mid}<a href={route('privacidade', lang)} target="_blank" rel="noopener noreferrer">{t.c2priv}</a>{t.c2post}</>} />
                    <Check name="c3" checked={c3} error={err.c3} onChange={(v) => { setC3(v); setErr((x) => ({ ...x, c3: '' })); }} label={t.c3} />
                  </FGrid>
                  {err.submit && <p role="alert" style={{ margin: '14px 0 0', fontSize: '13.5px', fontWeight: 700, color: '#C4303C' }}>{err.submit}</p>}
                  <StepFooter><SubmitBtn type="submit" onClick={() => submit()}>{submitting ? t.ativando : t.ativar}</SubmitBtn></StepFooter>
                </div>
              )}

              {phase === 'done' && (
                <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 0 4px' }}>
                  <SuccessMark />
                  <h2 style={{ margin: '20px 0 0', fontSize: '24px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{t.doneT}</h2>
                  <p style={{ margin: '8px 0 0', maxWidth: '380px', fontSize: '14.5px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{t.doneP}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '22px' }}>
                    <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '13px 24px', borderRadius: '40px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 14px 28px -14px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)' }}>{t.abrir}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
                    <a href={route('comerciantes', lang)} className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '12px 22px', borderRadius: '40px', background: '#fff', border: '1px solid #F3E3E1', color: '#141014', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 14px 30px -22px rgba(122,16,22,.4)' }}>{t.ver}<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── 01 · DEPOIS DE ATIVAR ─── */}
      <section style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,.9fr)', gap: '20px 56px', alignItems: 'end' }}>
            <div>
              <SectionLabel n="01" label={t.depoisLabel} panel />
              <H2 a={t.depoisA} b={t.depoisB} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '480px', textWrap: 'pretty' }}>{t.depoisLead}</p>
          </div>
          <Rotator mode="card" idle="#FFF8F7" className="bz-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '14px', marginTop: '44px' }}>
            {t.cards.map((c, i) => (
              <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', padding: '20px 20px 22px', borderRadius: '22px', border: '1px solid rgba(181,16,31,.06)', background: '#FFF8F7', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}>
                    <Icon name={c.icon} color="currentColor" size={19} />
                  </span>
                  <span data-ri-tag style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', fontWeight: 600, letterSpacing: '.06em', color: '#B5101F', opacity: 0, transition: 'opacity .6s' }}>{c.tag}</span>
                </div>
                <p style={{ margin: '16px 0 0', fontSize: '16px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{c.t}</p>
                <p style={{ margin: '6px 0 0', fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{c.d}</p>
                <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', opacity: 0, transition: 'opacity .6s' }}>
                  <span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} />
                </span>
              </div>
            ))}
          </Rotator>
        </div></Reveal>
      </section>
    </>
  );
}
