import type { CSSProperties } from 'react';
import { Badge, SectionLabel, H1, H2, Lead, HeroLead, RedCard, Btn, Icon, type IconName } from '../kit';
import { Rotator } from '../Rotator';
import { Reveal } from '@/components/Reveal';
import { route, type Lang, type Loc } from '@/lib/marketing/nav';

/**
 * Sobre — ported verbatim from handoff_site_completo/pages/Sobre.dc.html
 * (PT) and Sobre EN.dc.html (EN). Body only; header/footer come from
 * <SiteShell>. Anchors: #missao, #banza, #fundador.
 */

const L = (pt: string, en: string): Loc => ({ pt, en });
const APP_URL = 'https://app.banzami.com/';

// ── shared bits (exact dossier markup) ──────────────────────────────────────
const CONTENT: CSSProperties = { position: 'relative', maxWidth: '1140px', margin: '0 auto' };

function Check({ color }: { color: string }) {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  );
}
function ExtArrow() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
  );
}

// ═══════════════════ data ═══════════════════
const MISSAO_ITEMS: { icon: IconName; t: Loc; d: Loc }[] = [
  { icon: 'qr', t: L('Em Kwanza, de carteira para carteira', 'In Kwanza, wallet to wallet'), d: L('Sem cartões e sem dinheiro físico.', 'No cards and no cash.') },
  { icon: 'receipt', t: L('Comprovativos verificáveis', 'Verifiable receipts'), d: L('Confiança que qualquer pessoa pode confirmar.', 'Trust anyone can confirm.') },
  { icon: 'info', t: L('Honestidade sobre o estado', 'Honesty about our status'), d: L('Só afirmamos o que já existe. Hoje: Beta público em Sandbox.', 'We only claim what already exists. Today: public Beta in the Sandbox.') },
];

const BANZA_PROTOCOL: Loc[] = [
  L('Como se identificam carteiras', 'How wallets are identified'),
  L('Como se descreve um pagamento', 'How a payment is described'),
  L('Como se verifica um comprovativo', 'How a receipt is verified'),
];
const BANZA_OPERATOR: Loc[] = [
  L('A app Banzami', 'The Banzami app'),
  L('Banzami Business', 'Banzami Business'),
  L('API, SDK e webhooks', 'API, SDK and webhooks'),
];

const FOUNDERS: { img: string; alt: string; name: string; role: Loc; bio: Loc; linkHref: string; linkLabel: string }[] = [
  {
    img: '/assets/founder-fidel-v4.png',
    alt: 'Fidel Monteiro',
    name: 'Fidel Monteiro',
    role: L('Cofundador do Banzami', 'Co-founder of Banzami'),
    bio: L(
      'Engenheiro de desenvolvimento em IA e software, com mais de 7 anos de experiência em IA e MLOps, arquitetura de software, visão computacional e sistemas embebidos — na STMicroelectronics, Hyperion Seven, SuperGrid Institute e Akkodis. Criou o Banzami e o protocolo aberto BANZA.',
      'AI and software development engineer with 7+ years of experience in AI and MLOps, software architecture, computer vision and embedded systems — at STMicroelectronics, Hyperion Seven, SuperGrid Institute and Akkodis. He created Banzami and the open BANZA protocol.',
    ),
    linkHref: 'https://www.fidelmonteiro.com',
    linkLabel: 'fidelmonteiro.com',
  },
  {
    img: '/assets/founder-jesus-cut.png',
    alt: 'Jesus Monteiro',
    name: 'Jesus Monteiro',
    role: L('Cofundador do Banzami', 'Co-founder of Banzami'),
    bio: L(
      'Engenheiro e investigador em energia eólica. Doutorado em Engenharia Mecânica pela FEUP (Universidade do Porto), com mestrado em Engenharia Eletromecânica pela Universidade da Beira Interior. Engenheiro de projeto na ENERCON, especialista em escoamento atmosférico, CFD/RANS e avaliação de recurso eólico.',
      'Wind energy engineer and researcher. PhD in Mechanical Engineering from FEUP (University of Porto), with an MSc in Electromechanical Engineering from the University of Beira Interior. Site project engineer at ENERCON, specialising in atmospheric flow, CFD/RANS and wind resource assessment.',
    ),
    linkHref: 'https://www.linkedin.com/in/jesus-monteiro',
    linkLabel: 'LinkedIn',
  },
];

