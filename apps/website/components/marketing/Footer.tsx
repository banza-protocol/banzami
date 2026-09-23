import { ROUTES, route, type Lang, type RouteKey, type Loc } from '@/lib/marketing/nav';

const L = (pt: string, en: string): Loc => ({ pt, en });
const CONSOLE_URL = '/developers/login';

type FIcon = 'box' | 'store' | 'code' | 'shield' | 'layers' | 'info' | 'life' | 'help' | 'qr' | 'at' | 'lock';

const ICON: Record<FIcon, string> = {
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z|M4 7.5l8 4.5 8-4.5M12 12v9',
  store: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  shield: 'M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6z|M9.2 11.6l1.9 1.9 3.7-3.7',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  info: 'M12 11.5v4.5M12 8h.01',
  life: 'M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9',
  help: 'M9.5 9.5a2.5 2.5 0 0 1 4.8.9c0 1.6-2.3 2.1-2.3 3.6M12 17h.01',
  qr: 'RECT',
  at: 'CIRC-AT',
  lock: 'M8 11V8a4 4 0 0 1 8 0v3',
};

function Ico({ name, size = 15, stroke = '#B5101F' }: { name: FIcon; size?: number; stroke?: string }) {
  const common = { fill: 'none', stroke, strokeWidth: 1.9 as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'qr') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3M21 14v7h-7" />
      </svg>
    );
  }
  if (name === 'at') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
        <circle cx="12" cy="12" r="3.6" /><path d="M15.6 12v1.4a2.4 2.4 0 0 0 4.8 0V12a8.4 8.4 0 1 0-3.3 6.7" />
      </svg>
    );
  }
  const extras: Partial<Record<FIcon, React.ReactNode>> = {
    info: <circle cx="12" cy="12" r="9" />,
    life: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /></>,
    help: <circle cx="12" cy="12" r="9" />,
    lock: <rect x="5" y="11" width="14" height="9" rx="2.5" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      {extras[name]}
      {ICON[name].split('|').map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

function Arrow({ c = '#c2a8aa', s = 14 }: { c?: string; s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
function BrandGlyph({ s = 36 }: { s?: number }) {
  return (
    <span style={{ flex: 'none', width: s, height: s, borderRadius: Math.round(s / 3), background: 'linear-gradient(150deg,#D0182A,#9A1B22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px -4px rgba(181,16,31,.5)' }}>
      <svg width={Math.round(s * 0.55)} height={Math.round(s * 0.55)} viewBox="0 0 100 100" fill="none">
        <rect x="6" y="6" width="42" height="42" rx="13" fill="#fff" /><rect x="56" y="10" width="32" height="32" rx="10" fill="#FBD2D0" /><rect x="10" y="56" width="38" height="38" rx="11" fill="#FBD2D0" /><rect x="58" y="60" width="28" height="28" rx="9" fill="#fff" />
      </svg>
    </span>
  );
}

const EXPLORE: { icon: FIcon; label: Loc; to: { key: RouteKey; hash?: string } }[] = [
  { icon: 'box', label: L('Produto', 'Product'), to: { key: 'produto' } },
  { icon: 'store', label: L('Comerciantes', 'Merchants'), to: { key: 'comerciantes' } },
  { icon: 'code', label: L('Developers', 'Developers'), to: { key: 'developers' } },
  { icon: 'shield', label: L('Segurança', 'Security'), to: { key: 'seguranca' } },
  { icon: 'layers', label: L('BANZA', 'BANZA'), to: { key: 'sobre', hash: '#banza' } },
  { icon: 'info', label: L('Sobre', 'About'), to: { key: 'sobre' } },
  { icon: 'life', label: L('Suporte', 'Support'), to: { key: 'suporte' } },
  { icon: 'help', label: L('Perguntas frequentes', 'FAQ'), to: { key: 'suporte', hash: '#faq' } },
];

const CHIPS: { icon: FIcon; label: Loc }[] = [
  { icon: 'qr', label: L('Pagamentos por QR', 'QR payments') },
  { icon: 'at', label: L('@banza', '@banza') },
  { icon: 'shield', label: L('Comprovativo verificável', 'Verifiable receipt') },
];

const T = {
  tagline: L('Pagamentos em Kwanza, de\ncarteira para carteira.', 'Kwanza payments, from\nwallet to wallet.'),
  desc: L(
    'A startup que está a construir uma rede de pagamentos nativa de carteira para Angola, sobre o protocolo aberto BANZA.',
    'The startup building a wallet-native payment network for Angola, on the open BANZA protocol.',
  ),
  explore: L('Explorar', 'Explore'),
  kicker: L('PARA DEVELOPERS E PARCEIROS', 'FOR DEVELOPERS AND PARTNERS'),
  redTitle: L('Construa com Banzami', 'Build with Banzami'),
  redDesc: L(
    'Aceda às ferramentas para developers ou fale diretamente com a nossa equipa. A Sandbox pública está disponível; o Financial Live permanece indisponível nesta fase Beta.',
    'Access the developer tools or talk directly to our team. The public Sandbox is available; Financial Live remains unavailable during this Beta.',
  ),
  portal: L('Portal Developers', 'Portal Developers'),
  team: L('Falar com a equipa', 'Talk to the team'),
  betaBefore: L('Também quer experimentar a app? A ', 'Want to try the app too? The '),
  betaWeb: L('Beta Web', 'Beta Web'),
  betaMid: L(' está disponível no browser, com versões iPhone e Android ', ' is available in the browser, with iPhone and Android '),
  betaTesting: L('em testes', 'in testing'),
  betaAfter: L('.', '.'),
  legalStatus: L('Financial Live indisponível · Sandbox com dinheiro fictício', 'Financial Live unavailable · Sandbox with test money'),
  privacy: L('Privacidade', 'Privacy'),
  terms: L('Termos', 'Terms'),
  built: L('Construído sobre o BANZA.', 'Built on BANZA.'),
};

const MAILTO_PARTNER = 'mailto:contact@banzami.com?subject=Banzami%20%E2%80%94%20Parceria';

export function Footer({ lang }: { lang: Lang }) {
  return (
    <footer style={{ padding: '8px 24px 22px' }}>
      <div className="bz-footgrid" style={{ maxWidth: '1180px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.1fr 1.05fr', gap: '16px' }}>
        {/* Block 1 — institutional */}
        <div style={{ position: 'relative', overflow: 'hidden', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '26px', padding: '28px', boxShadow: '0 24px 56px -40px rgba(181,16,31,.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', fontWeight: 900, fontSize: '20px', color: '#141014' }}><BrandGlyph s={36} />Banzami</div>
          <p style={{ margin: '14px 0 0', fontSize: '15px', lineHeight: 1.35, fontWeight: 900, color: '#B5101F', whiteSpace: 'pre-line' }}>{T.tagline[lang]}</p>
          <p style={{ margin: '10px 0 18px', fontSize: '13.5px', lineHeight: 1.55, color: '#7a6a6e', fontWeight: 600, textWrap: 'pretty' }}>{T.desc[lang]}</p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
            {CHIPS.map((c, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: '#FFF1F0', border: '1px solid #F7E1DF', borderRadius: '30px', padding: '6px 13px', fontSize: '12.5px', fontWeight: 800, color: '#9A1B22' }}>
                <Ico name={c.icon} size={14} />{c.label[lang]}
              </span>
            ))}
          </div>
        </div>

        {/* Block 2 — Explore */}
        <div style={{ background: '#fff', border: '1px solid #F3E3E1', borderRadius: '26px', padding: '28px', boxShadow: '0 24px 56px -40px rgba(181,16,31,.4)' }}>
          <h3 style={{ margin: '0 0 18px', fontSize: '18px', fontWeight: 900, color: '#141014' }}>{T.explore[lang]}</h3>
          <div className="bz-explore" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px' }}>
            {EXPLORE.map((e, i) => (
              <a key={i} href={route(e.to.key, lang, e.to.hash ?? '')} className="bz-footlink" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '12px', background: '#FFF8F7', border: '1px solid #F7ECEA', textDecoration: 'none' }}>
                <span style={{ flex: 'none', width: '28px', height: '28px', borderRadius: '8px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico name={e.icon} size={15} /></span>
                <span style={{ flex: 1, fontSize: '13.5px', fontWeight: 800, color: '#2a2024' }}>{e.label[lang]}</span>
                <Arrow />
              </a>
            ))}
          </div>
        </div>

        {/* Block 3 — red CTA card */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '26px', padding: '28px', background: 'linear-gradient(150deg,#C8101F 0%,#9A1B22 55%,#6E0E14 100%)', color: '#fff', boxShadow: '0 30px 60px -30px rgba(122,16,22,.65)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', bottom: '-90px', right: '-70px', width: '260px', height: '260px', borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)' }} />
          <div aria-hidden="true" style={{ position: 'absolute', bottom: '-46px', right: '-26px', width: '170px', height: '170px', borderRadius: '50%', border: '1px solid rgba(255,255,255,.1)' }} />
          <p style={{ position: 'relative', margin: 0, fontSize: '11.5px', fontWeight: 900, letterSpacing: '.16em', color: 'rgba(255,255,255,.75)' }}>{T.kicker[lang]}</p>
          <h3 style={{ position: 'relative', margin: '8px 0 0', fontSize: '22px', fontWeight: 900, letterSpacing: '-.01em' }}>{T.redTitle[lang]}</h3>
          <p style={{ position: 'relative', margin: '12px 0 20px', fontSize: '13.5px', lineHeight: 1.55, color: 'rgba(255,255,255,.88)', fontWeight: 600, textWrap: 'pretty' }}>{T.redDesc[lang]}</p>
          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <a href={CONSOLE_URL} style={{ flex: 1, minWidth: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#fff', color: '#9A1B22', borderRadius: '12px', padding: '12px 16px', fontWeight: 800, fontSize: '13.5px', textDecoration: 'none', whiteSpace: 'nowrap' }}>{T.portal[lang]}<Arrow c="#9A1B22" /></a>
            <a href={MAILTO_PARTNER} style={{ flex: 1, minWidth: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.4)', color: '#fff', borderRadius: '12px', padding: '12px 16px', fontWeight: 800, fontSize: '13.5px', textDecoration: 'none', whiteSpace: 'nowrap' }}>{T.team[lang]}<Arrow c="#fff" /></a>
          </div>
          <p style={{ position: 'relative', margin: '16px 0 0', fontSize: '12.5px', lineHeight: 1.5, fontWeight: 600, color: 'rgba(255,255,255,.8)' }}>
            {T.betaBefore[lang]}<a href="https://app.banzami.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#fff', fontWeight: 900, textDecoration: 'none' }}>{T.betaWeb[lang]}</a>{T.betaMid[lang]}<a href={route('testes', lang)} style={{ color: '#fff', fontWeight: 900, textDecoration: 'none' }}>{T.betaTesting[lang]}</a>{T.betaAfter[lang]}
          </p>
        </div>
      </div>

      {/* Legal bar */}
      <div style={{ maxWidth: '1180px', margin: '14px auto 0', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '18px', padding: '14px 22px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700, color: '#7a6a6e' }}><Ico name="lock" size={15} stroke="#9a8a8e" />{T.legalStatus[lang]}</span>
        <span style={{ display: 'flex', gap: '18px', fontSize: '12.5px', fontWeight: 700, color: '#9a8a8e' }}>
          <a href={route('privacidade', lang)} style={{ color: '#9a8a8e', textDecoration: 'none' }}>{T.privacy[lang]}</a>
          <a href={route('termos', lang)} style={{ color: '#9a8a8e', textDecoration: 'none' }}>{T.terms[lang]}</a>
          <span>© 2026 Banzami</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 900, color: '#141014' }}>{T.built[lang]}<BrandGlyph s={30} /></span>
      </div>
    </footer>
  );
}
