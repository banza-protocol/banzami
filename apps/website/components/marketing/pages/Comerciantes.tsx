import type { ReactNode } from 'react';
import {
  Ribbon, Badge, SectionLabel, H1, Lead, HeroLead, Small,
  Btn, Icon, ArrowIcon, Chip, SandboxChip, Card, RedCard, Section, Split, type IconName,
} from '@/components/marketing/kit';
import { Rotator } from '@/components/marketing/Rotator';
import { LiveClock } from '@/components/site/LiveClock';
import { Reveal } from '@/components/Reveal';
import { route, type Lang, type Loc } from '@/lib/marketing/nav';

const L = (pt: string, en: string): Loc => ({ pt, en });

// ── phone chrome (dossier) ───────────────────────────────────────────────────
const HomeInd = ({ c = '#bdb5b6' }: { c?: string }) => (
  <span style={{ position: 'absolute', bottom: '6px', left: '50%', transform: 'translateX(-50%)', width: '76px', height: '4px', borderRadius: '3px', background: c }} />
);

// Full status bar (signal + wifi + battery-with-tip) — the hero phones.
function SBarFull() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', fontSize: '10px', fontWeight: 700, color: '#141014' }}>
      <span><LiveClock kind="hm" /></span>
      <span style={{ width: '58px', height: '17px', borderRadius: '10px', background: '#0b0b0b' }} />
      <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <svg width="14" height="9" viewBox="0 0 14 9"><rect x="0" y="6" width="2.4" height="3" rx=".6" fill="#141014" /><rect x="3.8" y="4.2" width="2.4" height="4.8" rx=".6" fill="#141014" /><rect x="7.6" y="2.2" width="2.4" height="6.8" rx=".6" fill="#141014" /><rect x="11.4" y="0" width="2.4" height="9" rx=".6" fill="#b3aeaf" /></svg>
        <svg width="12" height="9" viewBox="0 0 12 9"><path d="M6 8.6l1.9-2.1a2.7 2.7 0 0 0-3.8 0z" fill="#141014" /><path d="M2.6 5.1a4.9 4.9 0 0 1 6.8 0" fill="none" stroke="#141014" strokeWidth="1.4" strokeLinecap="round" /><path d="M.8 3.1a7.5 7.5 0 0 1 10.4 0" fill="none" stroke="#141014" strokeWidth="1.4" strokeLinecap="round" /></svg>
        <svg width="20" height="9" viewBox="0 0 20 9"><rect x=".6" y=".6" width="16.4" height="7.8" rx="2.2" fill="none" stroke="#141014" strokeWidth="1.1" /><rect x="2" y="2" width="13.6" height="5" rx="1.2" fill="#141014" /><rect x="18" y="3" width="1.4" height="3" rx=".6" fill="#8a8586" /></svg>
      </span>
    </div>
  );
}

// Lite status bar (signal + battery, no wifi/tip) — the split-bill phone.
function SBarLite() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', fontSize: '10px', fontWeight: 700, color: '#141014' }}>
      <span><LiveClock kind="hm" /></span>
      <span style={{ width: '58px', height: '17px', borderRadius: '10px', background: '#0b0b0b' }} />
      <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <svg width="14" height="9" viewBox="0 0 14 9"><rect x="0" y="6" width="2.4" height="3" rx=".6" fill="#141014" /><rect x="3.8" y="4.2" width="2.4" height="4.8" rx=".6" fill="#141014" /><rect x="7.6" y="2.2" width="2.4" height="6.8" rx=".6" fill="#141014" /><rect x="11.4" y="0" width="2.4" height="9" rx=".6" fill="#b3aeaf" /></svg>
        <svg width="20" height="9" viewBox="0 0 20 9"><rect x=".6" y=".6" width="16.4" height="7.8" rx="2.2" fill="none" stroke="#141014" strokeWidth="1.1" /><rect x="2" y="2" width="13.6" height="5" rx="1.2" fill="#141014" /></svg>
      </span>
    </div>
  );
}

const BackChevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1d1a1b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
);

// Decorative blush blob behind the section visuals.
const Blob = ({ inset }: { inset: string }) => (
  <div aria-hidden="true" style={{ position: 'absolute', inset, borderRadius: '46% 54% 40% 60% / 55% 40% 60% 45%', background: 'radial-gradient(circle at 55% 45%,#FFD9D7 0%,#FFE8E6 50%,rgba(255,240,239,0) 75%)', pointerEvents: 'none' }} />
);

