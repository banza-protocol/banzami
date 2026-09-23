import { Reveal } from '@/components/Reveal';
import { type Lang, type Loc } from '@/lib/marketing/nav';
import {
  SectionLabel, H1, H2, HeroLead, Small, Lead, Btn, Row, Section, RedCard,
  Badge, Chip, Icon, SandboxNotice, tok, type IconName,
} from '../kit';
import { CodeWindow } from '../CodeWindow';
import { Rotator } from '../Rotator';

// banzami.com/developers — public developer platform landing, ported verbatim
// from handoff_site_completo/pages/Developers(.dc | EN.dc).html on the shared
// marketing shell. Header/footer come from <SiteShell>; this is only the body.

const L = (pt: string, en: string): Loc => ({ pt, en });

const CONSOLE_URL = '/developers/login';
const DOCS_URL = '/developers/docs';

// ── code fragments (real endpoint, dossier syntax colours) ──────────────────
const heroCurl = (
  <>
    {'curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \\\n'}
    {'  -H '}{tok.k('"Authorization: Bearer bz_test_sk_XXXX"')}{' \\\n'}
    {'  -H '}{tok.k('"Content-Type: application/json"')}{' \\\n'}
    {'  -H '}{tok.k('"Idempotency-Key: pedido-123"')}{' \\\n'}
    {'  -d '}{tok.k("'{")}{'\n'}
    {'    '}{tok.p('"purpose"')}{': '}{tok.v('"ORDER"')}{',\n'}
    {'    '}{tok.p('"amount_minor"')}{': '}{tok.v('150000')}{',\n'}
    {'    '}{tok.p('"currency"')}{': '}{tok.v('"AOA"')}{',\n'}
    {'    '}{tok.p('"reference_id"')}{': '}{tok.v('"pedido-123"')}{'\n'}
    {'  '}{tok.k("}'")}
  </>
);
const heroTs = (
  <>
    {'\n'}
    {tok.k('import')}{' { Banzami } '}{tok.k('from')}{' '}{tok.v('"@banzami/sdk"')}{';\n\n'}
    {tok.k('const')}{' bz = '}{tok.k('new')}{' Banzami({ apiKey: process.env.BZ_TEST_KEY });\n\n'}
    {tok.k('const')}{' session = '}{tok.k('await')}{' bz.paymentSessions.create({\n'}
    {'  '}{tok.p('purpose')}{': '}{tok.v('"ORDER"')}{',\n'}
    {'  '}{tok.p('amountMinor')}{': '}{tok.v('150000')}{',   '}{tok.c('// 1 500 Kz')}{'\n'}
    {'  '}{tok.p('currency')}{': '}{tok.v('"AOA"')}{',\n'}
    {'  '}{tok.p('referenceId')}{': '}{tok.v('"pedido-123"')}{',\n'}
    {'});'}
  </>
);
const eventCode = (lang: Lang) => (
  <>
    {'\n'}
    {tok.c(lang === 'en' ? '// Example event received at your endpoint' : '// Exemplo de evento recebido no seu endpoint')}{'\n'}
    {'{\n'}
    {'  '}{tok.p('"type"')}{': '}{tok.v('"payment_session.completed"')}{',\n'}
    {'  '}{tok.p('"environment"')}{': '}{tok.v('"sandbox"')}{',\n'}
    {'  '}{tok.p('"data"')}{': {\n'}
    {'    '}{tok.p('"reference_id"')}{': '}{tok.v('"pedido-123"')}{',\n'}
    {'    '}{tok.p('"amount_minor"')}{': '}{tok.v('150000')}{',\n'}
    {'    '}{tok.p('"currency"')}{': '}{tok.v('"AOA"')}{',\n'}
    {'    '}{tok.p('"receipt"')}{': '}{tok.v('"BZM-7Q4K-2M9A"')}{'\n'}
    {'  }\n'}
    {'}\n'}
    {tok.c(lang === 'en' ? '// Always verify the signature before processing.' : '// Verifique sempre a assinatura antes de processar.')}
  </>
);

