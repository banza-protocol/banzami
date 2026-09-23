import { Badge } from './kit';
import { HeroAppPhone } from './HeroAppPhone';
import { HeroPlatforms } from './HeroPlatforms';
import { route, type Lang, type Loc } from '@/lib/marketing/nav';

const APP_URL = 'https://app.banzami.com/';
const CONSOLE_URL = '/developers/login';
const L = (pt: string, en: string): Loc => ({ pt, en });

const T = {
  badge: L('Versão Beta · Sandbox', 'Beta version · Sandbox'),
  h1a: L('O novo caminho do', 'The new way for the'),
  h1b: L('Kwanza.', 'Kwanza.'),
  lead: L(
    'Envie, receba e aceite pagamentos em Kz entre pessoas, negócios e aplicações — na app Banzami ou integrado no seu produto.',
    'Send, receive and accept payments in Kz between people, businesses and apps — in the Banzami app or built into your product.',
  ),
  small: L(
    'Sandbox pública disponível com dinheiro fictício. O Financial Live permanece indisponível, sujeito às aprovações aplicáveis.',
    'Public Sandbox available with test money. Financial Live remains unavailable, subject to the applicable approvals.',
  ),
  openBeta: L('Abrir Beta Web', 'Open Beta Web'),
  howWorks: L('Ver como funciona', 'See how it works'),
  cardPeople: L('Para pessoas e negócios', 'For people and businesses'),
  cardPeopleDesc: L('Pagamentos simples, rápidos e com comprovativo.', 'Simple, fast payments with a receipt.'),
  cardPeopleCta: L('Conhecer o produto', 'Get to know the product'),
  cardDev: L('Para developers', 'For developers'),
  cardDevDesc: L('Integre o Banzami no seu produto e comece a testar hoje.', 'Integrate Banzami into your product and start testing today.'),
  portal: L('Portal Developers', 'Portal Developers'),
  betaWeb: L('Beta Web', 'Beta Web'),
  inBrowser: L('No browser', 'In the browser'),
  building: L('Construindo o ecossistema de pagamentos de Angola.', "Building Angola's payment ecosystem."),
  tagsPeople: [L('QR', 'QR'), L('Pagamentos', 'Payments'), L('Comprovativos', 'Receipts')],
  tagsDev: [L('API', 'API'), L('SDK', 'SDK'), L('Webhooks', 'Webhooks')],
  note: L('Mais\nAngola\nem movimento.', 'More\nAngola\non the move.'),
};