const ESTADO_ITEMS: { icon: IconName; tag: Loc; t: Loc; d: Loc }[] = [
  { icon: 'sparkle', tag: L('DISPONÍVEL', 'AVAILABLE'), t: L('Beta público', 'Public Beta'), d: L('Sandbox disponível, com dinheiro fictício, na Beta Web e em testes no iPhone e Android.', 'Sandbox available, with test money, on Beta Web and in testing on iPhone and Android.') },
  { icon: 'shield', tag: L('INDISPONÍVEL', 'UNAVAILABLE'), t: L('Financial Live', 'Financial Live'), d: L('Indisponível nesta fase, sujeito às aprovações aplicáveis.', 'Unavailable in this phase, subject to the applicable approvals.') },
  { icon: 'layers', tag: L('ABERTO', 'OPEN'), t: L('Protocolo BANZA', 'BANZA protocol'), d: L('Aberto. O Banzami é o operador de referência.', 'Open. Banzami is the reference operator.') },
];

const barBg: CSSProperties = { position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', opacity: 0, transition: 'opacity .6s' };

// ═══════════════════ page ═══════════════════
export function SobrePage({ lang }: { lang: Lang }) {
  return (
    <>
      {/* ─────────── 00 · HERO (#inicio) ─────────── */}
      <section id="inicio" style={{ position: 'relative', padding: '128px 24px 56px', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-8%', top: '-20%', width: '640px', height: '640px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,210,208,.75),rgba(251,210,208,0) 68%)' }} />
          <div style={{ position: 'absolute', left: '-12%', bottom: '-40%', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,228,226,.8),rgba(255,228,226,0) 70%)' }} />
        </div>

        <div style={CONTENT}>
          <Reveal>
            <Badge>{lang === 'en' ? 'About Banzami' : 'Sobre o Banzami'}</Badge>
            <H1
              a={lang === 'en' ? 'Modernising payments' : 'Modernizar os pagamentos'}
              b={lang === 'en' ? 'in Angola.' : 'em Angola.'}
              size="clamp(38px,4.8vw,64px)"
            />
            <HeroLead mw={600}>
              {lang === 'en'
                ? 'Banzami is the startup building a wallet-native payment network for Angola, on the open BANZA protocol.'
                : 'O Banzami é a startup que está a construir uma rede de pagamentos nativa de carteira para Angola, sobre o protocolo aberto BANZA.'}
            </HeroLead>
          </Reveal>
        </div>
      </section>

      {/* ─────────── 01 · MISSÃO (#missao) ─────────── */}
      <section id="missao" style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: '56px', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <SectionLabel n="01" label={lang === 'en' ? 'MISSION' : 'MISSÃO'} panel />
              <H2 a={lang === 'en' ? 'Paying in Kwanza' : 'Pagar em Kwanza'} b={lang === 'en' ? 'should be simple.' : 'deve ser simples.'} />
              <Lead mw={440}>
                {lang === 'en'
                  ? 'We want anyone, person or business, in Angola to pay and get paid in seconds, with a receipt everyone can trust.'
                  : 'Queremos que qualquer pessoa ou negócio em Angola possa pagar e receber em segundos, com um comprovativo em que todos podem confiar.'}
              </Lead>
            </div>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <Rotator mode="list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {MISSAO_ITEMS.map((it, i) => (
                  <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', display: 'flex', gap: '14px', alignItems: 'center', padding: '13px 16px 13px 13px', borderRadius: '18px', border: '1px solid transparent', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                    <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}><Icon name={it.icon} color="currentColor" size={19} /></span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#141014' }}>{it.t[lang]}</p>
                      <p style={{ margin: '3px 0 0', fontSize: '13px', lineHeight: 1.45, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{it.d[lang]}</p>
                    </div>
                    <span data-ri-bar style={barBg}><span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} /></span>
                  </div>
                ))}
              </Rotator>
            </div>
          </div>
          </div>
        </Reveal>
      </section>

      {/* ─────────── 02 · BANZA E BANZAMI (#banza) ─────────── */}
      <section id="banza" style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,.9fr)', gap: '20px 56px', alignItems: 'end' }}>
            <div>
              <SectionLabel n="02" label={lang === 'en' ? 'BANZA AND BANZAMI' : 'BANZA E BANZAMI'} />
              <H2 a={lang === 'en' ? 'BANZA is the protocol.' : 'BANZA é o protocolo.'} b={lang === 'en' ? 'Banzami is how Angola pays.' : 'Banzami é como Angola paga.'} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '480px', textWrap: 'pretty' }}>
              {lang === 'en'
                ? 'We separate the rules from the operator. The protocol is open; Banzami is the reference operator that makes it work.'
                : 'Separamos as regras do operador. O protocolo é aberto; o Banzami é o operador de referência que o põe a funcionar.'}
            </p>
          </div>
          <div className="bz-g2s" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginTop: '44px' }}>
            {/* dark — open protocol */}
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '26px', padding: '28px', background: 'linear-gradient(160deg,#2a2023,#140f10)', color: '#fff', border: '1px solid rgba(255,255,255,.06)', boxShadow: '0 30px 60px -34px rgba(60,10,14,.7)' }}>
              <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '.14em', color: 'rgba(255,255,255,.65)' }}>{lang === 'en' ? 'OPEN PROTOCOL' : 'PROTOCOLO ABERTO'}</p>
              <p style={{ margin: '10px 0 0', fontSize: '30px', fontWeight: 900, letterSpacing: '-.03em' }}>BANZA</p>
              <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,.85)' }}>{lang === 'en' ? 'Defines the rules.' : 'Define as regras.'}</p>
              <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {BANZA_PROTOCOL.map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,.88)' }}><Check color="#FF7A7A" />{row[lang]}</div>
                ))}
              </div>
            </div>
            {/* red — reference operator */}
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '26px', padding: '28px', background: 'linear-gradient(150deg,#C8101F,#9A1B22 55%,#6E0E14)', color: '#fff', boxShadow: '0 30px 60px -34px rgba(60,10,14,.7)' }}>
              <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '.14em', color: 'rgba(255,255,255,.65)' }}>{lang === 'en' ? 'REFERENCE OPERATOR' : 'OPERADOR DE REFERÊNCIA'}</p>
              <p style={{ margin: '10px 0 0', fontSize: '30px', fontWeight: 900, letterSpacing: '-.03em' }}>Banzami</p>
              <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,.85)' }}>{lang === 'en' ? 'Makes the network work.' : 'Põe a rede a funcionar.'}</p>
              <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {BANZA_OPERATOR.map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,.88)' }}><Check color="#fff" />{row[lang]}</div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginTop: '18px', display: 'flex', gap: '12px', alignItems: 'center', padding: '16px 20px', borderRadius: '18px', background: '#fff', border: '1px solid #F3E3E1' }}>
            <span style={{ flex: 'none', width: '36px', height: '36px', borderRadius: '11px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="at" color="currentColor" size={16} /></span>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, fontWeight: 600, color: '#4a3a3e' }}>
              <strong style={{ color: '#141014' }}>@banza</strong>
              {lang === 'en'
                ? ' is the username on Banzami, used to send and receive between people. It is not the protocol.'
                : ' é o nome de utilizador no Banzami, usado para enviar e receber entre pessoas. Não é o protocolo.'}
            </p>
          </div>
          </div>
        </Reveal>
      </section>

      {/* ─────────── 03 · OS FUNDADORES (#fundador) ─────────── */}
      <section id="fundador" style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'clip' }}>
        <Reveal><div style={CONTENT}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.85fr) minmax(0,1.15fr)', gap: '56px', alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <SectionLabel n="03" label={lang === 'en' ? 'THE FOUNDERS' : 'OS FUNDADORES'} panel />
              <H2 a={lang === 'en' ? 'Who is building' : 'Quem está a construir'} b={lang === 'en' ? 'Banzami.' : 'o Banzami.'} />
              <Lead mw={440}>
                {lang === 'en'
                  ? 'Banzami was founded by Fidel Monteiro and Jesus Monteiro on 1 August 2025.'
                  : 'O Banzami foi fundado por Fidel Monteiro e Jesus Monteiro a 1 de agosto de 2025.'}
              </Lead>
              <div style={{ marginTop: '24px', display: 'inline-flex', alignItems: 'center', gap: '14px', padding: '12px 18px 12px 12px', borderRadius: '20px', background: '#FFF8F7', border: '1px solid #F3E3E1' }}>
                <span style={{ width: '44px', height: '44px', borderRadius: '14px', background: 'linear-gradient(150deg,#D8121F,#8E1620)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px -8px rgba(181,16,31,.6)' }}>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 900, letterSpacing: '.16em', color: '#9a8487' }}>{lang === 'en' ? 'FOUNDED' : 'FUNDADO'}</span>
                  <span style={{ display: 'block', marginTop: '2px', fontSize: '16px', fontWeight: 900, color: '#141014' }}>{lang === 'en' ? '1 August 2025' : '1 de agosto de 2025'}</span>
                </span>
              </div>
            </div>
            <div className="bz-g2s" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', minWidth: 0 }}>
              {FOUNDERS.map((f) => (
                <div key={f.name} style={{ position: 'relative', overflow: 'hidden', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '28px', padding: '14px 14px 24px', boxShadow: '0 30px 60px -40px rgba(122,16,22,.5)' }}>
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '4/5', borderRadius: '20px', overflow: 'hidden', background: 'radial-gradient(120% 90% at 50% 20%,#E0303A 0%,#B5101F 42%,#7C1016 78%,#4E0A0F 100%)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.img} alt={f.alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
                  </div>
                  <div style={{ padding: '18px 8px 0' }}>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{f.name}</p>
                    <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 800, color: '#B5101F' }}>{f.role[lang]}</p>
                    <p style={{ margin: '12px 0 0', fontSize: '14.5px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', textWrap: 'pretty' }}>{f.bio[lang]}</p>
                    <a href={f.linkHref} target="_blank" rel="noopener noreferrer" style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: '#B5101F', textDecoration: 'none' }}>{f.linkLabel}<ExtArrow /></a>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </div>
        </Reveal>
      </section>

      {/* ─────────── 04 · ONDE ESTAMOS ─────────── */}
      <section style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <div>
            <SectionLabel n="04" label={lang === 'en' ? 'WHERE WE ARE' : 'ONDE ESTAMOS'} />
            <H2 a={lang === 'en' ? 'Where we are,' : 'O estado atual,'} b={lang === 'en' ? 'plainly.' : 'sem rodeios.'} />
          </div>
          <Rotator mode="card" className="bz-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '14px', marginTop: '44px' }}>
            {ESTADO_ITEMS.map((it, i) => (
              <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', padding: '20px 20px 22px', borderRadius: '22px', border: '1px solid rgba(181,16,31,.06)', background: 'rgba(255,255,255,.55)', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}><Icon name={it.icon} color="currentColor" size={19} /></span>
                  <span data-ri-tag style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', fontWeight: 600, letterSpacing: '.06em', color: '#B5101F', opacity: 0, transition: 'opacity .6s' }}>{it.tag[lang]}</span>
                </div>
                <p style={{ margin: '16px 0 0', fontSize: '16px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{it.t[lang]}</p>
                <p style={{ margin: '6px 0 0', fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{it.d[lang]}</p>
                <span data-ri-bar style={barBg}><span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} /></span>
              </div>
            ))}
          </Rotator>
          </div>
        </Reveal>
      </section>

      {/* ─────────── CTA ─────────── */}
      <section style={{ position: 'relative', padding: 'clamp(24px,4vw,48px) 24px clamp(56px,7vw,96px)', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <RedCard>
            <p style={{ margin: 0, fontSize: '11.5px', fontWeight: 900, letterSpacing: '.18em', color: 'rgba(255,255,255,.75)' }}>{lang === 'en' ? 'TALK TO US' : 'FALE CONNOSCO'}</p>
            <h2 style={{ margin: '10px 0 0', fontSize: 'clamp(28px,3vw,40px)', fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.08, maxWidth: '640px', textWrap: 'balance' }}>{lang === 'en' ? 'Want to build with us?' : 'Quer construir connosco?'}</h2>
            <p style={{ margin: '14px 0 0', fontSize: '15.5px', lineHeight: 1.6, fontWeight: 600, color: 'rgba(255,255,255,.86)', maxWidth: '560px', textWrap: 'pretty' }}>
              {lang === 'en'
                ? 'Partners, developers or press: write to us and we will reply by email.'
                : 'Parceiros, developers ou imprensa: escreva-nos e respondemos por e-mail.'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginTop: '26px' }}>
              <Btn href="mailto:contact@banzami.com" kind="white" external>contact@banzami.com</Btn>
              <Btn href={route('testes', lang)} kind="outlineW">{lang === 'en' ? 'Beta Programme' : 'Programa Beta'}</Btn>
            </div>
          </RedCard>
          </div>
        </Reveal>
      </section>
    </>
  );
}
