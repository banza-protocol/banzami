import { Badge } from './kit';
import { HeroAppPhone } from './HeroAppPhone';
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
    <section id="inicio" style={{ position: 'relative', padding: '112px 24px 64px', overflow: 'hidden', background: '#fff', borderRadius: '0 0 48px 48px', boxShadow: '0 40px 80px -60px rgba(122,16,22,.45)' }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/hero-bg-red.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
      </div>

      <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '48px', alignItems: 'center' }}>
        <div>
          <Badge>{T.badge[lang]}</Badge>
          <h1 style={{ margin: '22px 0 0', fontSize: 'clamp(40px,4.9vw,68px)', fontWeight: 900, lineHeight: 1.02, letterSpacing: '-.035em', color: '#141014', textWrap: 'balance' }}><span style={{ whiteSpace: 'nowrap' }}>{T.h1a[lang]}</span><br /><span style={{ color: '#B5101F' }}>{T.h1b[lang]}</span></h1>
          <p style={{ margin: '20px 0 0', fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.55, color: '#4a3a3e', fontWeight: 600, maxWidth: '540px', textWrap: 'pretty' }}>{T.lead[lang]}</p>
          <p style={{ margin: '12px 0 0', fontSize: '13.5px', lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600, maxWidth: '540px', textWrap: 'pretty' }}>{T.small[lang]}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '26px' }}>
            <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '16px 26px', borderRadius: '16px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '15.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 18px 34px -14px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)' }}>{T.openBeta[lang]}<Arrow /></a>
            <a href="#como-funciona" className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '10px 24px 10px 12px', borderRadius: '16px', background: '#fff', border: '1px solid #F3E3E1', color: '#141014', fontWeight: 800, fontSize: '15.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 14px 30px -20px rgba(122,16,22,.4)' }}>
              <span style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#FFF1F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D8121F' }}><svg width="18" height="18" viewBox="0 0 24 24"><path d="M9 7.5v9l7.5-4.5z" fill="currentColor" /></svg></span>{T.howWorks[lang]}
            </a>
          </div>

          {/* Audience cards */}
          <div className="bz-herocards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '30px', maxWidth: '590px' }}>
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

          {/* Platforms */}
          <div className="bz-plat" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginTop: '14px', maxWidth: '590px' }}>
            {[
              { href: APP_URL, ext: true, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 3.8 5.8 3.8 9s-1.2 6.2-3.8 9c-2.6-2.8-3.8-5.8-3.8-9S9.4 5.8 12 3z" /></svg>, t: T.betaWeb[lang], s: T.inBrowser[lang] },
              { href: route('testes', lang), ext: false, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.88 2.65 3.22 2.6 1.29-.05 1.78-.83 3.34-.83 1.55 0 2 .83 3.37.81 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.39-2.85 1.41-2.92-.03-.01-2.7-1.04-2.73-4.11z" /><path d="M14.69 4.86c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z" /></svg>, t: 'iPhone', s: 'TestFlight' },
              { href: route('testes', lang), ext: false, icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M6 9.5h12v7.5a1.5 1.5 0 0 1-1.5 1.5H15v2.5a1.25 1.25 0 0 1-2.5 0V18.5h-1v2.5a1.25 1.25 0 0 1-2.5 0V18.5H7.5A1.5 1.5 0 0 1 6 17zM3.5 10a1.25 1.25 0 0 1 2.5 0v5a1.25 1.25 0 0 1-2.5 0zM18 10a1.25 1.25 0 0 1 2.5 0v5a1.25 1.25 0 0 1-2.5 0zM6 8.6a6 6 0 0 1 12 0z" /></svg>, t: 'Android', s: 'Google Play' },
            ].map((p, i) => (
              <a key={i} href={p.href} {...(p.ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="bz-btnlift" style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '12px 16px', borderRadius: '14px', background: 'linear-gradient(160deg,#241c1e,#120e0f)', border: '1px solid rgba(255,255,255,.06)', textDecoration: 'none', boxShadow: '0 16px 30px -18px rgba(20,16,20,.7)' }}>
                <span style={{ display: 'flex' }}>{p.icon}</span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}><span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>{p.t}</span><span style={{ fontSize: '11.5px', fontWeight: 600, color: 'rgba(255,255,255,.55)' }}>{p.s}</span></span>
              </a>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '26px' }}><span style={{ width: '28px', height: '2px', borderRadius: '2px', background: '#D8121F' }} /><span style={{ fontSize: '13px', fontWeight: 700, color: '#8a7a7e' }}>{T.building[lang]}</span></div>
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '700px' }}>
          <div aria-hidden="true" style={{ position: 'absolute', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,255,255,.18),rgba(255,255,255,0) 70%)' }} />
          <HeroAppPhone lang={lang} />
        </div>
      </div>
    </section>
  );
}