function Arrow({ c = '#fff', s = 17 }: { c?: string; s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

export function HomeHero({ lang }: { lang: Lang }) {
  return (
    <section id="inicio" style={{ position: 'relative', padding: 'clamp(88px,11vh,104px) 24px clamp(32px,4vh,52px)', overflow: 'hidden', background: '#fff', borderRadius: '0 0 48px 48px', boxShadow: '0 40px 80px -60px rgba(122,16,22,.45)' }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/hero-bg-red.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
      </div>

      <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '48px', alignItems: 'center' }}>
        <div>
          <Badge>{T.badge[lang]}</Badge>
          <h1 style={{ margin: '16px 0 0', fontSize: 'clamp(32px,3.3vw,52px)', fontWeight: 900, lineHeight: 1.02, letterSpacing: '-.035em', color: '#141014', textWrap: 'balance' }}><span style={{ whiteSpace: 'nowrap' }}>{T.h1a[lang]}</span><br /><span style={{ color: '#B5101F' }}>{T.h1b[lang]}</span></h1>
          <p style={{ margin: '14px 0 0', fontSize: 'clamp(15px,1.2vw,17px)', lineHeight: 1.5, color: '#4a3a3e', fontWeight: 600, maxWidth: '520px', textWrap: 'pretty' }}>{T.lead[lang]}</p>
          <p style={{ margin: '10px 0 0', fontSize: '13px', lineHeight: 1.5, color: '#8a7a7e', fontWeight: 600, maxWidth: '520px', textWrap: 'pretty' }}>{T.small[lang]}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '20px' }}>
            <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '16px 26px', borderRadius: '16px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '15.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 18px 34px -14px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)' }}>{T.openBeta[lang]}<Arrow /></a>
            <a href="#como-funciona" className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '10px 24px 10px 12px', borderRadius: '16px', background: '#fff', border: '1px solid #F3E3E1', color: '#141014', fontWeight: 800, fontSize: '15.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 14px 30px -20px rgba(122,16,22,.4)' }}>
              <span style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#FFF1F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D8121F' }}><svg width="18" height="18" viewBox="0 0 24 24"><path d="M9 7.5v9l7.5-4.5z" fill="currentColor" /></svg></span>{T.howWorks[lang]}
            </a>
          </div>

          {/* Audience cards */}
          <div className="bz-herocards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '18px', maxWidth: '590px' }}>
            <a href={route('produto', lang)} className="bz-herocard" style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '18px 18px 16px', borderRadius: '22px', textDecoration: 'none', background: 'linear-gradient(180deg,#fff 0%,#FFF9F8 100%)', border: '1px solid #F3E3E1', boxShadow: '0 26px 50px -34px rgba(122,16,22,.5),inset 0 1px 0 #fff' }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: '-60px', right: '-60px', width: '170px', height: '170px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,210,208,.7),rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ width: '42px', height: '42px', borderRadius: '13px', background: 'linear-gradient(150deg,#D8121F,#8E1620)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px -8px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.25)' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6a3 3 0 0 1 0 5.6M16.5 13.5a5.5 5.5 0 0 1 4 5.3" /></svg></span>
                <span style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #F3E3E1' }}><Arrow c="#B5101F" s={14} /></span>
              </div>
              <p style={{ position: 'relative', margin: '14px 0 0', fontSize: '15.5px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{T.cardPeople[lang]}</p>
              <p style={{ position: 'relative', margin: '4px 0 0', fontSize: '12.5px', lineHeight: 1.5, fontWeight: 600, color: '#7a6a6e', textWrap: 'pretty' }}>{T.cardPeopleDesc[lang]}</p>
              <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                {T.tagsPeople.map((tg, i) => <span key={i} style={{ padding: '4px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 800, background: '#FFF1F0', border: '1px solid rgba(181,16,31,.1)', color: '#B5101F' }}>{tg[lang]}</span>)}
              </div>
              <span style={{ position: 'relative', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #F5E8E6', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800, color: '#B5101F' }}>{T.cardPeopleCta[lang]}<Arrow c="#B5101F" s={13} /></span>
            </a>
            <a href={CONSOLE_URL} className="bz-herocard" style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '18px 18px 16px', borderRadius: '22px', textDecoration: 'none', background: 'linear-gradient(160deg,#2a2023 0%,#140f10 100%)', border: '1px solid rgba(255,255,255,.06)', boxShadow: '0 26px 50px -30px rgba(20,10,12,.8),inset 0 1px 0 rgba(255,255,255,.06)' }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: '-60px', right: '-60px', width: '170px', height: '170px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(216,18,31,.35),rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ width: '42px', height: '42px', borderRadius: '13px', background: 'linear-gradient(150deg,#D8121F,#8E1620)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px -8px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.25)' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></svg></span>
                <span style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)' }}><Arrow c="#fff" s={14} /></span>
              </div>
              <p style={{ position: 'relative', margin: '14px 0 0', fontSize: '15.5px', fontWeight: 900, letterSpacing: '-.01em', color: '#fff' }}>{T.cardDev[lang]}</p>
              <p style={{ position: 'relative', margin: '4px 0 0', fontSize: '12.5px', lineHeight: 1.5, fontWeight: 600, color: 'rgba(255,255,255,.62)', textWrap: 'pretty' }}>{T.cardDevDesc[lang]}</p>
              <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                {T.tagsDev.map((tg, i) => <span key={i} style={{ padding: '4px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 800, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', color: '#FFB3B0' }}>{tg[lang]}</span>)}
              </div>
              <span style={{ position: 'relative', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800, color: '#fff' }}>{T.portal[lang]}<Arrow c="#fff" s={13} /></span>
            </a>
          </div>

          {/* Platforms — Beta Web opens the app; iPhone/Android open the tester sign-up modal */}
          <HeroPlatforms lang={lang} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px' }}><span style={{ width: '28px', height: '2px', borderRadius: '2px', background: '#D8121F' }} /><span style={{ fontSize: '13px', fontWeight: 700, color: '#8a7a7e' }}>{T.building[lang]}</span></div>
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '560px' }}>
          <div aria-hidden="true" style={{ position: 'absolute', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,255,255,.18),rgba(255,255,255,0) 70%)' }} />
          <HeroAppPhone lang={lang} />
        </div>
      </div>
    </section>
  );
}
