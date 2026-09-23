import { SectionLabel, Icon, ArrowIcon, tok, type IconName } from './kit';
import { Rotator } from './Rotator';
import { LiveClock } from '@/components/site/LiveClock';
import { CodeWindow } from './CodeWindow';
import { route, type Lang, type Loc } from '@/lib/marketing/nav';

const L = (pt: string, en: string): Loc => ({ pt, en });
const APP_URL = 'https://app.banzami.com/';
const CONSOLE_URL = '/developers/login';
const DOCS_URL = '/developers/docs';

// ── phone status bar (dossier sbar) ─────────────────────────────────────────
function SBar({ dark }: { dark?: boolean }) {
  const c = dark ? '#fff' : '#141014';
  const m = dark ? 'rgba(255,255,255,.45)' : '#b3aeaf';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', fontSize: '10px', fontWeight: 700, color: c }}>
      <span><LiveClock kind="hm" /></span>
      <span style={{ width: '58px', height: '17px', borderRadius: '10px', background: '#0b0b0b' }} />
      <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <svg width="14" height="9" viewBox="0 0 14 9"><rect x="0" y="6" width="2.4" height="3" rx=".6" fill={c} /><rect x="3.8" y="4.2" width="2.4" height="4.8" rx=".6" fill={c} /><rect x="7.6" y="2.2" width="2.4" height="6.8" rx=".6" fill={c} /><rect x="11.4" y="0" width="2.4" height="9" rx=".6" fill={m} /></svg>
        <svg width="20" height="9" viewBox="0 0 20 9"><rect x=".6" y=".6" width="16.4" height="7.8" rx="2.2" fill="none" stroke={c} strokeWidth="1.1" /><rect x="2" y="2" width="13.6" height="5" rx="1.2" fill={c} /></svg>
      </span>
    </div>
  );
}
const HomeInd = ({ c = '#bdb5b6' }: { c?: string }) => <span style={{ position: 'absolute', bottom: '6px', left: '50%', transform: 'translateX(-50%)', width: '76px', height: '4px', borderRadius: '3px', background: c }} />;

// ═══════════════════ 01 · COMO FUNCIONA ═══════════════════
const CF = {
  h2a: L('Ler.', 'Read.'), h2b: L('Confirmar.', 'Confirm.'), h2c: L('Pagar.', 'Pay.'),
  lead: L('Do QR ou de um @banza ao comprovativo, em três passos.', 'From a QR or a @banza to the receipt, in three steps.'),
  cta: L('Experimentar a app web', 'Try the web app'),
  note: L('Simples.\nSeguro.\nAngolano.', 'Simple.\nSecure.\nAngolan.'),
  steps: [
    { t: L('Ler', 'Read'), d: L('Leia o QR ou use um @banza', 'Read the QR or use a @banza') },
    { t: L('Confirmar', 'Confirm'), d: L('Revise os detalhes e confirme', 'Review the details and confirm') },
    { t: L('Pagar', 'Pay'), d: L('Receba o comprovativo instantaneamente', 'Get the receipt instantly') },
  ],
  step: L('PASSO', 'STEP'),
};

