import { Reveal } from '@/components/Reveal';
import { SectionPill, CtaArrow, StatusBar, HomeIndicator, Phone } from './home-sections-parts';

const SECTION: React.CSSProperties = {
  position: 'relative',
  padding: 'clamp(56px,7vw,96px) 24px',
  overflow: 'hidden',
  // A warm off-white band sets this section apart from the white sections
  // above and below — a modern separation without a hairline rule.
  background: '#FCF3F2',
};

/**
 * 02 · Para negócios — "Receba com Banzami." with two phones (Nova cobrança
 * com QR → Pagamento recebido) and a floating "Pagamento realizado!" badge.
 */
export function ForBusiness() {
  return (
    <section id="negocios" className="bzhs-root" style={SECTION}>
      <Reveal>
      <div
        className="bzhs-split"
        style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '.95fr 1.05fr', gap: '48px', alignItems: 'center' }}
      >
        {/* ── left column ── */}
        <div>
          <SectionPill num="02" label="PARA NEGÓCIOS" />
          <h2 style={{ margin: '26px 0 0', fontSize: 'clamp(38px, 3.4vw + 1vh, 62px)', lineHeight: 1.02, fontWeight: 900, letterSpacing: '-0.03em', color: '#141014' }}>
            Receba com<br /><span style={{ color: '#B5101F' }}>Banzami Business.</span>
          </h2>
          <p style={{ margin: '24px 0 0', fontSize: 'clamp(17px,1.6vw,21px)', lineHeight: 1.5, fontWeight: 600, color: '#6a5a5e', maxWidth: '430px', textWrap: 'pretty' }}>
            QR, links e ferramentas de cobrança para receber pagamentos na Sandbox.
          </p>
          <div style={{ display: 'flex', marginTop: '34px' }}>
            <a
              href="/comerciantes"
              className="bzhs-cta"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '14px 28px', borderRadius: '40px', whiteSpace: 'nowrap', background: '#C8101F', color: '#fff', fontWeight: 800, fontSize: '15px', textDecoration: 'none', boxShadow: '0 16px 32px -16px rgba(181,16,31,.55)' }}
            >
              Explorar para negócios
              <CtaArrow size={18} />
            </a>
          </div>
        </div>

        {/* ── right column: two phones + floating badge ── */}
        <div style={{ position: 'relative', minHeight: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            aria-hidden="true"
            style={{ position: 'absolute', right: '-6%', top: 0, width: '88%', height: '100%', borderRadius: '46% 54% 40% 60% / 55% 40% 60% 45%', background: 'radial-gradient(circle at 60% 40%,#FFD9D7 0%,#FFE8E6 50%,rgba(255,240,239,0) 75%)' }}
          />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
            {/* Phone 1 — Nova cobrança (QR) */}
            <Phone
              style={{ height: '468px', transform: 'rotate(-4deg) translate(30px,18px)', zIndex: 1 }}
              screenStyle={{ background: '#fff' }}
            >
              <StatusBar fg="#141014" dim="#b3aeaf" nub="#8a8586" />
              <div style={{ padding: '12px 8px 0' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1d1a1b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
                <div style={{ marginTop: '8px', fontSize: '18px', fontWeight: 800, letterSpacing: '-.02em', color: '#1d1a1b' }}>Nova cobrança</div>
              </div>
              <div style={{ marginTop: '22px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: '8.5px', fontWeight: 600, color: '#9a8487' }}>Sandbox · Cantina do Alex</div>
                <div style={{ marginTop: '2px', fontSize: '26px', fontWeight: 900, letterSpacing: '-.03em', color: '#B5101F', lineHeight: 1.1 }}>1 500 Kz</div>
                <div style={{ marginTop: '2px', fontSize: '10px', color: '#9a8487' }}>Saldo de dados</div>
                <div style={{ position: 'relative', marginTop: '14px', padding: '10px', background: '#fff', borderRadius: '16px', boxShadow: '0 6px 22px -8px rgba(122,16,22,.18)', display: 'flex' }}>
                  <svg viewBox="0 0 25 25" width="118" height="118" shapeRendering="crispEdges">
                    <path d="M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2zM18 0h7v7h-7zM19 1v5h5V1zM20 2h3v3h-3zM0 18h7v7H0zM1 19v5h5v-5zM2 20h3v3H2z" fill="#B5101F" fillRule="evenodd" />
                    <path d="M8 0h1v2H8zM10 1h2v1h-2zM13 0h1v3h-1zM15 1h2v2h-2zM9 3h2v1H9zM8 5h1v2H8zM11 5h3v1h-3zM15 4h1v3h-1zM0 8h2v1H0zM3 8h1v2H3zM5 9h2v1H5zM1 11h2v1H1zM0 13h1v2H0zM4 12h2v2H4zM2 15h3v1H2zM6 16h1v1H6zM18 8h2v1h-2zM22 8h3v1h-3zM19 10h1v2h-1zM21 11h2v1h-2zM24 10h1v3h-1zM18 13h2v1h-2zM22 14h2v2h-2zM19 16h1v1h-1zM24 17h1v2h-1zM8 18h2v1H8zM11 19h1v2h-1zM8 21h2v2H8zM13 18h3v1h-3zM14 20h1v3h-1zM16 22h2v1h-2zM19 19h2v1h-2zM22 20h1v2h-1zM18 22h1v3h-1zM20 23h3v1h-3zM11 23h2v2h-2zM9 24h1v1H9zM24 24h1v1h-1zM9 8h2v1H9zM12 9h1v2h-1zM7 10h1v1H7zM14 8h1v1h-1zM16 9h1v2h-1zM8 13h1v1H8zM16 14h1v2h-1zM13 16h2v1h-2zM9 16h1v1H9zM20 18h1v1h-1zM23 22h1v1h-1z" fill="#1d1a1b" />
                    <rect x="9.5" y="9.5" width="6" height="6" rx="1.4" fill="#fff" />
                  </svg>
                  <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(150deg,#E0202E,#9A1B22)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', padding: '6px' }}>
                    <span style={{ background: '#fff', borderRadius: '2px' }} />
                    <span style={{ background: '#FFC9C6', borderRadius: '2px' }} />
                    <span style={{ background: '#FFC9C6', borderRadius: '2px' }} />
                    <span style={{ background: '#2a1a1c', borderRadius: '2px', transform: 'scale(.6)' }} />
                  </span>
                </div>
              </div>
              <div style={{ margin: '14px 10px 0', padding: '10px', borderRadius: '12px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '10.5px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>Partilhar link</div>
              <div style={{ margin: '8px 8px 0', padding: '9px', borderRadius: '12px', border: '1.2px solid #B5101F', color: '#B5101F', fontSize: '10.5px', fontWeight: 800, textAlign: 'center' }}>Nova cobrança</div>
              <HomeIndicator color="#bdb5b6" />
            </Phone>

            {/* Phone 2 — Pagamento recebido */}
            <Phone style={{ height: '468px', zIndex: 2 }} screenStyle={{ background: '#fff' }}>
              <StatusBar fg="#141014" dim="#b3aeaf" nub="#8a8586" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: '40px', background: 'radial-gradient(circle at 50% 38%,rgba(255,220,220,.55) 0%,rgba(255,255,255,0) 45%)' }}>
                <div style={{ fontSize: '7.5px', fontWeight: 800, letterSpacing: '.3em', color: '#9A1B22' }}>BANZAMI</div>
                <div style={{ marginTop: '8px', width: '74px', height: '74px', borderRadius: '50%', background: 'rgba(229,52,62,.85)', boxShadow: '0 0 26px 6px rgba(229,52,62,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '62px', height: '62px', borderRadius: '50%', border: '1.5px dashed rgba(255,255,255,.85)', animation: 'bzspinccw 9s linear infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', animation: 'bzspin 9s linear infinite', background: 'radial-gradient(circle at 40% 35%,#E0303A,#9A1B22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '14px', fontSize: '13px', fontWeight: 700, color: '#1d1a1b' }}>Pagamento recebido</div>
                <div style={{ marginTop: '4px', fontSize: '30px', fontWeight: 900, letterSpacing: '-.03em', color: '#B5101F' }}>1 500 Kz</div>
                <div style={{ marginTop: '2px', fontSize: '11px', color: '#5a4a4e' }}>de @maria</div>
                <div style={{ marginTop: '4px', fontSize: '10px', fontStyle: 'italic', color: '#9a8487' }}>&quot;Saldo de dados&quot;</div>
                <div style={{ marginTop: '6px', fontSize: '9.5px', color: '#9a8487' }}>O valor já entrou na sua carteira.</div>
              </div>
              <div style={{ margin: '0 14px 22px', padding: '11px', borderRadius: '14px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '11px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>Concluir</div>
              <HomeIndicator color="#bdb5b6" />
            </Phone>

            {/* Floating badge */}
            <div
              aria-hidden="true"
              className="bzhs-float"
              style={{ position: 'absolute', zIndex: 3, right: '-86px', top: '150px', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '16px', background: '#fff', boxShadow: '0 20px 40px -18px rgba(122,16,22,.35)', fontSize: '12px', fontWeight: 700, color: '#141014', lineHeight: 1.3 }}
            >
              <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#D8121F', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              Pagamento<br />realizado!
            </div>
          </div>
        </div>
      </div>
      </Reveal>
    </section>
  );
}
