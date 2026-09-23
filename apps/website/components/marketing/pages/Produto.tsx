import type { ReactNode } from 'react';
import { Reveal } from '@/components/Reveal';
import { LiveClock } from '@/components/site/LiveClock';
import { Badge, SectionLabel, H1, H2, HeroLead, Small, Lead, Btn, Row, SandboxNotice, Icon, type IconName } from '../kit';
import { Rotator } from '../Rotator';
import { route, type Lang, type Loc } from '@/lib/marketing/nav';

// /produto — the App Banzami page, ported verbatim from
// handoff_site_completo/pages/Produto.dc.html (PT) and "Produto EN.dc.html" (EN).
// Body only: the shared header/footer come from SiteShell (see app/produto/page.tsx).

const L = (pt: string, en: string): Loc => ({ pt, en });
const APP_URL = 'https://app.banzami.com/';
const mono = { fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: '#B5101F' } as const;

// ── phone status bar (dossier sbar) ─────────────────────────────────────────
function SBar({ dark, wifi }: { dark?: boolean; wifi?: boolean }) {
  const showWifi = wifi ?? !!dark;
  const c = dark ? '#fff' : '#141014';
  const last = dark ? 'rgba(255,255,255,.45)' : '#b3aeaf';
  const notch = dark ? 'rgba(255,255,255,.45)' : '#8a8586';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', fontSize: '10px', fontWeight: 700, color: c }}>
      <span><LiveClock kind="hm" /></span>
      <span style={{ width: '58px', height: '17px', borderRadius: '10px', background: '#0b0b0b' }} />
      <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <svg width="14" height="9" viewBox="0 0 14 9"><rect x="0" y="6" width="2.4" height="3" rx=".6" fill={c} /><rect x="3.8" y="4.2" width="2.4" height="4.8" rx=".6" fill={c} /><rect x="7.6" y="2.2" width="2.4" height="6.8" rx=".6" fill={c} /><rect x="11.4" y="0" width="2.4" height="9" rx=".6" fill={last} /></svg>
        {showWifi && (
          <svg width="12" height="9" viewBox="0 0 12 9"><path d="M6 8.6l1.9-2.1a2.7 2.7 0 0 0-3.8 0z" fill={c} /><path d="M2.6 5.1a4.9 4.9 0 0 1 6.8 0" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" /><path d="M.8 3.1a7.5 7.5 0 0 1 10.4 0" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" /></svg>
        )}
        <svg width="20" height="9" viewBox="0 0 20 9"><rect x=".6" y=".6" width="16.4" height="7.8" rx="2.2" fill="none" stroke={c} strokeWidth="1.1" /><rect x="2" y="2" width="13.6" height="5" rx="1.2" fill={c} />{showWifi && <rect x="18" y="3" width="1.4" height="3" rx=".6" fill={notch} />}</svg>
      </span>
    </div>
  );
}
const HomeInd = ({ c = '#bdb5b6' }: { c?: string }) => <span style={{ position: 'absolute', bottom: '6px', left: '50%', transform: 'translateX(-50%)', width: '76px', height: '4px', borderRadius: '3px', background: c }} />;

// blush blob behind phone clusters
const Blob = ({ inset }: { inset: string }) => <div aria-hidden="true" style={{ position: 'absolute', borderRadius: '46% 54% 40% 60% / 55% 40% 60% 45%', background: 'radial-gradient(circle at 55% 45%,#FFD9D7 0%,#FFE8E6 50%,rgba(255,240,239,0) 75%)', pointerEvents: 'none', inset }} />;

