'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Badge } from '../kit';
import { Rotator } from '../Rotator';
import { Reveal } from '@/components/Reveal';
import type { Lang, Loc } from '@/lib/marketing/nav';

/**
 * Verificar — ported verbatim from handoff_site_completo/pages/Verificar.dc.html
 * (PT) and Verificar EN.dc.html (EN). Body only; header/footer come from
 * <SiteShell>. The ref field (^BZM-[A-Z0-9-]{6,}$) redirects to /r/{REF}
 * (uppercased) on submit — client side.
 */

const L = (pt: string, en: string): Loc => ({ pt, en });
const CONTENT: CSSProperties = { position: 'relative', maxWidth: '1140px', margin: '0 auto' };

// ── validation copy (exact dossier strings) ─────────────────────────────────
const REF_RE = /^BZM-[A-Z0-9-]{6,}$/i;
const REF_MSG = L('Introduza a referência.', 'Enter the reference.');
const REF_BAD = L('Use o formato BZM-XXXX-XXXX.', 'Use the format BZM-XXXX-XXXX.');

// ── section data ────────────────────────────────────────────────────────────
const SHOWS: Loc[] = [
  L('Se o comprovativo é válido', 'Whether the receipt is valid'),
  L('Valor e moeda', 'Amount and currency'),
  L('Data e hora do pagamento', 'Payment date and time'),
  L('Referência BZM-', 'BZM- reference'),
  L('Ambiente (Sandbox)', 'Environment (Sandbox)'),
];
const HIDES: Loc[] = [
  L('Saldos das carteiras', 'Wallet balances'),
  L('Histórico de pagamentos', 'Payment history'),
  L('Documento, telefone ou e-mail', 'ID, phone or email'),
  L('Dados de acesso à conta', 'Account login details'),
];

const STEPS: { icon: ReactNode; n: string; t: Loc; d: Loc }[] = [
  {
    icon: <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>,
    n: '01',
    t: L('Encontre a referência', 'Find the reference'),
    d: L('No fundo do comprovativo, a começar por BZM-.', 'At the bottom of the receipt, starting with BZM-.'),
  },
  {
    icon: <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
    n: '02',
    t: L('Introduza-a aqui', 'Enter it here'),
    d: L('Escreva ou cole a referência no campo acima.', 'Type or paste the reference in the field above.'),
  },
  {
    icon: <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6z" /><path d="M9.2 11.6l1.9 1.9 3.7-3.7" /></svg>,
    n: '03',
    t: L('Veja o resultado', 'See the result'),
    d: L('Abre a página oficial de verificação do Banzami.', 'Opens Banzami’s official verification page.'),
  },
];

// ── small SVGs (exact dossier paths) ────────────────────────────────────────
function CheckSm({ color }: { color: string }) {
  return <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
function EyeOff({ color }: { color: string }) {
  return <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.2 6.3C3.6 8.1 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3" /></svg>;
}
function LabelPill({ n, label, panel }: { n: string; label: string; panel?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '5px 16px 5px 5px', borderRadius: '30px', background: panel ? 'linear-gradient(180deg,#FFF6F5,#FFEDEB)' : 'linear-gradient(180deg,#fff,#FFF8F7)', border: '1px solid rgba(181,16,31,.1)', boxShadow: '0 10px 26px -18px rgba(181,16,31,.55),inset 0 1px 0 #fff' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '30px', height: '24px', padding: '0 8px', borderRadius: '20px', background: 'linear-gradient(150deg,#D0182A,#8E1620)', color: '#fff', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 600, letterSpacing: '.02em', boxShadow: '0 6px 12px -6px rgba(181,16,31,.7),inset 0 1px 0 rgba(255,255,255,.25)' }}>{n}</span>
      <span aria-hidden="true" style={{ width: '14px', height: '1px', background: 'rgba(181,16,31,.35)' }} />
      <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '.22em', color: '#B5101F' }}>{label}</span>
    </span>
  );
}
function H2R({ a, b }: { a: string; b: string }) {
  return (
    <h2 style={{ margin: '20px 0 0', fontSize: 'clamp(32px,3.5vw,44px)', lineHeight: 1.06, fontWeight: 900, letterSpacing: '-.03em', color: '#141014', textWrap: 'balance' }}>
      {a}<br /><span style={{ color: '#B5101F' }}>{b}</span>
    </h2>
  );
}