function PhoneScan() {
  return (
    <div style={{ position: 'relative', flex: 'none', width: '228px', height: '512px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)', transform: 'rotate(-5deg) translateY(22px)', zIndex: 1 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#0b0b0d', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBar dark />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 6px 0' }}>
          <span style={{ width: '26px', height: '26px', borderRadius: '9px', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></span>
          <span style={{ width: '26px', height: '26px', borderRadius: '9px', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg></span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '148px', height: '148px', borderRadius: '20px', border: '2px solid #E0303A', boxShadow: '0 0 30px -4px rgba(224,48,58,.65),inset 0 0 20px -6px rgba(224,48,58,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/qr-banzami.png" alt="" style={{ width: '118px', height: 'auto', display: 'block', borderRadius: '12px' }} />
            <span style={{ position: 'absolute', left: '10px', right: '10px', height: '2px', borderRadius: '2px', background: '#FF3B45', boxShadow: '0 0 12px 2px rgba(255,59,69,.7)', animation: 'bzScanline 2.2s ease-in-out infinite alternate' }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '22px' }}><span style={{ padding: '9px 16px', borderRadius: '20px', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: '10px', fontWeight: 700 }}>Aponte para o código QR</span></div>
        <HomeInd c="rgba(255,255,255,.4)" />
      </div>
    </div>
  );
}
function PhoneConfirm() {
  return (
    <div style={{ position: 'relative', flex: 'none', width: '228px', height: '512px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)', zIndex: 2 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#FBF6F5', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBar />
        <div style={{ padding: '12px 8px 0' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1d1a1b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg><div style={{ marginTop: '8px', fontSize: '17px', fontWeight: 800, letterSpacing: '-.02em', color: '#1d1a1b' }}>Confirmar pagamento</div></div>
        <div style={{ marginTop: '22px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'linear-gradient(135deg,#C8101F 0%,#E0303A 45%,#8E1620 100%)', color: '#fff', fontSize: '24px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>M</div>
          <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 700, color: '#1d1a1b' }}>@maria</div>
          <div style={{ marginTop: '4px', fontSize: '8.5px', color: '#9a8487' }}>Solicitou um pagamento</div>
          <div style={{ marginTop: '12px', padding: '9px 20px', borderRadius: '24px', background: '#B5101F', color: '#fff', fontSize: '20px', fontWeight: 800, letterSpacing: '-.02em' }}>1 500 Kz</div>
          <div style={{ marginTop: '10px', fontSize: '10px', fontStyle: 'italic', color: '#5a4a4e' }}>vaquinha</div>
        </div>
        <div style={{ margin: '16px 8px 0', padding: '10px 12px', borderTop: '1px solid #F1E6E4', borderBottom: '1px solid #F1E6E4', display: 'flex', alignItems: 'center', gap: '9px' }}>
          <span style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#F4ECEB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="12" height="12" viewBox="0 0 24 24"><rect x="3" y="5" width="16" height="15" rx="3" fill="#C8101F" /><rect x="12" y="10" width="10" height="6" rx="2" fill="#F4ECEB" /><circle cx="15" cy="13" r="1.3" fill="#C8101F" /></svg></span>
          <div><div style={{ fontSize: '8px', color: '#9a8487' }}>Método de pagamento</div><div style={{ fontSize: '10px', fontWeight: 700, color: '#1d1a1b' }}>Saldo Banzami</div></div>
        </div>
        <div style={{ margin: 'auto 8px 0', padding: '10px', borderRadius: '14px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '11px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>Pagar 1 500 Kz</div>
        <div style={{ margin: '6px 0 16px', textAlign: 'center', fontSize: '8.5px', color: '#9a8487' }}>Pagamento irreversível</div>
        <HomeInd />
      </div>
    </div>
  );
}
function PhoneReceipt() {
  const Row = ({ k, v, last }: { k: string; v: React.ReactNode; last?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '3.5px 0', borderBottom: last ? undefined : '1px solid rgba(255,255,255,.12)' }}>
      <span style={{ color: 'rgba(255,255,255,.7)' }}>{k}</span><span style={{ fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
    </div>
  );
  return (
    <div style={{ position: 'relative', flex: 'none', width: '228px', height: '512px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)', transform: 'rotate(4deg) translateY(18px)', zIndex: 1 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: 'linear-gradient(180deg,#C51A2A 0%,#9A0A18 45%,#65050E 100%)', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBar dark />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 6px 0' }}><svg style={{ position: 'absolute', left: '8px' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg><span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,.9)' }}>Comprovativo</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ marginTop: '4px', fontSize: '6.5px', fontWeight: 800, letterSpacing: '.3em', color: '#fff' }}>BANZAMI</div>
          <div style={{ position: 'relative', marginTop: '3px', width: '46px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.3px dashed rgba(255,255,255,.7)', animation: 'bzspin 9s linear infinite' }} />
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#C0202C,#6E0610)', boxShadow: '0 0 0 4px rgba(255,255,255,.08),0 6px 14px -4px rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
          </div>
          <div style={{ marginTop: '6px', fontSize: '10.5px', fontWeight: 700, color: 'rgba(255,255,255,.9)' }}>Enviado com sucesso</div>
          <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-.02em', color: '#fff', lineHeight: 1.2 }}>1 500 Kz</div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,.7)' }}>para @maria</div>
          <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '10px', background: '#FCEFC4', border: '1px solid #E9C66A', fontSize: '7.5px', fontWeight: 800, color: '#7A4A06' }}>SANDBOX • Dinheiro de teste</div>
        </div>
        <div style={{ margin: '7px 4px 0', padding: '2px 9px', borderRadius: '12px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', fontSize: '8px' }}>
          <Row k="De" v="@ana" /><Row k="Para" v="@maria" /><Row k="Descrição" v="vaquinha" /><Row k="Data" v={<LiveClock kind="date" />} /><Row k="Operação" v="@banza" /><Row k="Fonte" v="Saldo Banzami" /><Row k="Referência" v="BZM-3HNA-GZST-…" last />
        </div>
        <div style={{ margin: '6px 4px 0', padding: '7px', borderRadius: '12px', background: '#fff', color: '#B5101F', fontSize: '10.5px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.8" /></svg>Concluído</div>
        <div style={{ margin: '5px 4px 0', padding: '7px', borderRadius: '12px', background: 'rgba(0,0,0,.14)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontSize: '9.5px', fontWeight: 700, textAlign: 'center' }}>Partilhar comprovativo</div>
        <HomeInd c="rgba(0,0,0,.35)" />
      </div>
    </div>
  );
}
const Connector = ({ delay }: { delay: string }) => (
  <div aria-hidden="true" style={{ position: 'relative', zIndex: 0, flex: 'none', width: '38px', margin: '0 -8px', alignSelf: 'center', height: '2px', background: 'linear-gradient(90deg,rgba(224,48,58,0),#E0303A)' }}>
    <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: '10px', height: '10px', borderRadius: '50%', background: '#D8121F', boxShadow: '0 0 0 4px rgba(216,18,31,.18)', animation: `bzdotmove 3.6s ease-in-out ${delay} infinite` }} />
  </div>
);

export function HomeComoFunciona({ lang }: { lang: Lang }) {
  return (
    <section id="como-funciona" style={{ position: 'relative', padding: 'clamp(64px,7vw,104px) 24px clamp(56px,6vw,88px)', overflow: 'hidden' }}>
      <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '.8fr 1.2fr', gap: '40px', alignItems: 'center' }}>
        <div className="bz-first">
          <SectionLabel n="01" label={lang === 'en' ? 'HOW IT WORKS' : 'COMO FUNCIONA'} />
          <h2 style={{ margin: '20px 0 0', fontSize: 'clamp(34px,3.9vw,50px)', lineHeight: 1.04, fontWeight: 900, letterSpacing: '-.03em', color: '#141014' }}>{CF.h2a[lang]}<br />{CF.h2b[lang]}<br /><span style={{ color: '#B5101F' }}>{CF.h2c[lang]}</span></h2>
          <p style={{ margin: '18px 0 0', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '360px', textWrap: 'pretty' }}>{CF.lead[lang]}</p>
          <div style={{ display: 'flex', marginTop: '28px' }}>
            <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '13px 24px', borderRadius: '40px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 14px 28px -14px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)' }}>{CF.cta[lang]}<ArrowIcon color="#fff" /></a>
          </div>
        </div>
        <div style={{ position: 'relative', minHeight: '540px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div aria-hidden="true" style={{ position: 'absolute', left: '4%', right: '-6%', top: '4%', bottom: '4%', borderRadius: '46% 54% 40% 60% / 55% 40% 60% 45%', background: 'radial-gradient(circle at 55% 45%,#FFD9D7 0%,#FFE8E6 50%,rgba(255,240,239,0) 75%)' }} />
          <div className="bz-phones" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <PhoneScan /><Connector delay="0s" /><PhoneConfirm /><Connector delay="1.8s" /><PhoneReceipt />
          </div>
          <Rotator mode="card" className="bz-g3" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,168px))', gap: '18px', marginTop: '40px' }}>
            {CF.steps.map((s, i) => (
              <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', padding: '16px 16px 18px', borderRadius: '20px', border: '1px solid rgba(181,16,31,.06)', background: 'rgba(255,255,255,.45)', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span data-ri-num style={{ flex: 'none', width: '32px', height: '32px', borderRadius: '11px', background: '#FFF1F0', color: '#B5101F', fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(181,16,31,.1)', transition: 'background .6s,color .6s,box-shadow .6s' }}>{String(i + 1).padStart(2, '0')}</span>
                  <span data-ri-tag style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '.16em', color: '#B5101F', opacity: 0, transition: 'opacity .6s' }}>{CF.step[lang]} {i + 1}/3</span>
                </div>
                <p style={{ margin: '14px 0 0', fontSize: '16px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{s.t[lang]}</p>
                <p style={{ margin: '4px 0 0', fontSize: '13px', lineHeight: 1.45, fontWeight: 600, color: '#8a7a7e' }}>{s.d[lang]}</p>
                <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', transition: 'opacity .6s' }}><span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} /></span>
              </div>
            ))}
          </Rotator>
        </div>
      </div>
      <div aria-hidden="true" className="bz-note" style={{ position: 'absolute', fontFamily: "'Caveat',cursive", fontWeight: 600, lineHeight: 1.05, pointerEvents: 'none', right: 'max(18px,calc(50% - 700px))', top: '44%', color: '#9a8a8e', fontSize: '28px', transform: 'rotate(-10deg)', whiteSpace: 'pre-line' }}>{CF.note[lang]}</div>
    </section>
  );
}

// ═══════════════════ 02 · PARA NEGÓCIOS ═══════════════════
const NG = {
  h2a: L('Receba com', 'Get paid with'), h2b: L('Banzami Business.', 'Banzami Business.'),
  lead: L('QR, links e ferramentas de cobrança para receber pagamentos na Sandbox.', 'QR, links and billing tools to receive payments in the Sandbox.'),
  cta: L('Ver soluções para negócios', 'See business solutions'),
  note: L('O seu negócio\ntambém\navança.', 'Your business\nmoves\nforward too.'),
  feats: [
    { icon: 'qr' as IconName, t: L('QR dinâmico', 'Dynamic QR'), d: L('Receba em segundos', 'Receive in seconds') },
    { icon: 'link' as IconName, t: L('Links de pagamento', 'Payment links'), d: L('Partilhe por qualquer canal', 'Share on any channel') },
    { icon: 'cal' as IconName, t: L('Gestão simples', 'Simple management'), d: L('Acompanhe os seus recebimentos', 'Track your payments') },
    { icon: 'plug' as IconName, t: L('Integração fácil', 'Easy integration'), d: L('Funciona com os seus sistemas', 'Works with your systems') },
  ],
};
function PhoneCobranca() {
  return (
    <div style={{ position: 'relative', width: '228px', height: '468px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)', transform: 'rotate(-5deg) translate(30px,22px)', zIndex: 1 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#fff', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBar />
        <div style={{ padding: '12px 8px 0' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1d1a1b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg><div style={{ marginTop: '8px', fontSize: '18px', fontWeight: 800, letterSpacing: '-.02em', color: '#1d1a1b' }}>Nova cobrança</div></div>
        <div style={{ marginTop: '22px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: '8.5px', fontWeight: 600, color: '#9a8487' }}>Sandbox · Cantina do Alex</div>
          <div style={{ marginTop: '2px', fontSize: '26px', fontWeight: 900, letterSpacing: '-.03em', color: '#B5101F', lineHeight: 1.1 }}>1 500 Kz</div>
          <div style={{ marginTop: '2px', fontSize: '10px', color: '#9a8487' }}>Saldo de dados</div>
          <div style={{ position: 'relative', marginTop: '14px', padding: '10px', background: '#fff', borderRadius: '16px', boxShadow: '0 6px 22px -8px rgba(122,16,22,.18)', display: 'flex' }}>
            <svg viewBox="0 0 25 25" width="118" height="118" shapeRendering="crispEdges"><path d="M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2zM18 0h7v7h-7zM19 1v5h5V1zM20 2h3v3h-3zM0 18h7v7H0zM1 19v5h5v-5zM2 20h3v3H2z" fill="#B5101F" fillRule="evenodd" /><path d="M8 0h1v2H8zM10 1h2v1h-2zM13 0h1v3h-1zM15 1h2v2h-2zM9 3h2v1H9zM8 5h1v2H8zM11 5h3v1h-3zM15 4h1v3h-1zM0 8h2v1H0zM3 8h1v2H3zM5 9h2v1H5zM1 11h2v1H1zM0 13h1v2H0zM4 12h2v2H4zM2 15h3v1H2zM6 16h1v1H6zM18 8h2v1h-2zM22 8h3v1h-3zM19 10h1v2h-1zM21 11h2v1h-2zM24 10h1v3h-1zM18 13h2v1h-2zM22 14h2v2h-2zM19 16h1v1h-1zM24 17h1v2h-1zM8 18h2v1H8zM11 19h1v2h-1zM8 21h2v2H8zM13 18h3v1h-3zM14 20h1v3h-1zM16 22h2v1h-2zM19 19h2v1h-2zM22 20h1v2h-1zM18 22h1v3h-1zM20 23h3v1h-3zM11 23h2v2h-2zM9 24h1v1H9zM24 24h1v1h-1zM9 8h2v1H9zM12 9h1v2h-1zM7 10h1v1H7zM14 8h1v1h-1zM16 9h1v2h-1zM8 13h1v1H8zM16 14h1v2h-1zM13 16h2v1h-2zM9 16h1v1H9zM20 18h1v1h-1zM23 22h1v1h-1z" fill="#1d1a1b" /><rect x="9.5" y="9.5" width="6" height="6" rx="1.4" fill="#fff" /></svg>
            <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(150deg,#E0202E,#9A1B22)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', padding: '6px' }}><span style={{ background: '#fff', borderRadius: '2px' }} /><span style={{ background: '#FFC9C6', borderRadius: '2px' }} /><span style={{ background: '#FFC9C6', borderRadius: '2px' }} /><span style={{ background: '#2a1a1c', borderRadius: '2px', transform: 'scale(.6)' }} /></span>
          </div>
        </div>
        <div style={{ margin: '14px 10px 0', padding: '10px', borderRadius: '12px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '10.5px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>Partilhar link</div>
        <div style={{ margin: '8px 8px 0', padding: '9px', borderRadius: '12px', border: '1.2px solid #B5101F', color: '#B5101F', fontSize: '10.5px', fontWeight: 800, textAlign: 'center' }}>Nova cobrança</div>
        <HomeInd />
      </div>
    </div>
  );
}
function PhoneRecebido() {
  return (
    <div style={{ position: 'relative', width: '228px', height: '468px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)', zIndex: 2 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#fff', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: '40px', background: 'radial-gradient(circle at 50% 38%,rgba(255,220,220,.55) 0%,rgba(255,255,255,0) 45%)' }}>
          <div style={{ fontSize: '7.5px', fontWeight: 800, letterSpacing: '.3em', color: '#9A1B22' }}>BANZAMI</div>
          <div style={{ marginTop: '8px', width: '74px', height: '74px', borderRadius: '50%', background: 'rgba(229,52,62,.85)', boxShadow: '0 0 26px 6px rgba(229,52,62,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '62px', height: '62px', borderRadius: '50%', border: '1.5px dashed rgba(255,255,255,.85)', animation: 'bzspinccw 9s linear infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '44px', height: '44px', borderRadius: '50%', animation: 'bzspin 9s linear infinite', background: 'radial-gradient(circle at 40% 35%,#E0303A,#9A1B22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div></div></div>
          <div style={{ marginTop: '14px', fontSize: '13px', fontWeight: 700, color: '#1d1a1b' }}>Pagamento recebido</div>
          <div style={{ marginTop: '4px', fontSize: '30px', fontWeight: 900, letterSpacing: '-.03em', color: '#B5101F' }}>1 500 Kz</div>
          <div style={{ marginTop: '2px', fontSize: '11px', color: '#5a4a4e' }}>de @maria</div>
          <div style={{ marginTop: '4px', fontSize: '10px', fontStyle: 'italic', color: '#9a8487' }}>&quot;Saldo de dados&quot;</div>
          <div style={{ marginTop: '6px', fontSize: '9.5px', color: '#9a8487' }}>O valor já entrou na sua carteira.</div>
        </div>
        <div style={{ margin: '0 14px 22px', padding: '11px', borderRadius: '14px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '11px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>Concluir</div>
        <HomeInd />
      </div>
    </div>
  );
}

export function HomeNegocios({ lang }: { lang: Lang }) {
  return (
    <section id="negocios" style={{ position: 'relative', padding: 'clamp(56px,7vw,96px) 24px', margin: '28px 14px', borderRadius: '48px', overflow: 'hidden', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)' }}>
      <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '.95fr .6fr 1.25fr', gap: '36px', alignItems: 'center' }}>
        <div className="bz-first">
          <SectionLabel n="02" label={lang === 'en' ? 'FOR BUSINESSES' : 'PARA NEGÓCIOS'} panel />
          <h2 style={{ margin: '20px 0 0', fontSize: 'clamp(32px,3.5vw,44px)', lineHeight: 1.06, fontWeight: 900, letterSpacing: '-.03em', color: '#141014' }}>{NG.h2a[lang]}<br /><span style={{ color: '#B5101F' }}>{NG.h2b[lang]}</span></h2>
          <p style={{ margin: '16px 0 0', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '420px', textWrap: 'pretty' }}>{NG.lead[lang]}</p>
          <div style={{ display: 'flex', marginTop: '28px' }}>
            <a href={route('comerciantes', lang)} className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '13px 24px', borderRadius: '40px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 20px 40px -16px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)' }}>{NG.cta[lang]}<ArrowIcon color="#fff" size={18} /></a>
          </div>
        </div>
        <Rotator mode="list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {NG.feats.map((f, i) => (
            <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', display: 'flex', gap: '14px', alignItems: 'center', padding: '13px 16px 13px 13px', borderRadius: '18px', border: '1px solid transparent', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
              <span data-ri-ic style={{ position: 'relative', flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s,transform .6s' }}><Icon name={f.icon} color="currentColor" size={19} /></span>
              <div style={{ minWidth: 0 }}><p style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#141014' }}>{f.t[lang]}</p><p style={{ margin: '3px 0 0', fontSize: '13px', lineHeight: 1.4, fontWeight: 600, color: '#8a7a7e' }}>{f.d[lang]}</p></div>
              <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} /></span>
            </div>
          ))}
        </Rotator>
        <div style={{ position: 'relative', minHeight: '520px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div aria-hidden="true" style={{ position: 'absolute', right: '-8%', top: '2%', width: '92%', height: '96%', borderRadius: '46% 54% 40% 60% / 55% 40% 60% 45%', background: 'radial-gradient(circle at 60% 40%,#FFD9D7 0%,#FFE8E6 50%,rgba(255,240,239,0) 75%)' }} />
          <div className="bz-phones" style={{ position: 'relative' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}><PhoneCobranca /><PhoneRecebido /></div>
            <div className="bz-float" style={{ position: 'absolute', zIndex: 3, right: '-58px', top: '120px', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '16px', background: '#fff', boxShadow: '0 20px 40px -18px rgba(122,16,22,.35)', fontSize: '12px', fontWeight: 700, color: '#141014', lineHeight: 1.3 }}><span style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#D8121F', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>Pagamento<br />realizado!</div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="bz-note" style={{ position: 'absolute', fontFamily: "'Caveat',cursive", fontWeight: 600, lineHeight: 1.05, pointerEvents: 'none', right: 'max(18px,calc(50% - 700px))', top: '58%', color: '#9a8a8e', fontSize: '27px', transform: 'rotate(-10deg)', whiteSpace: 'pre-line' }}>{NG.note[lang]}</div>
    </section>
  );
}

// ═══════════════════ 03 · PARA DEVELOPERS ═══════════════════
const DV = {
  h2a: L('Integre Banzami', 'Integrate Banzami'), h2b: L('no seu produto.', 'into your product.'),
  lead: L('APIs, SDKs e webhooks para testar pagamentos diretamente no seu produto.', 'APIs, SDKs and webhooks to test payments directly in your product.'),
  portal: L('Portal Developers', 'Portal Developers'), docs: L('Documentação', 'Documentation'),
  note: L("// Build with Banzami\nfor what's next.", "// Build with Banzami\nfor what's next."),
  feats: [
    { icon: 'plug' as IconName, t: L('API v1', 'API v1'), d: L('documentada', 'documented') },
    { icon: 'layers' as IconName, t: L('SDK TypeScript', 'SDK TypeScript'), d: L('publicado', 'published') },
    { icon: 'bolt' as IconName, t: L('Webhooks assinados', 'Signed webhooks'), d: L('eventos verificáveis', 'verifiable events') },
  ],
};
const curlCode = (
  <>{'curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \\\n'}{'-H '}{tok.k('"Authorization: Bearer bz_test_sk_XXXX"')}{' \\\n'}{'-H '}{tok.k('"Content-Type: application/json"')}{' \\\n'}{'-d '}{tok.k("'{")}{'\n  '}{tok.p('"purpose"')}{': '}{tok.v('"ORDER"')}{',\n  '}{tok.p('"amount_minor"')}{': '}{tok.v('150000')}{',\n  '}{tok.p('"currency"')}{': '}{tok.v('"AOA"')}{',\n  '}{tok.p('"reference_id"')}{': '}{tok.v('"pedido-123"')}{'\n'}{tok.k("}'")}</>
);
const jsCode = (
  <>{tok.k('import')}{' { Banzami } '}{tok.k('from')}{' '}{tok.v('"@banzami/sdk"')}{';\n\n'}{tok.k('const')}{' bz = '}{tok.k('new')}{' Banzami({ apiKey: process.env.BZ_TEST_KEY });\n\n'}{tok.k('const')}{' session = '}{tok.k('await')}{' bz.paymentSessions.create({\n  '}{tok.p('purpose')}{': '}{tok.v('"ORDER"')}{',\n  '}{tok.p('amountMinor')}{': '}{tok.v('150000')}{',\n  '}{tok.p('currency')}{': '}{tok.v('"AOA"')}{',\n  '}{tok.p('referenceId')}{': '}{tok.v('"pedido-123"')}{',\n});'}</>
);
const pyCode = (
  <>{tok.k('from')}{' banzami '}{tok.k('import')}{' Banzami\n\nbz = Banzami(api_key=os.environ['}{tok.v('"BZ_TEST_KEY"')}{'])\n\nsession = bz.payment_sessions.create(\n    '}{tok.p('purpose')}{'='}{tok.v('"ORDER"')}{',\n    '}{tok.p('amount_minor')}{'='}{tok.v('150000')}{',\n    '}{tok.p('currency')}{'='}{tok.v('"AOA"')}{',\n    '}{tok.p('reference_id')}{'='}{tok.v('"pedido-123"')}{',\n)'}</>
);

export function HomeDevelopers({ lang }: { lang: Lang }) {
  return (
    <section id="developers" style={{ position: 'relative', padding: 'clamp(64px,7vw,104px) 24px clamp(48px,5vw,72px)', overflow: 'hidden' }}>
      <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '.85fr 1.15fr', gap: '52px', alignItems: 'center' }}>
        <div className="bz-first">
          <SectionLabel n="03" label={lang === 'en' ? 'FOR DEVELOPERS' : 'PARA DEVELOPERS'} />
          <h2 style={{ margin: '20px 0 0', fontSize: 'clamp(32px,3.5vw,44px)', lineHeight: 1.06, fontWeight: 900, letterSpacing: '-.03em', color: '#141014' }}>{DV.h2a[lang]}<br /><span style={{ color: '#B5101F' }}>{DV.h2b[lang]}</span></h2>
          <p style={{ margin: '16px 0 0', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '430px', textWrap: 'pretty' }}>{DV.lead[lang]}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px', marginTop: '28px' }}>
            <a href={CONSOLE_URL} className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '13px 24px', borderRadius: '40px', background: 'linear-gradient(160deg,#2a2124,#120e0f)', color: '#fff', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 20px 40px -16px rgba(20,16,20,.6),inset 0 1px 0 rgba(255,255,255,.12)' }}>{DV.portal[lang]}<ArrowIcon color="#fff" size={18} /></a>
            <a href={DOCS_URL} className="bz-btntext" style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', color: '#141014', fontWeight: 800, fontSize: '14.5px', whiteSpace: 'nowrap', textDecoration: 'none' }}>{DV.docs[lang]}<ArrowIcon color="currentColor" size={17} /></a>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '26px' }}>
          <div aria-hidden="true" style={{ position: 'absolute', right: '-10%', top: '-14%', width: '95%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle,#FFDDDB 0%,rgba(255,236,235,0) 70%)' }} />
          <div style={{ position: 'relative', marginRight: '56px' }}>
            <CodeWindow tabs={[{ k: 'curl', label: 'cURL', code: curlCode }, { k: 'js', label: 'JavaScript', code: jsCode }, { k: 'py', label: 'Python', code: pyCode }]} />
          </div>
          <div className="bz-float" style={{ position: 'absolute', right: 0, top: '42%', width: '128px', height: '128px', borderRadius: '26px', background: '#fff', boxShadow: '0 30px 56px -22px rgba(122,16,22,.45),0 0 0 1px rgba(181,16,31,.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', animation: 'floaty 6s ease-in-out infinite' }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#D8121F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /><path d="M14 4l-4 16" /></svg>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', fontWeight: 600, color: '#141014' }}>@banzami/sdk</span>
          </div>
          <Rotator mode="card" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '10px' }}>
            {DV.feats.map((f, i) => (
              <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '18px', border: '1px solid rgba(181,16,31,.06)', background: 'rgba(255,255,255,.45)', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                <span data-ri-ic style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '12px', background: '#FFF1F0', color: '#C8101F', border: '1px solid rgba(181,16,31,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}><Icon name={f.icon} color="currentColor" size={19} /></span>
                <span style={{ fontSize: '12.5px', lineHeight: 1.35, color: '#8a7a7e', fontWeight: 600, minWidth: 0 }}><strong style={{ display: 'block', color: '#141014', fontWeight: 900, fontSize: '14px', lineHeight: 1.25, textWrap: 'balance' }}>{f.t[lang]}</strong>{f.d[lang]}</span>
                <span data-ri-bar style={{ position: 'absolute', left: '14px', right: '14px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', transition: 'opacity .6s' }}><span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} /></span>
              </div>
            ))}
          </Rotator>
        </div>
      </div>
      <div aria-hidden="true" className="bz-note" style={{ position: 'absolute', right: 'max(18px,calc(50% - 700px))', top: '64px', fontFamily: "'Caveat',cursive", fontSize: '24px', lineHeight: 1.1, color: '#9a8a8e', transform: 'rotate(-8deg)', textAlign: 'right', whiteSpace: 'pre-line' }}>{DV.note[lang]}</div>
    </section>
  );
}