// Pixel-QR mock shared by the hero charge phone and the payment-link card overlay.
function QrMock() {
  return (
    <div style={{ position: 'relative', marginTop: '14px', padding: '10px', background: '#fff', borderRadius: '16px', boxShadow: '0 6px 22px -8px rgba(122,16,22,.18)', display: 'flex' }}>
      <svg viewBox="0 0 25 25" width="118" height="118" shapeRendering="crispEdges"><path d="M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2zM18 0h7v7h-7zM19 1v5h5V1zM20 2h3v3h-3zM0 18h7v7H0zM1 19v5h5v-5zM2 20h3v3H2z" fill="#B5101F" fillRule="evenodd" /><path d="M8 0h1v2H8zM10 1h2v1h-2zM13 0h1v3h-1zM15 1h2v2h-2zM9 3h2v1H9zM8 5h1v2H8zM11 5h3v1h-3zM15 4h1v3h-1zM0 8h2v1H0zM3 8h1v2H3zM5 9h2v1H5zM1 11h2v1H1zM0 13h1v2H0zM4 12h2v2H4zM2 15h3v1H2zM6 16h1v1H6zM18 8h2v1h-2zM22 8h3v1h-3zM19 10h1v2h-1zM21 11h2v1h-2zM24 10h1v3h-1zM18 13h2v1h-2zM22 14h2v2h-2zM19 16h1v1h-1zM24 17h1v2h-1zM8 18h2v1H8zM11 19h1v2h-1zM8 21h2v2H8zM13 18h3v1h-3zM14 20h1v3h-1zM16 22h2v1h-2zM19 19h2v1h-2zM22 20h1v2h-1zM18 22h1v3h-1zM20 23h3v1h-3zM11 23h2v2h-2zM9 24h1v1H9zM24 24h1v1h-1zM9 8h2v1H9zM12 9h1v2h-1zM7 10h1v1H7zM14 8h1v1h-1zM16 9h1v2h-1zM8 13h1v1H8zM16 14h1v2h-1zM13 16h2v1h-2zM9 16h1v1H9zM20 18h1v1h-1zM23 22h1v1h-1z" fill="#1d1a1b" /><rect x="9.5" y="9.5" width="6" height="6" rx="1.4" fill="#fff" /></svg>
      <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(150deg,#E0202E,#9A1B22)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', padding: '6px' }}>
        <span style={{ background: '#fff', borderRadius: '2px' }} />
        <span style={{ background: '#FFC9C6', borderRadius: '2px' }} />
        <span style={{ background: '#FFC9C6', borderRadius: '2px' }} />
        <span style={{ background: '#2a1a1c', borderRadius: '2px', transform: 'scale(.6)' }} />
      </span>
    </div>
  );
}

// ═══════════════════ HERO PHONES ═══════════════════
const T = {
  hero: {
    badge: L('Versão Beta · Sandbox', 'Beta · Sandbox'),
    h1a: L('Receba com', 'Get paid with'), h1b: L('Banzami Business.', 'Banzami Business.'),
    lead: L('QR, links e ferramentas de cobrança para receber pagamentos em Kwanza no seu negócio.', 'QR, links and billing tools to receive Kwanza payments in your business.'),
    small: L('Disponível na Sandbox, com dinheiro fictício. O Financial Live permanece indisponível.', 'Available in the Sandbox, with test money. Financial Live remains unavailable.'),
    ctaMain: L('Registar o negócio', 'Register your business'),
    ctaAlt: L('Ver como recebe', 'See how you get paid'),
    note: L('O seu negócio', 'Your business'), note2: L('também avança.', 'moves forward too.'),
    chips: [
      { icon: 'qr' as IconName, label: L('QR dinâmico', 'Dynamic QR') },
      { icon: 'link' as IconName, label: L('Links de pagamento', 'Payment links') },
      { icon: 'split' as IconName, label: L('Dividir a conta', 'Split the bill') },
      { icon: 'receipt' as IconName, label: L('Comprovativos', 'Receipts') },
    ],
    p1title: L('Nova cobrança', 'New charge'),
    p1sub: L('Sandbox · Cantina do Alex', 'Sandbox · Alex’s Canteen'),
    p1desc: L('Saldo de dados', 'Data top-up'),
    p1btn1: L('Partilhar link', 'Share link'),
    p1btn2: L('Nova cobrança', 'New charge'),
    p2title: L('Pagamento recebido', 'Payment received'),
    p2from: L('de @maria', 'from @maria'),
    p2quote: L('"Saldo de dados"', '"Data top-up"'),
    p2note: L('O valor já entrou na sua carteira.', 'The money is already in your wallet.'),
    p2btn: L('Concluir', 'Done'),
    floatA: L('Pagamento', 'Payment'), floatB: L('recebido', 'received'),
  },
};

function HeroPhoneCobranca({ lang }: { lang: Lang }) {
  const h = T.hero;
  return (
    <div aria-hidden="true" style={{ transform: 'rotate(-5deg) translate(30px,22px)', zIndex: 1, position: 'relative', width: '228px', height: '468px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#fff', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBarFull />
        <div style={{ padding: '12px 8px 0' }}>
          <BackChevron />
          <div style={{ marginTop: '8px', fontSize: '18px', fontWeight: 800, letterSpacing: '-.02em', color: '#1d1a1b' }}>{h.p1title[lang]}</div>
        </div>
        <div style={{ marginTop: '22px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: '8.5px', fontWeight: 600, color: '#9a8487' }}>{h.p1sub[lang]}</div>
          <div style={{ marginTop: '2px', fontSize: '26px', fontWeight: 900, letterSpacing: '-.03em', color: '#B5101F', lineHeight: 1.1 }}>1 500 Kz</div>
          <div style={{ marginTop: '2px', fontSize: '10px', color: '#9a8487' }}>{h.p1desc[lang]}</div>
          <QrMock />
        </div>
        <div style={{ margin: '14px 10px 0', padding: '10px', borderRadius: '12px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '10.5px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>{h.p1btn1[lang]}</div>
        <div style={{ margin: '8px 8px 0', padding: '9px', borderRadius: '12px', border: '1.2px solid #B5101F', color: '#B5101F', fontSize: '10.5px', fontWeight: 800, textAlign: 'center' }}>{h.p1btn2[lang]}</div>
        <HomeInd />
      </div>
    </div>
  );
}

function HeroPhoneRecebido({ lang }: { lang: Lang }) {
  const h = T.hero;
  return (
    <div aria-hidden="true" style={{ zIndex: 2, position: 'relative', width: '228px', height: '468px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#fff', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBarFull />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: '40px', background: 'radial-gradient(circle at 50% 38%,rgba(255,220,220,.55) 0%,rgba(255,255,255,0) 45%)' }}>
          <div style={{ fontSize: '7.5px', fontWeight: 800, letterSpacing: '.3em', color: '#9A1B22' }}>BANZAMI</div>
          <div style={{ marginTop: '8px', width: '74px', height: '74px', borderRadius: '50%', background: 'rgba(229,52,62,.85)', boxShadow: '0 0 26px 6px rgba(229,52,62,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '62px', height: '62px', borderRadius: '50%', border: '1.5px dashed rgba(255,255,255,.85)', animation: 'bzspinccw 9s linear infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', animation: 'bzspin 9s linear infinite', background: 'radial-gradient(circle at 40% 35%,#E0303A,#9A1B22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '14px', fontSize: '13px', fontWeight: 700, color: '#1d1a1b' }}>{h.p2title[lang]}</div>
          <div style={{ marginTop: '4px', fontSize: '30px', fontWeight: 900, letterSpacing: '-.03em', color: '#B5101F' }}>1 500 Kz</div>
          <div style={{ marginTop: '2px', fontSize: '11px', color: '#5a4a4e' }}>{h.p2from[lang]}</div>
          <div style={{ marginTop: '4px', fontSize: '10px', fontStyle: 'italic', color: '#9a8487' }}>{h.p2quote[lang]}</div>
          <div style={{ marginTop: '6px', fontSize: '9.5px', color: '#9a8487' }}>{h.p2note[lang]}</div>
        </div>
        <div style={{ margin: '0 14px 22px', padding: '11px', borderRadius: '14px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '11px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>{h.p2btn[lang]}</div>
        <HomeInd />
      </div>
    </div>
  );
}

// ═══════════════════ SECTION 01 · COMO RECEBE ═══════════════════
const CM = {
  label: L('COMO RECEBE', 'HOW YOU GET PAID'),
  h2a: L('Cobre por QR', 'Charge by QR'), h2b: L('ou por link.', 'or by link.'),
  lead: L('Crie uma cobrança com valor e descrição. O cliente lê o QR ou abre o link e confirma no telemóvel.', 'Create a charge with an amount and description. The customer scans the QR or opens the link and confirms on their phone.'),
  list: [
    { icon: 'qr' as IconName, t: L('QR com valor e descrição', 'QR with amount and description'), d: L('O cliente lê, confere e confirma.', 'The customer scans, checks and confirms.') },
    { icon: 'link' as IconName, t: L('Links de pagamento', 'Payment links'), d: L('Partilhe por qualquer canal: WhatsApp, SMS ou e-mail.', 'Share on any channel: WhatsApp, SMS or email.') },
    { icon: 'bolt' as IconName, t: L('Confirmação imediata', 'Instant confirmation'), d: L('Vê o pagamento no momento em que o cliente confirma.', 'See the payment the moment the customer confirms.') },
  ],
  cardLabel: L('LINK DE PAGAMENTO', 'PAYMENT LINK'),
  cardLine1: L('Almoço · mesa 4', 'Lunch · table 4'),
  cardLine2: L('Cantina do Alex', 'Alex’s Canteen'),
  copy: L('Copiar', 'Copy'),
  chEmail: L('E-mail', 'Email'),
};

// ═══════════════════ SECTION 02 · DIVIDIR A CONTA ═══════════════════
const DV = {
  label: L('DIVIDIR A CONTA', 'SPLIT THE BILL'),
  h2a: L('Uma conta,', 'One bill,'), h2b: L('várias pessoas.', 'several people.'),
  lead: L('Divida o valor por quem está à mesa. Cada pessoa paga a sua parte e acompanha o que falta receber.', 'Split the amount between everyone at the table. Each person pays their share and you track what is still due.'),
  list: [
    { icon: 'split' as IconName, t: L('Dividir em partes', 'Split into shares'), d: L('Em partes iguais ou por valor.', 'Equal shares or by amount.') },
    { icon: 'link' as IconName, t: L('Um pedido para cada pessoa', 'A request for each person'), d: L('Cada um paga a sua parte no telemóvel.', 'Everyone pays their share on their phone.') },
    { icon: 'check' as IconName, t: L('Acompanhe quem pagou', 'Track who has paid'), d: L('Veja em tempo real o que falta receber.', 'See in real time what is still due.') },
  ],
  phTitle: L('Dividir a conta', 'Split the bill'),
  phSub: L('Mesa 4 · Cantina do Alex', 'Table 4 · Alex’s Canteen'),
  total: L('Total', 'Total'),
  paid: L('2 de 4 pagos', '2 of 4 paid'),
  stPaid: L('Pago', 'Paid'), stPending: L('Pendente', 'Pending'),
  phBtn: L('Partilhar links', 'Share links'),
};
const DV_ROWS = [
  { in: 'A', h: '@ana', v: '3 000 Kz', ok: true },
  { in: 'M', h: '@maria', v: '3 000 Kz', ok: true },
  { in: 'J', h: '@joao', v: '3 000 Kz', ok: false },
  { in: 'K', h: '@kiala', v: '3 000 Kz', ok: false },
];

// ═══════════════════ SECTION 03 · HISTÓRICO E COMPROVATIVOS ═══════════════════
const VA = {
  label: L('HISTÓRICO E COMPROVATIVOS', 'HISTORY AND RECEIPTS'),
  h2a: L('Cada venda', 'Every sale'), h2b: L('fica registada.', 'is recorded.'),
  lead: L('Valor, hora, cliente e referência de cada pagamento, com um comprovativo verificável.', 'Amount, time, customer and reference for every payment, with a verifiable receipt.'),
  list: [
    { icon: 'list' as IconName, t: L('Histórico completo', 'Full history'), d: L('Todas as vendas num só lugar.', 'All sales in one place.') },
    { icon: 'receipt' as IconName, t: L('Comprovativo em cada venda', 'A receipt for every sale'), d: L('Verificável pelo cliente e por si.', 'Verifiable by the customer and by you.') },
    { icon: 'cal' as IconName, t: L('Resumo do dia', 'Daily summary'), d: L('Total recebido e número de vendas.', 'Total received and number of sales.') },
  ],
  cardLabel: L('VENDAS DE HOJE', 'TODAY’S SALES'),
  cardSub: L('9 vendas · Cantina do Alex', '9 sales · Alex’s Canteen'),
  footNote: L('Cada venda com comprovativo', 'Every sale with a receipt'),
  seeAll: L('Ver tudo', 'See all'),
};
const VA_ROWS = [
  { t: '12:40', h: '@ana', r: 'BZM-7Q4K-2M9A', v: '1 500 Kz' },
  { t: '12:31', h: '@maria', r: 'BZM-3HNA-GZ5T', v: '4 500 Kz' },
  { t: '12:02', h: '@joao', r: 'BZM-P8LE-4Q2C', v: '2 250 Kz' },
  { t: '11:48', h: '@kiala', r: 'BZM-M2VX-9KD1', v: '850 Kz' },
];

// ═══════════════════ CTA ═══════════════════
const CT = {
  eyebrow: L('BANZAMI BUSINESS', 'BANZAMI BUSINESS'),
  h2: L('Registe o negócio e comece a testar na Sandbox.', 'Register your business and start testing in the Sandbox.'),
  lead: L('A candidatura é feita online, em poucos passos. Depois de aprovada, ativa o negócio e começa a receber com dinheiro fictício.', 'The application is online, in a few steps. Once approved, you activate the business and start receiving test money.'),
  ctaMain: L('Registar o negócio', 'Register your business'),
  ctaAlt: L('Estado da candidatura', 'Application status'),
};

// Shared rotating feature list (dossier data-rot="list").
function RotList({ items, lang }: { items: { icon: IconName; t: Loc; d: Loc }[]; lang: Lang }) {
  return (
    <Rotator mode="list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '26px', maxWidth: '440px' }}>
      {items.map((f, i) => (
        <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', display: 'flex', gap: '14px', alignItems: 'center', padding: '13px 16px 13px 13px', borderRadius: '18px', border: '1px solid transparent', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
          <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}><Icon name={f.icon} color="currentColor" size={19} /></span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#141014' }}>{f.t[lang]}</p>
            <p style={{ margin: '3px 0 0', fontSize: '13px', lineHeight: 1.45, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{f.d[lang]}</p>
          </div>
          <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', opacity: 0, transition: 'opacity .6s' }}><span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} /></span>
        </div>
      ))}
    </Rotator>
  );
}

const SectionHead = ({ h2a, h2b }: { h2a: ReactNode; h2b: ReactNode }) => (
  <h2 style={{ margin: '20px 0 0', fontSize: 'clamp(32px,3.5vw,44px)', lineHeight: 1.06, fontWeight: 900, letterSpacing: '-.03em', color: '#141014', textWrap: 'balance' }}>{h2a}<br /><span style={{ color: '#B5101F' }}>{h2b}</span></h2>
);

// ═══════════════════════════════════════════════════════════════════════════
export function ComerciantesPage({ lang }: { lang: Lang }) {
  const h = T.hero;
  return (
    <>
      {/* ── HERO ── */}
      <section id="inicio" style={{ position: 'relative', padding: '112px 24px 64px', overflow: 'hidden', background: '#fff', borderRadius: '0 0 48px 48px', boxShadow: '0 40px 80px -60px rgba(122,16,22,.45)' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/hero-bg-red.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
        </div>
        <Ribbon />
        <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '48px', alignItems: 'center' }}>
          <div>
            <Badge>{h.badge[lang]}</Badge>
            <H1 a={h.h1a[lang]} b={h.h1b[lang]} />
            <HeroLead>{h.lead[lang]}</HeroLead>
            <Small mw={540}>{h.small[lang]}</Small>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginTop: '26px' }}>
              <Btn href={route('candidatura', lang)} kind="red">{h.ctaMain[lang]}</Btn>
              <Btn href="#como" kind="ghost">{h.ctaAlt[lang]}</Btn>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '22px' }}>
              {h.chips.map((c, i) => <Chip key={i} icon={c.icon}>{c.label[lang]}</Chip>)}
            </div>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '600px' }}>
            <div style={{ position: 'relative', filter: 'drop-shadow(0 50px 60px rgba(60,0,8,.35))' }}>
              <div className="bz-phones" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
                  <HeroPhoneCobranca lang={lang} />
                  <HeroPhoneRecebido lang={lang} />
                  <div aria-hidden="true" className="bz-float" style={{ position: 'absolute', zIndex: 3, right: '-40px', top: '110px', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '16px', background: '#fff', boxShadow: '0 20px 40px -18px rgba(122,16,22,.35)', fontSize: '12px', fontWeight: 700, color: '#141014', lineHeight: 1.3, animation: 'floaty 6s ease-in-out infinite' }}>
                    <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#D8121F', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>{h.floatA[lang]}<br />{h.floatB[lang]}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="bz-note" style={{ position: 'absolute', fontFamily: "'Caveat',cursive", fontWeight: 600, lineHeight: 1.05, pointerEvents: 'none', right: 'max(18px,calc(50% - 700px))', top: '320px', color: '#fff', fontSize: '27px', transform: 'rotate(-10deg)' }}>{h.note[lang]}<br />{h.note2[lang]}</div>
      </section>

      {/* ── 01 · COMO RECEBE ── */}
      <Section id="como" panel>
        <Reveal>
          <Split
            left={
              <>
                <SectionLabel n="01" label={CM.label[lang]} panel />
                <SectionHead h2a={CM.h2a[lang]} h2b={CM.h2b[lang]} />
                <Lead>{CM.lead[lang]}</Lead>
                <RotList items={CM.list} lang={lang} />
              </>
            }
            right={
              <>
                <Blob inset="0 -6% 0 10%" />
                <Card style={{ maxWidth: '420px', marginLeft: 'auto', padding: '26px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '.14em', color: '#9a8487' }}>{CM.cardLabel[lang]}</span>
                    <SandboxChip>SANDBOX</SandboxChip>
                  </div>
                  <div style={{ display: 'flex', gap: '18px', alignItems: 'center', marginTop: '18px' }}>
                    <div style={{ padding: '8px', borderRadius: '14px', background: '#fff', border: '1px solid #F3E3E1' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/assets/qr-banzami.png" alt="" style={{ width: '92px', height: 'auto', display: 'block', borderRadius: '10px' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '30px', fontWeight: 900, letterSpacing: '-.03em', color: '#B5101F' }}>4 500 Kz</div>
                      <div style={{ marginTop: '2px', fontSize: '14px', fontWeight: 700, color: '#4a3a3e' }}>{CM.cardLine1[lang]}</div>
                      <div style={{ marginTop: '4px', fontSize: '12.5px', fontWeight: 600, color: '#9a8487' }}>{CM.cardLine2[lang]}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderRadius: '14px', background: '#FFF8F7', border: '1px solid #F3E3E1' }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12.5px', color: '#4a3a3e', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Link · 7Q4K-2M9A</span>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#B5101F' }}>{CM.copy[lang]}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
                    <Chip icon="send">WhatsApp</Chip>
                    <Chip icon="send">SMS</Chip>
                    <Chip icon="send">{CM.chEmail[lang]}</Chip>
                  </div>
                </Card>
              </>
            }
          />
        </Reveal>
      </Section>

      {/* ── 02 · DIVIDIR A CONTA ── */}
      <Section id="dividir">
        <Reveal>
          <Split
            left={
              <>
                <SectionLabel n="02" label={DV.label[lang]} />
                <SectionHead h2a={DV.h2a[lang]} h2b={DV.h2b[lang]} />
                <Lead>{DV.lead[lang]}</Lead>
                <RotList items={DV.list} lang={lang} />
              </>
            }
            right={
              <>
                <Blob inset="2% 4% 2% -6%" />
                <div className="bz-phones" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div aria-hidden="true" style={{ position: 'relative', flex: 'none', width: '228px', height: '468px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)', zIndex: 2 }}>
                    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#FBF6F5', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
                      <SBarLite />
                      <div style={{ padding: '12px 8px 0' }}>
                        <BackChevron />
                        <div style={{ marginTop: '8px', fontSize: '17px', fontWeight: 800, letterSpacing: '-.02em', color: '#1d1a1b' }}>{DV.phTitle[lang]}</div>
                      </div>
                      <div style={{ margin: '2px 8px 0', fontSize: '9px', color: '#9a8487' }}>{DV.phSub[lang]}</div>
                      <div style={{ margin: '14px 6px 0', padding: '12px', borderRadius: '16px', background: '#fff', boxShadow: '0 10px 24px -14px rgba(122,16,22,.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '9px', color: '#9a8487' }}>{DV.total[lang]}</span>
                          <span style={{ fontSize: '9px', fontWeight: 800, color: '#1E8E4E' }}>{DV.paid[lang]}</span>
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-.03em', color: '#B5101F' }}>12 000 Kz</div>
                        <div style={{ marginTop: '8px', height: '5px', borderRadius: '4px', background: '#F4E6E4', overflow: 'hidden' }}>
                          <div style={{ width: '50%', height: '100%', background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} />
                        </div>
                      </div>
                      <div style={{ margin: '10px 8px 0' }}>
                        {DV_ROWS.map((r, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid #F1E6E4' }}>
                            <span style={{ flex: 'none', width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg,#C8101F,#E0303A 45%,#8E1620)', color: '#fff', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.in}</span>
                            <span style={{ flex: 1, fontSize: '9.5px', fontWeight: 700, color: '#1d1a1b' }}>{r.h}</span>
                            <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#1d1a1b' }}>{r.v}</span>
                            <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '7px', fontWeight: 800, background: r.ok ? '#E3F4EA' : '#FCEFC4', color: r.ok ? '#1E8E4E' : '#7A4A06' }}>{(r.ok ? DV.stPaid : DV.stPending)[lang]}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ margin: 'auto 8px 18px', padding: '10px', borderRadius: '14px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '11px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>{DV.phBtn[lang]}</div>
                      <HomeInd />
                    </div>
                  </div>
                </div>
              </>
            }
          />
        </Reveal>
      </Section>

      {/* ── 03 · HISTÓRICO E COMPROVATIVOS ── */}
      <Section id="vantagens" panel>
        <Reveal>
          <Split
            left={
              <>
                <SectionLabel n="03" label={VA.label[lang]} panel />
                <SectionHead h2a={VA.h2a[lang]} h2b={VA.h2b[lang]} />
                <Lead>{VA.lead[lang]}</Lead>
                <RotList items={VA.list} lang={lang} />
              </>
            }
            right={
              <>
                <Blob inset="0 -6% 0 10%" />
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
                  <Card style={{ maxWidth: '460px', padding: '26px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 900, letterSpacing: '.14em', color: '#9a8487' }}>{VA.cardLabel[lang]}</p>
                        <p style={{ margin: '6px 0 0', fontSize: '32px', fontWeight: 900, letterSpacing: '-.03em', color: '#B5101F' }}>18 450 Kz</p>
                        <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 700, color: '#8a7a7e' }}>{VA.cardSub[lang]}</p>
                      </div>
                      <SandboxChip>SANDBOX</SandboxChip>
                    </div>
                    <div style={{ marginTop: '16px' }}>
                      {VA_ROWS.map((r, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) auto', gap: '12px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #F5E8E6' }}>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: '#9a8487' }}>{r.t}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: '#141014' }}>{r.h}</div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: '#9a8487', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.r}</div>
                          </div>
                          <span style={{ fontSize: '14px', fontWeight: 900, color: '#141014', whiteSpace: 'nowrap' }}>{r.v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#8a7a7e' }}>{VA.footNote[lang]}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: '#B5101F' }}>{VA.seeAll[lang]}<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
                    </div>
                  </Card>
                </div>
              </>
            }
          />
        </Reveal>
      </Section>

      {/* ── CTA ── */}
      <Section pad="clamp(24px,4vw,48px) 24px clamp(56px,7vw,96px)">
        <Reveal>
          <RedCard>
            <p style={{ margin: 0, fontSize: '11.5px', fontWeight: 900, letterSpacing: '.18em', color: 'rgba(255,255,255,.75)' }}>{CT.eyebrow[lang]}</p>
            <h2 style={{ margin: '10px 0 0', fontSize: 'clamp(28px,3vw,40px)', fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.08, maxWidth: '640px', textWrap: 'balance' }}>{CT.h2[lang]}</h2>
            <p style={{ margin: '14px 0 0', fontSize: '15.5px', lineHeight: 1.6, fontWeight: 600, color: 'rgba(255,255,255,.86)', maxWidth: '560px', textWrap: 'pretty' }}>{CT.lead[lang]}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginTop: '26px' }}>
              <Btn href={route('candidatura', lang)} kind="white">{CT.ctaMain[lang]}</Btn>
              <Btn href={route('estado', lang)} kind="outlineW">{CT.ctaAlt[lang]}</Btn>
            </div>
          </RedCard>
        </Reveal>
      </Section>
    </>
  );
}
