import { SectionPill, CtaArrow } from './home-sections-parts';

const SECTION: React.CSSProperties = {
  position: 'relative',
  padding: 'clamp(56px,7vw,96px) 24px',
  overflow: 'hidden',
  background: '#fff',
};

// Syntax-highlight palette from the design handoff.
const HEADER = { color: '#FF6B6B' };
const KEY = { color: '#FF8A7A' };
const VAL = { color: '#FFD58A' };

/**
 * 03 · Para developers — "Integre Banzami no seu produto." with a cURL code
 * window (wired to the real Sandbox endpoint), a "@banzami/sdk" float card and
 * three highlights (APIs · SDKs · Webhooks).
 */
export function ForDevelopers() {
  return (
    <section id="developers" className="bzhs-root" style={SECTION}>
      <div
        className="bzhs-split bzhs-split-dev"
        style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: '48px', alignItems: 'center' }}
      >
        {/* ── left column ── */}
        <div>
          <SectionPill num="03" label="PARA DEVELOPERS" />
          <h2 style={{ margin: '26px 0 0', fontSize: 'clamp(38px,4.8vw,60px)', lineHeight: 1.03, fontWeight: 900, letterSpacing: '-.035em', color: '#141014' }}>
            Integre Banzami<br /><span style={{ color: '#B5101F' }}>no seu produto.</span>
          </h2>
          <p style={{ margin: '24px 0 0', fontSize: 'clamp(17px,1.6vw,21px)', lineHeight: 1.5, fontWeight: 600, color: '#6a5a5e', maxWidth: '450px', textWrap: 'pretty' }}>
            APIs, SDKs e webhooks para testar pagamentos diretamente no seu produto.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '32px', marginTop: '34px' }}>
            <a
              href="/developers"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', padding: '20px 38px', borderRadius: '40px', whiteSpace: 'nowrap', background: '#1a1416', color: '#fff', fontWeight: 800, fontSize: '19px', textDecoration: 'none', boxShadow: '0 20px 40px -16px rgba(20,16,20,.55)' }}
            >
              Portal Developers
              <CtaArrow />
            </a>
            <a
              href="/developers/docs"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: '#141014', fontWeight: 700, fontSize: '18px', whiteSpace: 'nowrap', textDecoration: 'none' }}
            >
              Documentação
              <CtaArrow size={18} />
            </a>
          </div>
        </div>

        {/* ── right column: code window + sdk card + highlights ── */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '30px' }}>
          <div
            aria-hidden="true"
            style={{ position: 'absolute', right: '-8%', top: '-12%', width: '95%', height: '95%', borderRadius: '50%', background: 'radial-gradient(circle,#FFDDDB 0%,rgba(255,236,235,0) 70%)' }}
          />
          <div style={{ position: 'relative', alignSelf: 'flex-end', fontFamily: "'JetBrains Mono',monospace", fontStyle: 'italic', fontSize: '13px', color: '#9a8a8e', transform: 'rotate(-4deg)' }}>
            // Build with Banzami
          </div>

          <div style={{ position: 'relative', marginRight: '40px', background: '#1a1416', borderRadius: '22px', padding: '6px 6px 8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '36px', padding: '16px 26px 0', fontSize: '16px', fontWeight: 700, color: 'rgba(255,255,255,.6)' }}>
              <span style={{ color: '#fff', paddingBottom: '12px', borderBottom: '3px solid #D8121F' }}>cURL</span>
              <span style={{ paddingBottom: '12px' }}>JavaScript</span>
              <span style={{ paddingBottom: '12px' }}>Python</span>
              <span style={{ marginLeft: 'auto', paddingBottom: '12px', letterSpacing: '.2em' }}>•••</span>
            </div>
            <pre style={{ margin: 0, background: '#0f0b0c', borderRadius: '16px', padding: '22px 24px 26px', fontFamily: "'JetBrains Mono',monospace", fontSize: '13px', lineHeight: 1.75, color: '#f3eeee', overflowX: 'auto', whiteSpace: 'pre' }}>
{'curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \\\n'}
{'-H '}<span style={HEADER}>&quot;Authorization: Bearer bz_test_sk_XXXX&quot;</span>{' \\\n'}
{'-H '}<span style={HEADER}>&quot;Content-Type: application/json&quot;</span>{' \\\n'}
{'-d '}<span style={HEADER}>&#39;&#123;</span>{'\n'}
{'  '}<span style={KEY}>&quot;purpose&quot;</span>{': '}<span style={VAL}>&quot;ORDER&quot;</span>{',\n'}
{'  '}<span style={KEY}>&quot;amount_minor&quot;</span>{': '}<span style={VAL}>150000</span>{',\n'}
{'  '}<span style={KEY}>&quot;currency&quot;</span>{': '}<span style={VAL}>&quot;AOA&quot;</span>{',\n'}
{'  '}<span style={KEY}>&quot;reference_id&quot;</span>{': '}<span style={VAL}>&quot;pedido-123&quot;</span>{'\n'}
<span style={HEADER}>&#125;&#39;</span>
            </pre>
          </div>

          <div
            aria-hidden="true"
            className="bzhs-float"
            style={{ position: 'absolute', right: 0, top: '52%', width: '132px', height: '132px', borderRadius: '26px', background: '#fff', boxShadow: '0 26px 50px -20px rgba(122,16,22,.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}
          >
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#D8121F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></svg>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#141014' }}>@banzami/sdk</span>
          </div>

          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: '28px' }}>
            <Highlight strong="APIs" rest="robustas">
              <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4" />
            </Highlight>
            <Highlight strong="SDKs" rest="oficiais">
              <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" />
            </Highlight>
            <Highlight strong="Webhooks" rest="em tempo real">
              <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
            </Highlight>
          </div>
        </div>
      </div>
    </section>
  );
}

function Highlight({ strong, rest, children }: { strong: string; rest: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{ width: '52px', height: '52px', borderRadius: '16px', background: '#FFE4E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C8101F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
      </span>
      <span style={{ fontSize: '15px', lineHeight: 1.3, color: '#6a5a5e', fontWeight: 600 }}>
        <strong style={{ color: '#141014', fontWeight: 800 }}>{strong}</strong><br />{rest}
      </span>
    </div>
  );
}