// ── content ─────────────────────────────────────────────────────────────────
const T = {
  heroBadge: L('Versão Beta · Sandbox', 'Beta · Sandbox'),
  heroH1a: L('Integre Banzami', 'Integrate Banzami'),
  heroH1b: L('no seu produto.', 'into your product.'),
  heroLead: L(
    'APIs, SDK e webhooks para aceitar pagamentos em Kwanza na sua aplicação. Comece hoje na Sandbox.',
    'APIs, SDK and webhooks to accept Kwanza payments in your application. Start today in the Sandbox.',
  ),
  heroSmall: L(
    'Apenas Sandbox, com dinheiro fictício. O Financial Live permanece indisponível.',
    'Sandbox only, with test money. Financial Live remains unavailable.',
  ),
  portal: L('Portal Developers', 'Portal Developers'),
  docs: L('Documentação', 'Documentation'),
  chips: [
    L('API v1', 'API v1'),
    L('SDK TypeScript', 'SDK TypeScript'),
    L('Webhooks assinados', 'Signed webhooks'),
  ] as Loc[],
  note: L("// Build with Banzami\nfor what's next.", "// Build with Banzami\nfor what's next."),

  // 01 · O QUE PODE CONSTRUIR
  buildLabel: L('O QUE PODE CONSTRUIR', 'WHAT YOU CAN BUILD'),
  buildH2a: L('Os blocos para', 'The building blocks'),
  buildH2b: L('aceitar Kwanza.', 'to accept Kwanza.'),
  buildLead: L(
    'Tudo o que precisa para cobrar, confirmar e reembolsar pagamentos na sua aplicação.',
    'Everything you need to charge, confirm and refund payments in your application.',
  ),
  buildCards: [
    { icon: 'box' as IconName, tag: 'SESSIONS', t: L('Payment Sessions', 'Payment Sessions'), d: L('Crie uma sessão com valor e referência e acompanhe o estado até ao fim.', 'Create a session with an amount and reference and track its status to the end.') },
    { icon: 'link' as IconName, tag: 'LINKS', t: L('Payment Links', 'Payment Links'), d: L('Gere links de pagamento para partilhar com os seus clientes.', 'Generate payment links to share with your customers.') },
    { icon: 'qr' as IconName, tag: 'QR', t: L('QR', 'QR'), d: L('Apresente um QR para o cliente pagar com a app Banzami.', 'Show a QR for the customer to pay with the Banzami app.') },
    { icon: 'bolt' as IconName, tag: 'WEBHOOKS', t: L('Webhooks', 'Webhooks'), d: L('Receba eventos assinados quando um pagamento muda de estado.', 'Receive signed events when a payment changes status.') },
    { icon: 'refund' as IconName, tag: 'REFUNDS', t: L('Refunds', 'Refunds'), d: L('Devolva total ou parcialmente um pagamento concluído.', 'Refund a completed payment in full or in part.') },
    { icon: 'shield' as IconName, tag: 'SANDBOX', t: L('Sandbox isolada', 'Isolated Sandbox'), d: L('Chaves de teste e dinheiro fictício para testar sem risco.', 'Test keys and test money to try things safely.') },
  ],

  // 02 · WEBHOOKS
  whLabel: L('WEBHOOKS', 'WEBHOOKS'),
  whH2a: L('Eventos assinados,', 'Signed,'),
  whH2b: L('verificáveis.', 'verifiable events.'),
  whLead: L(
    'Cada evento é assinado. Verifique a assinatura no seu servidor antes de processar e trate repetições com a mesma chave de idempotência.',
    'Every event is signed. Verify the signature on your server before processing, and handle retries with the same idempotency key.',
  ),
  whList: [
    { icon: 'plug' as IconName, t: L('API v1', 'API v1'), d: L('Documentada, com exemplos por endpoint.', 'Documented, with examples for each endpoint.') },
    { icon: 'layers' as IconName, t: L('SDK TypeScript', 'SDK TypeScript'), d: L('Publicado como @banzami/sdk.', 'Published as @banzami/sdk.') },
    { icon: 'bolt' as IconName, t: L('Webhooks assinados', 'Signed webhooks'), d: L('Eventos verificáveis no seu servidor.', 'Events you can verify on your server.') },
  ],
  whTab: L('Evento', 'Event'),

  // 03 · SDKS DISPONÍVEIS
  sdkLabel: L('SDKS DISPONÍVEIS', 'AVAILABLE SDKS'),
  sdkH2a: L('O que já pode', 'What you can'),
  sdkH2b: L('usar hoje.', 'use today.'),
  sdkLead: L(
    'Os SDKs oficiais tratam da autenticação, idempotência, repetições e verificação de webhooks. A API HTTP serve para diagnóstico e integrações específicas.',
    'The official SDKs handle authentication, idempotency, retries and webhook verification. The HTTP API is for diagnostics and specific integrations.',
  ),
  thPackage: L('PACOTE', 'PACKAGE'),
  thLanguage: L('LINGUAGEM', 'LANGUAGE'),
  thStatus: L('ESTADO', 'STATUS'),
  thInstall: L('INSTALAÇÃO', 'INSTALLATION'),
  noticeTitle: L('Apenas Sandbox nesta fase', 'Sandbox only in this phase'),
  noticeBody: L(
    'As chaves disponíveis são de teste (bz_test_). O Financial Live permanece indisponível e os pedidos em produção são rejeitados.',
    'Available keys are test keys (bz_test_). Financial Live remains unavailable and production requests are rejected.',
  ),

  // CTA
  ctaLabel: L('PARA DEVELOPERS', 'FOR DEVELOPERS'),
  ctaH2: L('Crie a sua conta e obtenha chaves Sandbox.', 'Create your account and get Sandbox keys.'),
  ctaLead: L(
    'No Portal Developers encontra as chaves de teste, os logs de pedidos e a configuração de webhooks.',
    'In the Developer Portal you will find test keys, request logs and webhook settings.',
  ),
};

