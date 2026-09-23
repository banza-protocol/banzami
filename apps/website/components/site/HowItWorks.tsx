import { LiveClock } from './LiveClock';
import { SectionPill, CtaArrow, StatusBar, HomeIndicator, Connector, Phone } from './home-sections-parts';

const SECTION: React.CSSProperties = {
  position: 'relative',
  padding: 'clamp(56px,7vw,96px) 24px',
  overflow: 'hidden',
  background: '#fff',
};

/**
 * 01 · Como funciona — "Ler. Confirmar. Pagar." with three connected phones
 * (Scan → Confirmar pagamento → Comprovativo). Ported from the design handoff.
 */
export function HowItWorks() {
  return (
    <section id="como-funciona" className="bzhs-root" style={SECTION}>
      <div
        className="bzhs-split bzhs-split-dev"
        style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '.8fr 1.2fr', gap: '40px', alignItems: 'center' }}
      >
        {/* ── left column ── */}
        <div>
          <SectionPill num="01" label="COMO FUNCIONA" />
          <h2 style={{ margin: '26px 0 0', fontSize: 'clamp(40px,5.4vw,66px)', lineHeight: 1, fontWeight: 900, letterSpacing: '-.035em', color: '#141014' }}>
            Ler.<br />Confirmar.<br /><span style={{ color: '#B5101F' }}>Pagar.</span>
          </h2>
          <p style={{ margin: '24px 0 0', fontSize: 'clamp(17px,1.6vw,21px)', lineHeight: 1.5, fontWeight: 600, color: '#6a5a5e', maxWidth: '400px', textWrap: 'pretty' }}>
            Do QR ou de um @banza ao comprovativo, em três passos.
          </p>
          <p style={{ margin: '18px 0 0', fontSize: '16px', lineHeight: 1.55, fontWeight: 600, color: '#7a6a6e', maxWidth: '380px', textWrap: 'pretty' }}>
            Veja o valor, confirme o destinatário e receba o comprovativo imediatamente.
          </p>
          <div style={{ display: 'flex', marginTop: '34px' }}>
            <a
              href="https://app.banzami.com"
              target="_blank"
              rel="noopener noreferrer"
              className="bzhs-cta"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', padding: '20px 40px', borderRadius: '40px', background: '#C8101F', color: '#fff', fontWeight: 800, fontSize: '19px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 20px 40px -14px rgba(181,16,31,.55)' }}
            >
              Experimentar a app web
              <CtaArrow />
            </a>
          </div>
        </div>

        {/* ── right column: three phones ── */}
        <div style={{ position: 'relative', minHeight: '540px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            aria-hidden="true"
            style={{ position: 'absolute', left: '4%', right: '-6%', top: '4%', bottom: '4%', borderRadius: '46% 54% 40% 60% / 55% 40% 60% 45%', background: 'radial-gradient(circle at 55% 45%,#FFD9D7 0%,#FFE8E6 50%,rgba(255,240,239,0) 75%)' }}
          />
          <div className="bzhs-howphones" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            {/* Phone 1 — Scan */}
            <Phone
              style={{ height: '512px', transform: 'rotate(-5deg) translateY(22px)', zIndex: 1 }}
              screenStyle={{ background: '#0b0b0d' }}
            >
              <StatusBar fg="#fff" dim="rgba(255,255,255,.45)" nub="rgba(255,255,255,.45)" />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 6px 0' }}>
                <span style={{ width: '26px', height: '26px', borderRadius: '9px', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </span>
                <span style={{ width: '26px', height: '26px', borderRadius: '9px', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
                </span>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'relative', width: '148px', height: '148px', borderRadius: '20px', border: '2px solid #E0303A', boxShadow: '0 0 30px -4px rgba(224,48,58,.65),inset 0 0 20px -6px rgba(224,48,58,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/assets/qr-banzami.png" alt="" style={{ width: '118px', height: 'auto', display: 'block', borderRadius: '12px' }} />
                  <span style={{ position: 'absolute', left: '10px', right: '10px', height: '2px', borderRadius: '2px', background: '#FF3B45', boxShadow: '0 0 12px 2px rgba(255,59,69,.7)', animation: 'bzScanline 2.2s ease-in-out infinite alternate' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '22px' }}>
                <span style={{ padding: '9px 16px', borderRadius: '20px', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: '10px', fontWeight: 700 }}>Aponte para o código QR</span>
              </div>
              <HomeIndicator color="rgba(255,255,255,.4)" />
            </Phone>

            <Connector delay="0s" />

            {/* Phone 2 — Confirmar pagamento */}
            <Phone style={{ height: '512px', zIndex: 2 }} screenStyle={{ background: '#FBF6F5' }}>
              <StatusBar fg="#141014" dim="#b3aeaf" nub="#b3aeaf" />
              <div style={{ padding: '12px 8px 0' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1d1a1b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
                <div style={{ marginTop: '8px', fontSize: '17px', fontWeight: 800, letterSpacing: '-.02em', color: '#1d1a1b' }}>Confirmar pagamento</div>
              </div>
              <div style={{ marginTop: '22px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'linear-gradient(135deg,#C8101F 0%,#E0303A 45%,#8E1620 100%)', color: '#fff', fontSize: '24px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>M</div>
                <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 700, color: '#1d1a1b' }}>@maria</div>
                <div style={{ marginTop: '4px', fontSize: '8.5px', color: '#9a8487' }}>Solicitou um pagamento</div>
                <div style={{ marginTop: '12px', padding: '9px 20px', borderRadius: '24px', background: '#B5101F', color: '#fff', fontSize: '20px', fontWeight: 800, letterSpacing: '-.02em' }}>1 500 Kz</div>
                <div style={{ marginTop: '10px', fontSize: '10px', fontStyle: 'italic', color: '#5a4a4e' }}>vaquinha</div>
              </div>
              <div style={{ margin: '16px 8px 0', padding: '10px 12px', borderTop: '1px solid #F1E6E4', borderBottom: '1px solid #F1E6E4', display: 'flex', alignItems: 'center', gap: '9px' }}>
                <span style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#F4ECEB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24"><rect x="3" y="5" width="16" height="15" rx="3" fill="#C8101F" /><rect x="12" y="10" width="10" height="6" rx="2" fill="#F4ECEB" /><circle cx="15" cy="13" r="1.3" fill="#C8101F" /></svg>
                </span>
                <div>
                  <div style={{ fontSize: '8px', color: '#9a8487' }}>Método de pagamento</div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#1d1a1b' }}>Saldo Banzami</div>
                </div>
              </div>
              <div style={{ margin: 'auto 8px 0', padding: '10px', borderRadius: '14px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '11px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>Pagar 1 500 Kz</div>
              <div style={{ margin: '6px 0 16px', textAlign: 'center', fontSize: '8.5px', color: '#9a8487' }}>Pagamento irreversível</div>
              <HomeIndicator color="#bdb5b6" />
            </Phone>

            <Connector delay="1.8s" />

            {/* Phone 3 — Comprovativo */}
            <Phone
              style={{ height: '512px', transform: 'rotate(4deg) translateY(18px)', zIndex: 1 }}
              screenStyle={{ background: 'linear-gradient(180deg,#C51A2A 0%,#9A0A18 45%,#65050E 100%)' }}
            >
              <StatusBar fg="#fff" dim="rgba(255,255,255,.45)" nub="rgba(255,255,255,.45)" />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 6px 0' }}>
                <svg style={{ position: 'absolute', left: '8px' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,.9)' }}>Comprovativo</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ marginTop: '4px', fontSize: '6.5px', fontWeight: 800, letterSpacing: '.3em', color: '#fff' }}>BANZAMI</div>
                <div style={{ position: 'relative', marginTop: '3px', width: '46px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.3px dashed rgba(255,255,255,.7)', animation: 'bzspin 9s linear infinite' }} />
                  <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#C0202C,#6E0610)', boxShadow: '0 0 0 4px rgba(255,255,255,.08),0 6px 14px -4px rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </div>
                </div>
                <div style={{ marginTop: '6px', fontSize: '10.5px', fontWeight: 700, color: 'rgba(255,255,255,.9)' }}>Enviado com sucesso</div>
                <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-.02em', color: '#fff', lineHeight: 1.2 }}>1 500 Kz</div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,.7)' }}>para @maria</div>
                <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '10px', background: '#FCEFC4', border: '1px solid #E9C66A', fontSize: '7.5px', fontWeight: 800, color: '#7A4A06' }}>SANDBOX • Dinheiro de teste</div>
              </div>
              <div style={{ margin: '7px 4px 0', padding: '2px 9px', borderRadius: '12px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', fontSize: '8px' }}>
                <DetailRow label="De" value="@ana" />
                <DetailRow label="Para" value="@maria" />
                <DetailRow label="Descrição" value="vaquinha" />
                <DetailRow label="Data" value={<LiveClock kind="date" />} />
                <DetailRow label="Operação" value="@banza" />
                <DetailRow label="Fonte" value="Saldo Banzami" />
                <DetailRow label="Referência" value="BZM-3HNA-GZST-…" last />
              </div>
              <div style={{ margin: '6px 4px 0', padding: '7px', borderRadius: '12px', background: '#fff', color: '#B5101F', fontSize: '10.5px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.8" /></svg>
                Concluído
              </div>
              <div style={{ margin: '5px 4px 0', padding: '7px', borderRadius: '12px', background: 'rgba(0,0,0,.14)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontSize: '9.5px', fontWeight: 700, textAlign: 'center' }}>Partilhar comprovativo</div>
              <div style={{ marginTop: '6px', textAlign: 'center', fontSize: '8.5px', fontWeight: 700, color: 'rgba(255,255,255,.8)' }}>Copiar detalhes</div>
              <div style={{ marginTop: '5px', textAlign: 'center', fontSize: '7px', color: 'rgba(255,255,255,.6)' }}>Ecrã em direto • <LiveClock kind="hms" /></div>
              <div style={{ margin: '2px 0 12px', textAlign: 'center', fontSize: '6.5px', color: '#E0A04A' }}>Comprovativo sandbox • sem valor financeiro real</div>
              <HomeIndicator color="rgba(0,0,0,.35)" />
            </Phone>
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailRow({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '3.5px 0', borderBottom: last ? undefined : '1px solid rgba(255,255,255,.12)' }}>
      <span style={{ color: 'rgba(255,255,255,.7)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  );
}