// ── rotating highlight list (dossier data-rot="list") ───────────────────────
function RotList({ items }: { items: { icon: ReactNode; t: string; d: string }[] }) {
  return (
    <Rotator mode="list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '26px', maxWidth: '440px' }}>
      {items.map((it, i) => (
        <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', display: 'flex', gap: '14px', alignItems: 'center', padding: '13px 16px 13px 13px', borderRadius: '18px', border: '1px solid transparent', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
          <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}>{it.icon}</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#141014' }}>{it.t}</p>
            <p style={{ margin: '3px 0 0', fontSize: '13px', lineHeight: 1.45, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{it.d}</p>
          </div>
          <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', opacity: 0, transition: 'opacity .6s' }}><span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} /></span>
        </div>
      ))}
    </Rotator>
  );
}
const ricon = (name: IconName) => <Icon name={name} color="currentColor" size={19} />;
const searchIcon = (
  <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
);

const phoneShell = (w: number, h: number): React.CSSProperties => ({ position: 'relative', flex: 'none', width: `${w}px`, height: `${h}px`, borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)' });

// ═══════════════════ PHONES ═══════════════════
function PhoneScan({ lang, transform, z = 1 }: { lang: Lang; transform: string; z?: number }) {
  return (
    <div aria-hidden="true" style={{ ...phoneShell(228, 512), transform, zIndex: z }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#0b0b0d', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBar dark />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 6px 0' }}>
          <span style={{ width: '26px', height: '26px', borderRadius: '9px', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></span>
          <span style={{ width: '26px', height: '26px', borderRadius: '9px', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg></span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '148px', height: '148px', borderRadius: '20px', border: '2px solid #E0303A', boxShadow: '0 0 30px -4px rgba(224,48,58,.65),inset 0 0 20px -6px rgba(224,48,58,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/qr-banzami.png" alt="QR Banzami" style={{ width: '118px', height: 'auto', display: 'block', borderRadius: '12px' }} />
            <span style={{ position: 'absolute', left: '10px', right: '10px', height: '2px', borderRadius: '2px', background: '#FF3B45', boxShadow: '0 0 12px 2px rgba(255,59,69,.7)', animation: 'bzScanline 2.2s ease-in-out infinite alternate' }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '22px' }}><span style={{ padding: '9px 16px', borderRadius: '20px', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: '10px', fontWeight: 700 }}>{L('Aponte para o código QR', 'Point at the QR code')[lang]}</span></div>
        <HomeInd c="rgba(255,255,255,.4)" />
      </div>
    </div>
  );
}

function PhoneHome({ lang }: { lang: Lang }) {
  const Recent = ({ ini, name, meta, amount, color }: { ini: string; name: string; meta: string; amount: string; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid #F1E6E4' }}>
      <span style={{ flex: 'none', width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg,#C8101F,#E0303A 45%,#8E1620)', color: '#fff', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ini}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#1d1a1b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: '7.5px', color: '#9a8487' }}>{meta}</div>
      </div>
      <span style={{ fontSize: '9.5px', fontWeight: 800, color, whiteSpace: 'nowrap' }}>{amount}</span>
    </div>
  );
  const Action = ({ name, label }: { name: IconName; label: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
      <span style={{ width: '38px', height: '38px', borderRadius: '13px', background: '#fff', border: '1px solid #F1E6E4', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px -10px rgba(122,16,22,.4)' }}><Icon name={name} color="#B5101F" size={16} /></span>
      <span style={{ fontSize: '8.5px', fontWeight: 700, color: '#1d1a1b' }}>{label}</span>
    </div>
  );
  return (
    <div aria-hidden="true" style={{ ...phoneShell(228, 512), zIndex: 2 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#FBF6F5', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 8px 0' }}>
          <div>
            <div style={{ fontSize: '9px', color: '#9a8487' }}>{L('Olá,', 'Hi,')[lang]}</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#1d1a1b' }}>Ana Maria</div>
          </div>
          <span style={{ flex: 'none', width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg,#C8101F,#E0303A 45%,#8E1620)', color: '#fff', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</span>
        </div>
        <div style={{ margin: '12px 4px 0', padding: '14px', borderRadius: '18px', background: 'linear-gradient(150deg,#C8101F,#8E1620)', color: '#fff', boxShadow: '0 14px 26px -12px rgba(181,16,31,.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '8.5px', color: 'rgba(255,255,255,.75)' }}>{L('Saldo disponível', 'Available balance')[lang]}</span>
            <span style={{ padding: '2px 7px', borderRadius: '10px', background: '#FCEFC4', color: '#7A4A06', fontSize: '6.5px', fontWeight: 800 }}>SANDBOX</span>
          </div>
          <div style={{ marginTop: '6px', fontSize: '24px', fontWeight: 900, letterSpacing: '-.03em' }}>47 900 Kz</div>
          <div style={{ marginTop: '2px', fontSize: '9px', color: 'rgba(255,255,255,.8)' }}>@ana</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px', margin: '16px 6px 0' }}>
          <Action name="qr" label={L('Pagar', 'Pay')[lang]} />
          <Action name="send" label={L('Enviar', 'Send')[lang]} />
          <Action name="down" label={L('Receber', 'Receive')[lang]} />
        </div>
        <div style={{ margin: '16px 8px 0', fontSize: '10px', fontWeight: 800, color: '#1d1a1b' }}>{L('Recentes', 'Recent')[lang]}</div>
        <div style={{ margin: '4px 8px 0' }}>
          <Recent ini="C" name={L('Cantina do Alex', 'Alex’s Canteen')[lang]} meta={L('Hoje, 12:40 · QR', 'Today, 12:40 · QR')[lang]} amount={'−1 500 Kz'} color="#1d1a1b" />
          <Recent ini="M" name="@maria" meta={L('Hoje, 09:12', 'Today, 09:12')[lang]} amount="+3 000 Kz" color="#1E8E4E" />
          <Recent ini="P" name={L('Padaria Luanda', 'Luanda Bakery')[lang]} meta={L('Ontem · QR', 'Yesterday · QR')[lang]} amount={'−850 Kz'} color="#1d1a1b" />
        </div>
        <HomeInd />
      </div>
    </div>
  );
}

function PhoneEnviar({ lang }: { lang: Lang }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  return (
    <div aria-hidden="true" style={{ ...phoneShell(228, 468), zIndex: 2 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#FBF6F5', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBar />
        <div style={{ padding: '12px 8px 0' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1d1a1b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          <div style={{ marginTop: '8px', fontSize: '17px', fontWeight: 800, letterSpacing: '-.02em', color: '#1d1a1b' }}>{L('Enviar', 'Send')[lang]}</div>
        </div>
        <div style={{ margin: '12px 8px 0', padding: '9px 10px', borderRadius: '14px', background: '#fff', border: '1px solid #F1E6E4', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ flex: 'none', width: '26px', height: '26px', borderRadius: '50%', background: 'linear-gradient(135deg,#C8101F,#E0303A 45%,#8E1620)', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>M</span>
          <div>
            <div style={{ fontSize: '7.5px', color: '#9a8487' }}>{L('Para', 'To')[lang]}</div>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1d1a1b' }}>@maria</div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '7.5px', fontWeight: 800, color: '#1E8E4E' }}>{L('✓ Verificado', '✓ Verified')[lang]}</span>
        </div>
        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '30px', fontWeight: 900, letterSpacing: '-.03em', color: '#B5101F' }}>1 500 Kz</div>
          <span style={{ display: 'inline-block', marginTop: '6px', padding: '3px 10px', borderRadius: '10px', background: '#FFF1F0', fontSize: '9px', fontStyle: 'italic', color: '#9A1B22' }}>vaquinha</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', margin: '12px 14px 0' }}>
          {keys.map((k, i) => <span key={i} style={{ padding: '6px 0', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: '#1d1a1b' }}>{k}</span>)}
        </div>
        <div style={{ margin: 'auto 8px 18px', padding: '10px', borderRadius: '14px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '11px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>{L('Continuar', 'Continue')[lang]}</div>
        <HomeInd />
      </div>
    </div>
  );
}

function PhoneReceberQR({ lang }: { lang: Lang }) {
  return (
    <div aria-hidden="true" style={{ ...phoneShell(228, 468), zIndex: 2 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#FBF6F5', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBar />
        <div style={{ padding: '12px 8px 0' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1d1a1b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          <div style={{ marginTop: '8px', fontSize: '17px', fontWeight: 800, letterSpacing: '-.02em', color: '#1d1a1b' }}>{L('Receber', 'Receive')[lang]}</div>
        </div>
        <div style={{ margin: '14px 6px 0', padding: '14px 10px', borderRadius: '18px', background: '#fff', boxShadow: '0 10px 24px -14px rgba(122,16,22,.3)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/qr-banzami.png" alt="" style={{ width: '128px', height: 'auto', display: 'block', borderRadius: '10px' }} />
          <div style={{ marginTop: '10px', fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', fontWeight: 600, color: '#B5101F' }}>@ana</div>
          <div style={{ fontSize: '9px', color: '#9a8487' }}>Ana Maria</div>
        </div>
        <div style={{ margin: '10px auto 0', padding: '4px 10px', borderRadius: '10px', background: '#FFF1F0', fontSize: '8.5px', fontWeight: 700, color: '#9A1B22' }}>{L('Valor opcional', 'Optional amount')[lang]}</div>
        <div style={{ margin: 'auto 8px 0', padding: '10px', borderRadius: '14px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '11px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>{L('Partilhar QR', 'Share QR')[lang]}</div>
        <div style={{ margin: '8px 8px 18px', padding: '9px', borderRadius: '14px', border: '1.2px solid #B5101F', color: '#B5101F', fontSize: '10.5px', fontWeight: 800, textAlign: 'center' }}>{L('Copiar @banza', 'Copy @banza')[lang]}</div>
        <HomeInd />
      </div>
    </div>
  );
}

function PhoneRecebido({ lang }: { lang: Lang }) {
  return (
    <div aria-hidden="true" style={{ ...phoneShell(228, 468), transform: 'rotate(5deg) translateY(24px)', zIndex: 1 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#fff', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBar wifi />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: '40px', background: 'radial-gradient(circle at 50% 38%,rgba(255,220,220,.55) 0%,rgba(255,255,255,0) 45%)' }}>
          <div style={{ fontSize: '7.5px', fontWeight: 800, letterSpacing: '.3em', color: '#9A1B22' }}>BANZAMI</div>
          <div style={{ marginTop: '8px', width: '74px', height: '74px', borderRadius: '50%', background: 'rgba(229,52,62,.85)', boxShadow: '0 0 26px 6px rgba(229,52,62,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '62px', height: '62px', borderRadius: '50%', border: '1.5px dashed rgba(255,255,255,.85)', animation: 'bzspinccw 9s linear infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', animation: 'bzspin 9s linear infinite', background: 'radial-gradient(circle at 40% 35%,#E0303A,#9A1B22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '14px', fontSize: '13px', fontWeight: 700, color: '#1d1a1b' }}>{L('Pagamento recebido', 'Payment received')[lang]}</div>
          <div style={{ marginTop: '4px', fontSize: '30px', fontWeight: 900, letterSpacing: '-.03em', color: '#B5101F' }}>1 500 Kz</div>
          <div style={{ marginTop: '2px', fontSize: '11px', color: '#5a4a4e' }}>{L('de @maria', 'from @maria')[lang]}</div>
          <div style={{ marginTop: '4px', fontSize: '10px', fontStyle: 'italic', color: '#9a8487' }}>{L('"Saldo de dados"', '"Data top-up"')[lang]}</div>
          <div style={{ marginTop: '6px', fontSize: '9.5px', color: '#9a8487' }}>{L('O valor já entrou na sua carteira.', 'The money is already in your wallet.')[lang]}</div>
        </div>
        <div style={{ margin: '0 14px 22px', padding: '11px', borderRadius: '14px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '11px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>{L('Concluir', 'Done')[lang]}</div>
        <HomeInd />
      </div>
    </div>
  );
}

function PhoneComprovativo({ lang }: { lang: Lang }) {
  const RRow = ({ k, v, last }: { k: string; v: ReactNode; last?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '3.5px 0', borderBottom: last ? undefined : '1px solid rgba(255,255,255,.12)' }}>
      <span style={{ color: 'rgba(255,255,255,.7)' }}>{k}</span>
      <span style={{ fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
    </div>
  );
  return (
    <div aria-hidden="true" style={{ ...phoneShell(228, 512), transform: 'rotate(3deg)', zIndex: 1 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: 'linear-gradient(180deg,#C51A2A 0%,#9A0A18 45%,#65050E 100%)', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
        <SBar dark />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 6px 0' }}>
          <svg style={{ position: 'absolute', left: '8px' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,.9)' }}>{L('Comprovativo', 'Receipt')[lang]}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ marginTop: '4px', fontSize: '6.5px', fontWeight: 800, letterSpacing: '.3em', color: '#fff' }}>BANZAMI</div>
          <div style={{ position: 'relative', marginTop: '3px', width: '46px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.3px dashed rgba(255,255,255,.7)', animation: 'bzspin 9s linear infinite' }} />
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#C0202C,#6E0610)', boxShadow: '0 0 0 4px rgba(255,255,255,.08),0 6px 14px -4px rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </div>
          </div>
          <div style={{ marginTop: '6px', fontSize: '10.5px', fontWeight: 700, color: 'rgba(255,255,255,.9)' }}>{L('Enviado com sucesso', 'Sent successfully')[lang]}</div>
          <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-.02em', color: '#fff', lineHeight: 1.2 }}>1 500 Kz</div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,.7)' }}>{L('para @maria', 'to @maria')[lang]}</div>
          <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '10px', background: '#FCEFC4', border: '1px solid #E9C66A', fontSize: '7.5px', fontWeight: 800, color: '#7A4A06' }}>{L('SANDBOX • Dinheiro de teste', 'SANDBOX • Test money')[lang]}</div>
        </div>
        <div style={{ margin: '7px 4px 0', padding: '2px 9px', borderRadius: '12px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', fontSize: '8px' }}>
          <RRow k={L('De', 'From')[lang]} v="@ana" />
          <RRow k={L('Para', 'To')[lang]} v="@maria" />
          <RRow k={L('Descrição', 'Description')[lang]} v="vaquinha" />
          <RRow k={L('Data', 'Date')[lang]} v={<LiveClock kind="date" />} />
          <RRow k={L('Operação', 'Operation')[lang]} v="@banza" />
          <RRow k={L('Fonte', 'Source')[lang]} v={L('Saldo Banzami', 'Banzami balance')[lang]} />
          <RRow k={L('Referência', 'Reference')[lang]} v="BZM-3HNA-GZST-…" last />
        </div>
        <div style={{ margin: '6px 4px 0', padding: '7px', borderRadius: '12px', background: '#fff', color: '#B5101F', fontSize: '10.5px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.8" /></svg>{L('Concluído', 'Done')[lang]}
        </div>
        <div style={{ margin: '5px 4px 0', padding: '7px', borderRadius: '12px', background: 'rgba(0,0,0,.14)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontSize: '9.5px', fontWeight: 700, textAlign: 'center' }}>{L('Partilhar comprovativo', 'Share receipt')[lang]}</div>
        <HomeInd c="rgba(0,0,0,.35)" />
      </div>
    </div>
  );
}

// ═══════════════════ 00 · HERO ═══════════════════
function HeroProduto({ lang }: { lang: Lang }) {
  const plats = [
    { href: APP_URL, ext: true, icon: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 3.8 5.8 3.8 9s-1.2 6.2-3.8 9c-2.6-2.8-3.8-5.8-3.8-9S9.4 5.8 12 3z" /></svg>, t: L('Beta Web', 'Beta Web')[lang], s: L('No browser', 'In your browser')[lang] },
    { href: route('testes', lang), ext: false, icon: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.88 2.65 3.22 2.6 1.29-.05 1.78-.83 3.34-.83 1.55 0 2 .83 3.37.81 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.39-2.85 1.41-2.92-.03-.01-2.7-1.04-2.73-4.11z" /><path d="M14.69 4.86c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z" /></svg>, t: 'iPhone', s: 'TestFlight' },
    { href: route('testes', lang), ext: false, icon: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M6 9.5h12v7.5a1.5 1.5 0 0 1-1.5 1.5H15v2.5a1.25 1.25 0 0 1-2.5 0V18.5h-1v2.5a1.25 1.25 0 0 1-2.5 0V18.5H7.5A1.5 1.5 0 0 1 6 17zM3.5 10a1.25 1.25 0 0 1 2.5 0v5a1.25 1.25 0 0 1-2.5 0zM18 10a1.25 1.25 0 0 1 2.5 0v5a1.25 1.25 0 0 1-2.5 0zM6 8.6a6 6 0 0 1 12 0z" /><circle cx="9.6" cy="6.8" r=".8" fill="#1a1416" /><circle cx="14.4" cy="6.8" r=".8" fill="#1a1416" /></svg>, t: 'Android', s: L('Em testes', 'In testing')[lang] },
  ];
  return (
    <section id="inicio" style={{ position: 'relative', padding: '112px 24px 64px', overflow: 'hidden', background: '#fff', borderRadius: '0 0 48px 48px', boxShadow: '0 40px 80px -60px rgba(122,16,22,.45)' }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div className="bz-herobg" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/hero-bg-red.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
        </div>
      </div>

      <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '48px', alignItems: 'center' }}>
        <Reveal>
          <Badge>{L('Versão Beta · Sandbox', 'Beta · Sandbox')[lang]}</Badge>
          <H1 a={L('Uma app para pagar', 'One app to pay')[lang]} b={L('em Kwanza.', 'in Kwanza.')[lang]} />
          <HeroLead>{lang === 'en'
            ? <>Pay by QR, send to a <span style={mono}>@banza</span> and get paid in seconds. Every payment comes with a verifiable receipt.</>
            : <>Pague por QR, envie para um <span style={mono}>@banza</span> e receba em segundos. Cada pagamento tem um comprovativo verificável.</>}</HeroLead>
          <Small mw={540}>{L('Beta público em Sandbox, com dinheiro fictício. O Financial Live permanece indisponível.', 'Public Beta in the Sandbox, with test money. Financial Live remains unavailable.')[lang]}</Small>
          <Row mt={26} gap={12}>
            <Btn href={APP_URL} kind="red" external>{L('Abrir Beta Web', 'Open Beta Web')[lang]}</Btn>
            <Btn href={route('produto', lang, '#pagar')} kind="ghost">{L('Ver como funciona', 'See how it works')[lang]}</Btn>
          </Row>
          <div className="bz-plat" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '10px', marginTop: '22px', maxWidth: '590px' }}>
            {plats.map((p, i) => (
              <a key={i} href={p.href} {...(p.ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="bz-btnlift" style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '12px 16px', borderRadius: '14px', background: 'linear-gradient(160deg,#241c1e,#120e0f)', border: '1px solid rgba(255,255,255,.06)', textDecoration: 'none', boxShadow: '0 16px 30px -18px rgba(20,16,20,.7)' }}>
                <span style={{ display: 'flex' }}>{p.icon}</span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}><span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>{p.t}</span><span style={{ fontSize: '11.5px', fontWeight: 600, color: 'rgba(255,255,255,.55)' }}>{p.s}</span></span>
              </a>
            ))}
          </div>
        </Reveal>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '600px' }}>
          <div style={{ position: 'relative', filter: 'drop-shadow(0 50px 60px rgba(60,0,8,.35))' }}>
            <div className="bz-phones" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PhoneScan lang={lang} transform="rotate(-6deg) translate(40px,26px)" />
              <PhoneHome lang={lang} />
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="bz-note" style={{ position: 'absolute', fontFamily: "'Caveat',cursive", fontWeight: 600, lineHeight: 1.05, pointerEvents: 'none', right: 'max(18px,calc(50% - 700px))', top: '330px', color: '#fff', fontSize: '28px', transform: 'rotate(-12deg)', whiteSpace: 'pre-line' }}>{L('Pagar ficou\nmais simples.', 'Paying just got\nsimpler.')[lang]}</div>
    </section>
  );
}

// ═══════════════════ 01 · PAGAR E ENVIAR ═══════════════════
function PagarSection({ lang }: { lang: Lang }) {
  return (
    <section id="pagar" style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
      <Reveal>
        <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: '56px', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <SectionLabel n="01" label={lang === 'en' ? 'PAY AND SEND' : 'PAGAR E ENVIAR'} panel />
              <H2 a={L('Pague por QR', 'Pay by QR')[lang]} b={L('ou para um @banza.', 'or to a @banza.')[lang]} />
              <Lead>{L('Leia o QR da loja ou escreva o @banza de quem vai receber. Confirme e está feito.', 'Scan the shop’s QR or type the @banza of who you are paying. Confirm and you are done.')[lang]}</Lead>
              <RotList items={[
                { icon: ricon('qr'), t: L('Ler o QR', 'Scan the QR')[lang], d: L('Aponte a câmara ao QR da loja ou de outra pessoa.', 'Point the camera at the QR of a shop or another person.')[lang] },
                { icon: ricon('at'), t: L('Enviar para um @banza', 'Send to a @banza')[lang], d: L('Sem IBAN nem número de conta, apenas o nome.', 'No IBAN or account number, just the name.')[lang] },
                { icon: ricon('check'), t: L('Confirmar antes de pagar', 'Confirm before you pay')[lang], d: L('Veja o valor e o destinatário antes de confirmar.', 'Check the amount and recipient before confirming.')[lang] },
              ]} />
            </div>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <Blob inset="4% -6% 4% 4%" />
              <div className="bz-phones" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PhoneScan lang={lang} transform="rotate(-5deg) translate(24px,20px)" />
                <PhoneEnviar lang={lang} />
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ═══════════════════ 02 · RECEBER ═══════════════════
function ReceberSection({ lang }: { lang: Lang }) {
  return (
    <section id="receber" style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', overflow: 'hidden' }}>
      <Reveal>
        <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: '56px', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <SectionLabel n="02" label={lang === 'en' ? 'RECEIVE' : 'RECEBER'} />
              <H2 a={L('Receba por QR', 'Get paid by QR')[lang]} b={L('e @banza.', 'and @banza.')[lang]} />
              <Lead>{L('Mostre o seu QR ou partilhe o seu @banza. O valor entra na sua carteira em segundos.', 'Show your QR or share your @banza. The money lands in your wallet in seconds.')[lang]}</Lead>
              <RotList items={[
                { icon: ricon('qr'), t: L('O seu QR pessoal', 'Your personal QR')[lang], d: L('Mostre no telemóvel ou imprima.', 'Show it on your phone or print it.')[lang] },
                { icon: ricon('at'), t: L('O seu @banza', 'Your @banza')[lang], d: L('Um nome único para receber de qualquer pessoa.', 'A unique name to get paid by anyone.')[lang] },
                { icon: ricon('bolt'), t: L('Em segundos', 'In seconds')[lang], d: L('É notificado assim que o valor entra.', 'You are notified as soon as the money arrives.')[lang] },
              ]} />
            </div>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <Blob inset="2% 4% 2% -6%" />
              <div className="bz-phones" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PhoneReceberQR lang={lang} />
                <div style={{ marginLeft: '-26px' }}><PhoneRecebido lang={lang} /></div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ═══════════════════ 03 · COMPROVATIVOS ═══════════════════
function ComprovativosSection({ lang }: { lang: Lang }) {
  return (
    <section id="comprovativos" style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
      <Reveal>
        <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: '56px', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <SectionLabel n="03" label={lang === 'en' ? 'RECEIPTS' : 'COMPROVATIVOS'} panel />
              <H2 a={L('Um comprovativo', 'A receipt')[lang]} b={L('que se verifica.', 'that can be verified.')[lang]} />
              <Lead>{L('Cada pagamento gera um comprovativo com referência única. Qualquer pessoa pode confirmar que é verdadeiro.', 'Every payment creates a receipt with a unique reference. Anyone can confirm it is genuine.')[lang]}</Lead>
              <RotList items={[
                { icon: ricon('receipt'), t: L('Referência única', 'Unique reference')[lang], d: L('Cada comprovativo tem um código BZM-.', 'Every receipt has a BZM- code.')[lang] },
                { icon: searchIcon, t: L('Verificável por qualquer pessoa', 'Verifiable by anyone')[lang], d: L('Confirme a referência em Verificar comprovativo.', 'Check the reference in Verify a receipt.')[lang] },
                { icon: ricon('send'), t: L('Partilhar em segundos', 'Share in seconds')[lang], d: L('Envie por mensagem ou guarde em PDF.', 'Send it by message or save it as a PDF.')[lang] },
              ]} />
              <Row mt={28} gap={14}>
                <Btn href={route('verificar', lang)} kind="dark">{L('Verificar um comprovativo', 'Verify a receipt')[lang]}</Btn>
              </Row>
            </div>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <Blob inset="4% -6% 4% 6%" />
              <div className="bz-phones" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <PhoneComprovativo lang={lang} />
                  <div aria-hidden="true" className="bz-float" style={{ position: 'absolute', zIndex: 3, left: '-40px', bottom: '-6px', width: '220px', padding: '14px 16px', borderRadius: '18px', background: '#fff', boxShadow: '0 26px 50px -20px rgba(122,16,22,.45)', animation: 'floaty 6s ease-in-out infinite' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#1E8E4E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#141014' }}>{L('Comprovativo válido', 'Valid receipt')[lang]}</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', color: '#9a8487' }}>BZM-7Q4K-2M9A</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ═══════════════════ ESTADO SANDBOX ═══════════════════
function EstadoSandbox({ lang }: { lang: Lang }) {
  return (
    <section style={{ position: 'relative', padding: 'clamp(40px,5vw,72px) 24px clamp(56px,7vw,96px)', overflow: 'hidden' }}>
      <Reveal>
        <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <SandboxNotice
            title={L('Está a usar a Sandbox', 'You are using the Sandbox')[lang]}
            cta={<Btn href={APP_URL} kind="red" external>{L('Abrir Beta Web', 'Open Beta Web')[lang]}</Btn>}
          >
            {L('No Beta público, todos os saldos e pagamentos usam dinheiro fictício. O Financial Live permanece indisponível, sujeito às aprovações aplicáveis.', 'In the public Beta, all balances and payments use test money. Financial Live remains unavailable, subject to the applicable approvals.')[lang]}
          </SandboxNotice>
        </div>
      </Reveal>
    </section>
  );
}

// ═══════════════════ PAGE ═══════════════════
export function ProdutoPage({ lang }: { lang: Lang }) {
  return (
    <>
      <HeroProduto lang={lang} />
      <PagarSection lang={lang} />
      <ReceberSection lang={lang} />
      <ComprovativosSection lang={lang} />
      <EstadoSandbox lang={lang} />
    </>
  );
}