// SDK table rows (exact truth — do not change).
type SdkRow = { pkg: string; lang: string; published: boolean; badge: Loc; badgeBg: string; badgeColor: string; install: string };
const SDK_ROWS: SdkRow[] = [
  { pkg: '@banzami/sdk', lang: 'TypeScript / Node.js', published: true, badge: L('Publicado · servidor', 'Published · server'), badgeBg: '#E3F4EA', badgeColor: '#1E8E4E', install: 'npm install @banzami/sdk' },
  { pkg: 'banzami_client', lang: 'Dart / Flutter', published: true, badge: L('Publicado · cliente, só leitura', 'Published · client, read-only'), badgeBg: '#EAF1FB', badgeColor: '#2A5CA8', install: 'dart pub add banzami_client' },
  { pkg: 'banzami-python', lang: 'Python', published: true, badge: L('Publicado · servidor', 'Published · server'), badgeBg: '#E3F4EA', badgeColor: '#1E8E4E', install: 'pip install banzami-python' },
  { pkg: 'banzami/sdk-php', lang: 'PHP', published: false, badge: L('Não publicado', 'Not published'), badgeBg: '#F4EFEE', badgeColor: '#8a7a7e', install: '—' },
];

const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontSize: '11px', fontWeight: 900, letterSpacing: '.14em', color: '#9a8487', borderBottom: '1px solid #F3E3E1', background: '#FFFBFA' };
const tdBase: React.CSSProperties = { padding: '16px 18px', borderBottom: '1px solid #F5E8E6' };
const tdMono: React.CSSProperties = { ...tdBase, fontFamily: "'JetBrains Mono',monospace", fontSize: '13px' };

// data-ri card icon slot (Rotator animates its inline styles).
function RiIc({ name }: { name: IconName }) {
  return (
    <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}>
      <Icon name={name} color="currentColor" size={19} />
    </span>
  );
}
function RiBar() {
  return (
    <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', opacity: 0, transition: 'opacity .6s' }}>
      <span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} />
    </span>
  );
}