// ── the phone receipt mockup (decorative, aria-hidden) ──────────────────────
function ReceiptPhone({ lang, clock, todayStr }: { lang: Lang; clock: string; todayStr: string }) {
  const rows: [Loc, ReactNode][] = [
    [L('De', 'From'), '@ana'],
    [L('Para', 'To'), '@maria'],
    [L('Descrição', 'Description'), 'vaquinha'],
    [L('Data', 'Date'), todayStr],
    [L('Operação', 'Operation'), '@banza'],
    [L('Fonte', 'Source'), lang === 'en' ? 'Banzami balance' : 'Saldo Banzami'],
    [L('Referência', 'Reference'), 'BZM-3HNA-GZST-…'],
  ];
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '560px' }}>
      <div style={{ position: 'relative', filter: 'drop-shadow(0 50px 60px rgba(60,0,8,.35))' }}>
        <div className="bz-phones" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative' }}>
            <div aria-hidden="true" style={{ transform: 'rotate(3deg)', zIndex: 1, position: 'relative', flex: 'none', width: '228px', height: '512px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)' }}>
              <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: 'linear-gradient(180deg,#C51A2A 0%,#9A0A18 45%,#65050E 100%)', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
                {/* status bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', fontSize: '10px', fontWeight: 700, color: '#fff' }}>
                  <span>{clock}</span>
                  <span style={{ width: '58px', height: '17px', borderRadius: '10px', background: '#0b0b0b' }} />
                  <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <svg width="14" height="9" viewBox="0 0 14 9"><rect x="0" y="6" width="2.4" height="3" rx=".6" fill="#fff" /><rect x="3.8" y="4.2" width="2.4" height="4.8" rx=".6" fill="#fff" /><rect x="7.6" y="2.2" width="2.4" height="6.8" rx=".6" fill="#fff" /><rect x="11.4" y="0" width="2.4" height="9" rx=".6" fill="rgba(255,255,255,.45)" /></svg>
                    <svg width="12" height="9" viewBox="0 0 12 9"><path d="M6 8.6l1.9-2.1a2.7 2.7 0 0 0-3.8 0z" fill="#fff" /><path d="M2.6 5.1a4.9 4.9 0 0 1 6.8 0" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /><path d="M.8 3.1a7.5 7.5 0 0 1 10.4 0" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>
                    <svg width="20" height="9" viewBox="0 0 20 9"><rect x=".6" y=".6" width="16.4" height="7.8" rx="2.2" fill="none" stroke="#fff" strokeWidth="1.1" /><rect x="2" y="2" width="13.6" height="5" rx="1.2" fill="#fff" /><rect x="18" y="3" width="1.4" height="3" rx=".6" fill="rgba(255,255,255,.45)" /></svg>
                  </span>
                </div>
                {/* title bar */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 6px 0' }}>
                  <svg style={{ position: 'absolute', left: '8px' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,.9)' }}>{lang === 'en' ? 'Receipt' : 'Comprovativo'}</span>
                </div>
                {/* body */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ marginTop: '4px', fontSize: '6.5px', fontWeight: 800, letterSpacing: '.3em', color: '#fff' }}>BANZAMI</div>
                  <div style={{ position: 'relative', marginTop: '3px', width: '46px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.3px dashed rgba(255,255,255,.7)', animation: 'bzspin 9s linear infinite' }} />
                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#C0202C,#6E0610)', boxShadow: '0 0 0 4px rgba(255,255,255,.08),0 6px 14px -4px rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </div>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '10.5px', fontWeight: 700, color: 'rgba(255,255,255,.9)' }}>{lang === 'en' ? 'Sent successfully' : 'Enviado com sucesso'}</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-.02em', color: '#fff', lineHeight: 1.2 }}>1 500 Kz</div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,.7)' }}>{lang === 'en' ? 'to @maria' : 'para @maria'}</div>
                  <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '10px', background: '#FCEFC4', border: '1px solid #E9C66A', fontSize: '7.5px', fontWeight: 800, color: '#7A4A06' }}>{lang === 'en' ? 'SANDBOX • Test money' : 'SANDBOX • Dinheiro de teste'}</div>
                </div>
                {/* detail rows */}
                <div style={{ margin: '7px 4px 0', padding: '2px 9px', borderRadius: '12px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', fontSize: '8px' }}>
                  {rows.map(([k, v], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '3.5px 0', ...(i < rows.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,.12)' } : {}) }}>
                      <span style={{ color: 'rgba(255,255,255,.7)' }}>{k[lang]}</span>
                      <span style={{ fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ margin: '6px 4px 0', padding: '7px', borderRadius: '12px', background: '#fff', color: '#B5101F', fontSize: '10.5px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.8" /></svg>{lang === 'en' ? 'Done' : 'Concluído'}
                </div>
                <div style={{ margin: '5px 4px 0', padding: '7px', borderRadius: '12px', background: 'rgba(0,0,0,.14)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontSize: '9.5px', fontWeight: 700, textAlign: 'center' }}>{lang === 'en' ? 'Share receipt' : 'Partilhar comprovativo'}</div>
                <span style={{ position: 'absolute', bottom: '6px', left: '50%', transform: 'translateX(-50%)', width: '76px', height: '4px', borderRadius: '3px', background: 'rgba(0,0,0,.35)' }} />
              </div>
            </div>
            {/* floating "valid receipt" card */}
            <div aria-hidden="true" className="sp-float" style={{ position: 'absolute', zIndex: 3, left: '-60px', bottom: '90px', width: '220px', padding: '14px 16px', borderRadius: '18px', background: '#fff', boxShadow: '0 26px 50px -20px rgba(122,16,22,.45)', animation: 'floaty 6s ease-in-out infinite' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#1E8E4E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#141014' }}>{lang === 'en' ? 'Valid receipt' : 'Comprovativo válido'}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', color: '#9a8487' }}>BZM-7Q4K-2M9A</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ page ═══════════════════
export function VerificarPage({ lang }: { lang: Lang }) {
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  const [clock, setClock] = useState('');
  const [todayStr, setTodayStr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fmtClock = () => { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
    const fmtDate = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
    setClock(fmtClock());
    setTodayStr(fmtDate());
    const t = setInterval(() => setClock((c) => { const n = fmtClock(); return n !== c ? n : c; }), 1000);
    return () => clearInterval(t);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Exact dossier validation: required, then format.
    if (ref === '' || ref === undefined) { setErr(REF_MSG[lang]); inputRef.current?.focus(); return; }
    if (!REF_RE.test(ref.trim())) { setErr(REF_BAD[lang]); inputRef.current?.focus(); return; }
    setErr('');
    const r = ref.trim().toUpperCase();
    window.location.href = '/r/' + encodeURIComponent(r);
  }

  const focus = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = '#D8121F'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(216,18,31,.12)'; };
  const blur = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = '#EFDCDA'; e.currentTarget.style.boxShadow = 'none'; };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width:920px){.sp-herogrid{grid-template-columns:1fr!important;gap:34px!important}.sp-herobg{top:auto!important;bottom:0!important;height:620px!important;left:0!important}}
        @media (max-width:980px){.sp-float{display:none!important}}
      ` }} />

      {/* ─────────── 00 · HERO (#inicio) ─────────── */}
      <section id="inicio" style={{ position: 'relative', padding: '112px 24px 64px', overflow: 'hidden', background: '#fff', borderRadius: '0 0 48px 48px', boxShadow: '0 40px 80px -60px rgba(122,16,22,.45)' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div className="sp-herobg" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/hero-bg-red.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
          </div>
        </div>

        <div className="sp-herogrid" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '48px', alignItems: 'center' }}>
          <Reveal>
            <Badge>{lang === 'en' ? 'Beta · Sandbox' : 'Versão Beta · Sandbox'}</Badge>
            <h1 style={{ margin: '22px 0 0', fontSize: 'clamp(38px,4.6vw,62px)', fontWeight: 900, lineHeight: 1.02, letterSpacing: '-.035em', color: '#141014', textWrap: 'balance' }}>
              {lang === 'en' ? 'Verify a' : 'Verifique um'}<br /><span style={{ color: '#B5101F' }}>{lang === 'en' ? 'Banzami receipt.' : 'comprovativo Banzami.'}</span>
            </h1>
            <p style={{ margin: '20px 0 0', fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.55, color: '#4a3a3e', fontWeight: 600, maxWidth: '540px', textWrap: 'pretty' }}>
              {lang === 'en'
                ? 'Enter the reference to confirm a receipt is genuine and matches a recorded payment.'
                : 'Introduza a referência para confirmar que um comprovativo é verdadeiro e corresponde a um pagamento registado.'}
            </p>
            <div style={{ marginTop: '26px', maxWidth: '540px', padding: '18px', borderRadius: '24px', background: '#fff', border: '1px solid #F3E3E1', boxShadow: '0 30px 60px -40px rgba(122,16,22,.5)' }}>
              <form onSubmit={submit}>
                <div className="bz-fgrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(1,minmax(0,1fr))', gap: '16px 18px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', minWidth: 0, gridColumn: '1 / -1' }}>
                    <label htmlFor="f_ref" style={{ fontSize: '13px', fontWeight: 800, color: '#2a2024' }}>{lang === 'en' ? 'Receipt reference' : 'Referência do comprovativo'} <span aria-hidden="true" style={{ color: '#B5101F' }}>*</span></label>
                    <input
                      id="f_ref"
                      name="ref"
                      ref={inputRef}
                      value={ref}
                      onChange={(e) => { setRef(e.target.value); if (err) setErr(''); }}
                      aria-required="true"
                      type="text"
                      placeholder="BZM-7Q4K-2M9A"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      onFocus={focus}
                      onBlur={blur}
                      style={{ width: '100%', padding: '13px 15px', borderRadius: '14px', border: '1px solid #EFDCDA', background: '#fff', fontSize: '15px', fontWeight: 600, color: '#141014', outline: 'none', transition: 'border-color .2s,box-shadow .2s', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '.04em' }}
                    />
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#9a8487' }}>{lang === 'en' ? 'It is at the bottom of the receipt, starting with BZM-.' : 'Está no fundo do comprovativo, a começar por BZM-.'}</p>
                    {err && (
                      <p role="alert" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: '#C8101F' }}>
                        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C8101F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11.5v4.5M12 8h.01" /></svg>{err}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: '14px' }}>
                  <button type="submit" className="bz-acbg" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '14px 26px', border: 'none', cursor: 'pointer', borderRadius: '40px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', whiteSpace: 'nowrap', boxShadow: '0 14px 28px -14px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)' }}>
                    {lang === 'en' ? 'Verify a receipt' : 'Verificar comprovativo'}
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>
              </form>
            </div>
          </Reveal>
          <ReceiptPhone lang={lang} clock={clock} todayStr={todayStr} />
        </div>
      </section>

      {/* ─────────── 01 · O QUE A VERIFICAÇÃO MOSTRA ─────────── */}
      <section style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,.9fr)', gap: '20px 56px', alignItems: 'end' }}>
            <div>
              <LabelPill n="01" label={lang === 'en' ? 'WHAT VERIFICATION SHOWS' : 'O QUE A VERIFICAÇÃO MOSTRA'} panel />
              <H2R a={lang === 'en' ? 'Enough to trust,' : 'O suficiente para confiar,'} b={lang === 'en' ? 'nothing more.' : 'nada mais.'} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '480px', textWrap: 'pretty' }}>
              {lang === 'en' ? 'The verification page confirms the payment without exposing anyone’s account.' : 'A página de verificação confirma o pagamento sem expor a conta de ninguém.'}
            </p>
          </div>
          <div className="bz-g2s" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '44px' }}>
            {/* shows */}
            <div style={{ position: 'relative', overflow: 'hidden', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '24px', boxShadow: '0 26px 56px -40px rgba(122,16,22,.45)', padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(150deg,#D8121F,#8E1620)', color: '#fff', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px -8px rgba(181,16,31,.6)' }}>
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                </span>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{lang === 'en' ? 'Shows' : 'Mostra'}</h3>
              </div>
              <div style={{ marginTop: '10px' }}>
                {SHOWS.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #F5E8E6' }}>
                    <span style={{ flex: 'none', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E3F4EA' }}><CheckSm color="#1E8E4E" /></span>
                    <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#141014' }}>{it[lang]}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* does not reveal */}
            <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg,#2a2023,#140f10)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '24px', boxShadow: '0 30px 60px -34px rgba(20,10,12,.8)', color: '#fff', padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#FF9A8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.2 6.3C3.6 8.1 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3" /></svg>
                </span>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#fff' }}>{lang === 'en' ? 'Does not reveal' : 'Não revela'}</h3>
              </div>
              <div style={{ marginTop: '10px' }}>
                {HIDES.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                    <span style={{ flex: 'none', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.08)' }}><EyeOff color="#FF9A8A" /></span>
                    <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'rgba(255,255,255,.88)' }}>{it[lang]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div></Reveal>
      </section>

      {/* ─────────── 02 · COMO FUNCIONA ─────────── */}
      <section style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <div>
            <LabelPill n="02" label={lang === 'en' ? 'HOW IT WORKS' : 'COMO FUNCIONA'} />
            <H2R a={lang === 'en' ? 'Three steps,' : 'Três passos,'} b={lang === 'en' ? 'a few seconds.' : 'poucos segundos.'} />
          </div>
          <Rotator mode="card" idle="rgba(255,255,255,.55)" className="bz-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '14px', marginTop: '44px' }}>
            {STEPS.map((s, i) => (
              <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', padding: '20px 20px 22px', borderRadius: '22px', border: '1px solid rgba(181,16,31,.06)', background: 'rgba(255,255,255,.55)', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}>{s.icon}</span>
                  <span data-ri-tag style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', fontWeight: 600, letterSpacing: '.06em', color: '#B5101F', opacity: 0, transition: 'opacity .6s' }}>{s.n}</span>
                </div>
                <p style={{ margin: '16px 0 0', fontSize: '16px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{s.t[lang]}</p>
                <p style={{ margin: '6px 0 0', fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{s.d[lang]}</p>
                <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', opacity: 0, transition: 'opacity .6s' }}><span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} /></span>
              </div>
            ))}
          </Rotator>
        </div></Reveal>
      </section>
    </>
  );
}