export function DevelopersPage({ lang }: { lang: Lang }) {
  return (
    <>
      {/* ═══════════ 00 · HERO ═══════════ */}
      <section id="inicio" style={{ position: 'relative', padding: '112px 24px 64px', overflow: 'hidden', background: '#fff', borderRadius: '0 0 48px 48px', boxShadow: '0 40px 80px -60px rgba(122,16,22,.45)' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/hero-bg-red.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
        </div>
        <div aria-hidden="true" style={{ position: 'fixed', top: '12px', left: '-52px', zIndex: 80, pointerEvents: 'none', transform: 'rotate(-45deg)', width: '150px', padding: '5px 0', textAlign: 'center', background: 'linear-gradient(90deg,#FBE6A6,#F2CD6E)', color: '#7A4A06', fontSize: '9.5px', fontWeight: 900, letterSpacing: '.16em', boxShadow: '0 8px 18px -8px rgba(122,74,6,.5)' }}>SANDBOX</div>
        <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '48px', alignItems: 'center' }}>
          <Reveal>
            <Badge>{T.heroBadge[lang]}</Badge>
            <H1 a={T.heroH1a[lang]} b={T.heroH1b[lang]} />
            <HeroLead mw={540}>{T.heroLead[lang]}</HeroLead>
            <Small mw={540}>{T.heroSmall[lang]}</Small>
            <Row mt={26} gap={24}>
              <Btn href={CONSOLE_URL} kind="dark">{T.portal[lang]}</Btn>
              <Btn href={DOCS_URL} kind="text">{T.docs[lang]}</Btn>
            </Row>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '24px' }}>
              <Chip icon="plug">{T.chips[0][lang]}</Chip>
              <Chip icon="layers">{T.chips[1][lang]}</Chip>
              <Chip icon="bolt">{T.chips[2][lang]}</Chip>
            </div>
          </Reveal>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '520px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '520px' }}>
              <CodeWindow
                minH={250}
                tabs={[
                  { k: 'curl', label: 'cURL', code: heroCurl },
                  { k: 'ts', label: 'TypeScript', code: heroTs },
                ]}
              />
              <div aria-hidden="true" className="bz-float" style={{ position: 'absolute', right: '-26px', bottom: '-30px', width: '124px', height: '124px', borderRadius: '26px', background: '#fff', boxShadow: '0 30px 56px -22px rgba(122,16,22,.45)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', animation: 'floaty 6s ease-in-out infinite' }}>
                <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D8121F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /><path d="M14 4l-4 16" /></svg>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11.5px', fontWeight: 600, color: '#141014' }}>@banzami/sdk</span>
              </div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="bz-note" style={{ position: 'absolute', fontFamily: "'Caveat',cursive", fontWeight: 600, lineHeight: 1.05, pointerEvents: 'none', right: 'max(18px,calc(50% - 700px))', top: '130px', color: '#fff', fontSize: '24px', transform: 'rotate(-8deg)', textAlign: 'right', whiteSpace: 'pre-line' }}>{T.note[lang]}</div>
      </section>

      {/* ═══════════ 01 · O QUE PODE CONSTRUIR ═══════════ */}
      <Section panel>
        <Reveal>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,.9fr)', gap: '20px 56px', alignItems: 'end' }}>
            <div>
              <SectionLabel n="01" label={T.buildLabel[lang]} panel />
              <H2 a={T.buildH2a[lang]} b={T.buildH2b[lang]} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '480px', textWrap: 'pretty' }}>{T.buildLead[lang]}</p>
          </div>
          <Rotator mode="card" idle="#FFF8F7" className="bz-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '14px', marginTop: '44px' }}>
            {T.buildCards.map((c) => (
              <div key={c.tag} data-ri style={{ position: 'relative', overflow: 'hidden', padding: '20px 20px 22px', borderRadius: '22px', border: '1px solid rgba(181,16,31,.06)', background: '#FFF8F7', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <RiIc name={c.icon} />
                  <span data-ri-tag style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', fontWeight: 600, letterSpacing: '.06em', color: '#B5101F', opacity: 0, transition: 'opacity .6s' }}>{c.tag}</span>
                </div>
                <p style={{ margin: '16px 0 0', fontSize: '16px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{c.t[lang]}</p>
                <p style={{ margin: '6px 0 0', fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{c.d[lang]}</p>
                <RiBar />
              </div>
            ))}
          </Rotator>
        </Reveal>
      </Section>

      {/* ═══════════ 02 · WEBHOOKS ═══════════ */}
      <Section>
        <Reveal>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: '56px', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <SectionLabel n="02" label={T.whLabel[lang]} />
              <H2 a={T.whH2a[lang]} b={T.whH2b[lang]} />
              <Lead mw={440}>{T.whLead[lang]}</Lead>
              <Rotator mode="list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '26px', maxWidth: '440px' }}>
                {T.whList.map((it) => (
                  <div key={it.t.pt} data-ri style={{ position: 'relative', overflow: 'hidden', display: 'flex', gap: '14px', alignItems: 'center', padding: '13px 16px 13px 13px', borderRadius: '18px', border: '1px solid transparent', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                    <RiIc name={it.icon} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#141014' }}>{it.t[lang]}</p>
                      <p style={{ margin: '3px 0 0', fontSize: '13px', lineHeight: 1.45, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{it.d[lang]}</p>
                    </div>
                    <RiBar />
                  </div>
                ))}
              </Rotator>
            </div>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <div aria-hidden="true" style={{ position: 'absolute', borderRadius: '46% 54% 40% 60% / 55% 40% 60% 45%', background: 'radial-gradient(circle at 55% 45%,#FFD9D7 0%,#FFE8E6 50%,rgba(255,240,239,0) 75%)', pointerEvents: 'none', inset: '0 -6% 0 4%' }} />
              <div style={{ position: 'relative' }}>
                <CodeWindow minH={300} tabs={[{ k: 'evt', label: T.whTab[lang], code: eventCode(lang) }]} />
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ═══════════ 03 · SDKS DISPONÍVEIS ═══════════ */}
      <Section id="sdks" panel>
        <Reveal>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,.9fr)', gap: '20px 56px', alignItems: 'end' }}>
            <div>
              <SectionLabel n="03" label={T.sdkLabel[lang]} panel />
              <H2 a={T.sdkH2a[lang]} b={T.sdkH2b[lang]} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '480px', textWrap: 'pretty' }}>{T.sdkLead[lang]}</p>
          </div>
          <div className="bz-tablewrap" style={{ marginTop: '40px', border: '1px solid #F3E3E1', borderRadius: '22px', overflow: 'hidden', background: '#fff', boxShadow: '0 24px 50px -40px rgba(122,16,22,.4)' }}>
            <table className="bz-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '14.5px', fontWeight: 600, color: '#4a3a3e', minWidth: '640px' }}>
              <thead>
                <tr>
                  <th scope="col" style={th}>{T.thPackage[lang]}</th>
                  <th scope="col" style={th}>{T.thLanguage[lang]}</th>
                  <th scope="col" style={th}>{T.thStatus[lang]}</th>
                  <th scope="col" style={th}>{T.thInstall[lang]}</th>
                </tr>
              </thead>
              <tbody>
                {SDK_ROWS.map((r) => (
                  <tr key={r.pkg}>
                    <td style={{ ...tdMono, color: r.published ? '#B5101F' : '#9a8487' }}>{r.pkg}</td>
                    <td style={{ ...tdBase, fontWeight: 900, color: r.published ? '#141014' : '#8a7a7e' }}>{r.lang}</td>
                    <td style={tdBase}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', background: r.badgeBg, color: r.badgeColor, fontSize: '12px', fontWeight: 900, whiteSpace: 'nowrap' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />{r.badge[lang]}
                      </span>
                    </td>
                    <td style={{ ...tdBase, fontFamily: "'JetBrains Mono',monospace", fontSize: '12.5px', color: '#4a3a3e', whiteSpace: 'nowrap' }}>{r.install}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '18px' }}>
            <SandboxNotice title={T.noticeTitle[lang]}>{T.noticeBody[lang]}</SandboxNotice>
          </div>
        </Reveal>
      </Section>

      {/* ═══════════ CTA ═══════════ */}
      <Section pad="clamp(24px,4vw,48px) 24px clamp(56px,7vw,96px)">
        <Reveal>
          <RedCard>
            <p style={{ margin: 0, fontSize: '11.5px', fontWeight: 900, letterSpacing: '.18em', color: 'rgba(255,255,255,.75)' }}>{T.ctaLabel[lang]}</p>
            <h2 style={{ margin: '10px 0 0', fontSize: 'clamp(28px,3vw,40px)', fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.08, maxWidth: '640px', textWrap: 'balance' }}>{T.ctaH2[lang]}</h2>
            <p style={{ margin: '14px 0 0', fontSize: '15.5px', lineHeight: 1.6, fontWeight: 600, color: 'rgba(255,255,255,.86)', maxWidth: '560px', textWrap: 'pretty' }}>{T.ctaLead[lang]}</p>
            <Row mt={26} gap={12}>
              <Btn href={CONSOLE_URL} kind="white">{T.portal[lang]}</Btn>
              <Btn href={DOCS_URL} kind="outlineW">{T.docs[lang]}</Btn>
            </Row>
          </RedCard>
        </Reveal>
      </Section>
    </>
  );
}
