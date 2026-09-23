import { Ribbon, Badge, SectionLabel, H1, H2, Btn, Card, SandboxNotice, Icon, type IconName } from '../kit';
import { Rotator } from '../Rotator';
import { route, type Lang, type Loc } from '@/lib/marketing/nav';

/**
 * /seguranca — ported verbatim from handoff_site_completo/pages/Seguranca(.EN).dc.html.
 * Body only: the shared SiteShell provides header + footer + page background.
 * All animations reuse global keyframes (bzring via <Badge>, floaty on the hero
 * chip); no bespoke keyframes are needed.
 */

const L = (pt: string, en: string): Loc => ({ pt, en });

// ── 01 · Como protegemos ────────────────────────────────────────────────────
const GUARANTEES: { icon: IconName; tag: Loc; title: Loc; desc: Loc }[] = [
  {
    icon: 'ledger',
    tag: L('LEDGER', 'LEDGER'),
    title: L('Ledger double-entry imutável', 'Immutable double-entry ledger'),
    desc: L(
      'Cada pagamento é um débito e um crédito. Nada é apagado; correções são novos lançamentos.',
      'Every payment is a debit and a credit. Nothing is deleted; corrections are new entries.',
    ),
  },
  {
    icon: 'repeat',
    tag: L('IDEMPOTÊNCIA', 'IDEMPOTENCY'),
    title: L('Idempotência', 'Idempotency'),
    desc: L(
      'Pedidos repetidos com a mesma chave não criam pagamentos duplicados.',
      'Repeated requests with the same key do not create duplicate payments.',
    ),
  },
  {
    icon: 'lock',
    tag: L('TLS', 'TLS'),
    title: L('TLS em trânsito', 'TLS in transit'),
    desc: L(
      'Todas as ligações à app e à API são cifradas.',
      'All connections to the app and API are encrypted.',
    ),
  },
  {
    icon: 'receipt',
    tag: L('BZM-', 'BZM-'),
    title: L('Comprovativos verificáveis', 'Verifiable receipts'),
    desc: L(
      'Cada comprovativo tem uma referência que qualquer pessoa pode confirmar.',
      'Every receipt has a reference anyone can confirm.',
    ),
  },
  {
    icon: 'shield',
    tag: L('FAIL-CLOSED', 'FAIL-CLOSED'),
    title: L('Financial Live fail-closed', 'Financial Live fail-closed'),
    desc: L(
      'Sem aprovação explícita, os pedidos em produção são rejeitados.',
      'Without explicit approval, production requests are rejected.',
    ),
  },
  {
    icon: 'bolt',
    tag: L('WEBHOOKS', 'WEBHOOKS'),
    title: L('Webhooks assinados', 'Signed webhooks'),
    desc: L(
      'Os eventos enviados aos developers são assinados e verificáveis.',
      'Events sent to developers are signed and verifiable.',
    ),
  },
];

// ── 03 · Reportar vulnerabilidades ──────────────────────────────────────────
const INCLUDE: Loc[] = [
  L('Descrição da falha', 'Description of the flaw'),
  L('Passos para reproduzir', 'Steps to reproduce'),
  L('Impacto estimado', 'Estimated impact'),
  L('Como o contactar', 'How to contact you'),
];
const ASK: Loc[] = [
  L('Não aceda a dados de terceiros', 'Do not access third-party data'),
  L('Não degrade o serviço', 'Do not degrade the service'),
  L('Use apenas a Sandbox', 'Use only the Sandbox'),
  L('Aguarde a correção antes de divulgar', 'Wait for the fix before disclosing'),
];

const T = {
  // hero
  badge: L('Versão Beta · Sandbox', 'Beta · Sandbox'),
  h1a: L('Segurança desde', 'Security from'),
  h1b: L('o primeiro lançamento.', 'the very first entry.'),
  lead: L(
    'Cada movimento fica registado num ledger de dupla entrada imutável, com comprovativos que qualquer pessoa pode verificar.',
    'Every movement is recorded in an immutable double-entry ledger, with receipts anyone can verify.',
  ),
  small: L(
    'Sem promessas de licenças ou certificações que não temos. O Financial Live permanece indisponível.',
    'No claims of licences or certifications we do not have. Financial Live remains unavailable.',
  ),
  ctaReport: L('Reportar uma vulnerabilidade', 'Report a vulnerability'),
  ctaVerify: L('Verificar comprovativo', 'Verify a receipt'),
  cardEntry: L('LANÇAMENTO', 'ENTRY'),
  cardImmutable: L('Imutável', 'Immutable'),
  cardDebit: L('DÉBITO', 'DEBIT'),
  cardCredit: L('CRÉDITO', 'CREDIT'),
  walletAna: L('Carteira @ana', 'Wallet @ana'),
  walletMaria: L('Carteira @maria', 'Wallet @maria'),
  balanced: L('Débitos = Créditos', 'Debits = Credits'),
  tls1: L('TLS em', 'TLS in'),
  tls2: L('trânsito', 'transit'),
  // 01
  label01: L('COMO PROTEGEMOS', 'HOW WE PROTECT'),
  s1h2a: L('Seis garantias', 'Six technical'),
  s1h2b: L('técnicas.', 'guarantees.'),
  s1lead: L(
    'Princípios aplicados em todo o sistema, da app à API.',
    'Principles applied across the whole system, from the app to the API.',
  ),
  // 02
  label02: L('FAIL-CLOSED', 'FAIL-CLOSED'),
  s2h2a: L('Se não está aprovado,', 'If it is not approved,'),
  s2h2b: L('não passa.', 'it does not go through.'),
  s2lead: L(
    'O Financial Live está desligado por omissão. Enquanto as aprovações aplicáveis não existirem, qualquer pedido em produção é rejeitado. A Sandbox funciona isolada, com dinheiro fictício.',
    'Financial Live is off by default. Until the applicable approvals exist, any production request is rejected. The Sandbox runs in isolation, with test money.',
  ),
  envTitle: L('Estado dos ambientes', 'Environment status'),
  sandboxDesc: L('Dinheiro fictício, chaves bz_test_.', 'Test money, bz_test_ keys.'),
  sandboxState: L('Disponível', 'Available'),
  liveDesc: L('Pedidos rejeitados por omissão.', 'Requests rejected by default.'),
  liveState: L('Indisponível', 'Unavailable'),
  envNote: L('Atualizado a cada mudança de estado.', 'Updated on every status change.'),
  // 03
  label03: L('REPORTAR VULNERABILIDADES', 'REPORT VULNERABILITIES'),
  s3h2a: L('Encontrou uma falha?', 'Found a flaw?'),
  s3h2b: L('Fale connosco.', 'Get in touch.'),
  s3lead: L(
    'Envie os detalhes para a nossa equipa de segurança. Respondemos, investigamos e mantemos o contacto até à correção.',
    'Send the details to our security team. We reply, investigate and keep in touch until it is fixed.',
  ),
  includeTitle: L('O que incluir', 'What to include'),
  askTitle: L('Pedimos que', 'We ask that you'),
  // honesty
  honestTitle: L('O que não afirmamos', 'What we do not claim'),
  honestText: L(
    'O Banzami não afirma licenças, certificações ou aprovações regulatórias que não tenha. O Financial Live permanece indisponível, sujeito às aprovações aplicáveis.',
    'Banzami does not claim licences, certifications or regulatory approvals it does not have. Financial Live remains unavailable, subject to the applicable approvals.',
  ),
  aboutCta: L('Sobre o Banzami', 'About Banzami'),
};

const MAILTO = 'mailto:security@banzami.com?subject=Vulnerabilidade%20%E2%80%94%20Banzami';

// Small reusable checklist row (dossier: check icon + label).
function Checklist({ items, lang }: { items: Loc[]; lang: Lang }) {
  return (
    <div style={{ marginTop: '6px' }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '10px 0' }}>
          <Icon name="check" size={16} color="#B5101F" width={2.6} />
          <span style={{ fontSize: '14px', lineHeight: 1.5, fontWeight: 600, color: '#4a3a3e' }}>{it[lang]}</span>
        </div>
      ))}
    </div>
  );
}

// Report card (icon + heading + checklist).
function ReportCard({ icon, title, items, lang }: { icon: IconName; title: string; items: Loc[]; lang: Lang }) {
  return (
    <Card>
      <span style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '12px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color="currentColor" />
      </span>
      <div style={{ marginTop: '14px' }}>
        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{title}</h3>
      </div>
      <Checklist items={items} lang={lang} />
    </Card>
  );
}

export function SegurancaPage({ lang }: { lang: Lang }) {
  return (
    <>
      {/* ═══════════════ 00 · HERO ═══════════════ */}
      <section id="inicio" style={{ position: 'relative', padding: '112px 24px 64px', overflow: 'hidden', background: '#fff', borderRadius: '0 0 48px 48px', boxShadow: '0 40px 80px -60px rgba(122,16,22,.45)' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/hero-bg-red.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
        </div>
        <Ribbon />
        <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '48px', alignItems: 'center' }}>
          <div>
            <Badge>{T.badge[lang]}</Badge>
            <H1 a={T.h1a[lang]} b={T.h1b[lang]} />
            <p style={{ margin: '20px 0 0', fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.55, color: '#4a3a3e', fontWeight: 600, maxWidth: '540px', textWrap: 'pretty' }}>{T.lead[lang]}</p>
            <p style={{ margin: '12px 0 0', fontSize: '13.5px', lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600, maxWidth: '540px', textWrap: 'pretty' }}>{T.small[lang]}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginTop: '26px' }}>
              <Btn href="#reportar" kind="red">{T.ctaReport[lang]}</Btn>
              <Btn href={route('verificar', lang)} kind="ghost">{T.ctaVerify[lang]}</Btn>
            </div>
          </div>
          {/* Decorative ledger-entry mockup */}
          <div aria-hidden="true" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '520px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
              <div style={{ position: 'relative', overflow: 'hidden', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '24px', padding: '26px', boxShadow: '0 26px 56px -40px rgba(122,16,22,.45)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 900, letterSpacing: '.16em', color: '#9a8487' }}>{T.cardEntry[lang]}</p>
                    <p style={{ margin: '4px 0 0', fontFamily: "'JetBrains Mono',monospace", fontSize: '14px', fontWeight: 600, color: '#B5101F' }}>BZM-7Q4K-2M9A</p>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '20px', background: '#1a1416', color: '#fff', fontSize: '11px', fontWeight: 900 }}>
                    <Icon name="lock" size={12} color="#fff" />{T.cardImmutable[lang]}
                  </span>
                </div>
                <div style={{ marginTop: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '62px minmax(0,1fr) auto', gap: '10px', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #F5E8E6' }}>
                    <span style={{ padding: '3px 8px', borderRadius: '8px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', fontWeight: 600, background: '#FFF1F0', color: '#B5101F' }}>{T.cardDebit[lang]}</span>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#141014' }}>{T.walletAna[lang]}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '13px', fontWeight: 600, color: '#141014' }}>1 500 Kz</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '62px minmax(0,1fr) auto', gap: '10px', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #F5E8E6' }}>
                    <span style={{ padding: '3px 8px', borderRadius: '8px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', fontWeight: 600, background: '#E3F4EA', color: '#1E8E4E' }}>{T.cardCredit[lang]}</span>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#141014' }}>{T.walletMaria[lang]}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '13px', fontWeight: 600, color: '#141014' }}>1 500 Kz</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', padding: '12px 14px', borderRadius: '14px', background: '#F2FAF5', border: '1px solid #CDEBD9' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E6E3E' }}>{T.balanced[lang]}</span>
                  <Icon name="check" size={18} color="#1E8E4E" width={3} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontFamily: "'JetBrains Mono',monospace", fontSize: '11.5px', color: '#9a8487' }}>
                  <span>Idempotency-Key</span><span>pedido-123</span>
                </div>
              </div>
              <div className="bz-float" style={{ position: 'absolute', left: '-44px', bottom: '-26px', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '16px', background: '#fff', boxShadow: '0 20px 40px -18px rgba(122,16,22,.35)', animation: 'floaty 6s ease-in-out infinite' }}>
                <span style={{ flex: 'none', width: '32px', height: '32px', borderRadius: '10px', background: 'linear-gradient(150deg,#D8121F,#8E1620)', color: '#fff', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px -8px rgba(181,16,31,.6)' }}>
                  <Icon name="lock" size={14} color="currentColor" />
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#141014', lineHeight: 1.3 }}>{T.tls1[lang]}<br />{T.tls2[lang]}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ 01 · COMO PROTEGEMOS ═══════════════ */}
      <section style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
        <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,.9fr)', gap: '20px 56px', alignItems: 'end' }}>
            <div>
              <SectionLabel n="01" label={T.label01[lang]} panel />
              <H2 a={T.s1h2a[lang]} b={T.s1h2b[lang]} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '480px', textWrap: 'pretty' }}>{T.s1lead[lang]}</p>
          </div>
          <Rotator mode="card" idle="#FFF8F7" className="bz-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '14px', marginTop: '44px' }}>
            {GUARANTEES.map((g, i) => (
              <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', padding: '20px 20px 22px', borderRadius: '22px', border: '1px solid rgba(181,16,31,.06)', background: '#FFF8F7', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}>
                    <Icon name={g.icon} size={19} color="currentColor" />
                  </span>
                  <span data-ri-tag style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', fontWeight: 600, letterSpacing: '.06em', color: '#B5101F', opacity: 0, transition: 'opacity .6s' }}>{g.tag[lang]}</span>
                </div>
                <p style={{ margin: '16px 0 0', fontSize: '16px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{g.title[lang]}</p>
                <p style={{ margin: '6px 0 0', fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{g.desc[lang]}</p>
                <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', opacity: 0, transition: 'opacity .6s' }}><span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} /></span>
              </div>
            ))}
          </Rotator>
        </div>
      </section>

      {/* ═══════════════ 02 · FAIL-CLOSED ═══════════════ */}
      <section id="fail-closed" style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', overflow: 'hidden' }}>
        <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: '56px', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <SectionLabel n="02" label={T.label02[lang]} />
              <H2 a={T.s2h2a[lang]} b={T.s2h2b[lang]} />
              <p style={{ margin: '16px 0 0', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '440px', textWrap: 'pretty' }}>{T.s2lead[lang]}</p>
            </div>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <Card style={{ padding: '28px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{T.envTitle[lang]}</h3>
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '18px 0', borderBottom: '1px solid #F5E8E6' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#141014' }}>Sandbox</p>
                      <p style={{ margin: '3px 0 0', fontSize: '13px', fontWeight: 600, color: '#8a7a7e' }}>{T.sandboxDesc[lang]}</p>
                    </div>
                    <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', background: '#E3F4EA', color: '#1E8E4E', fontSize: '12.5px', fontWeight: 900 }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'currentColor' }} />{T.sandboxState[lang]}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '18px 0', borderBottom: '1px solid #F5E8E6' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#141014' }}>Financial Live</p>
                      <p style={{ margin: '3px 0 0', fontSize: '13px', fontWeight: 600, color: '#8a7a7e' }}>{T.liveDesc[lang]}</p>
                    </div>
                    <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', background: '#FFF1F0', color: '#B5101F', fontSize: '12.5px', fontWeight: 900 }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'currentColor' }} />{T.liveState[lang]}
                    </span>
                  </div>
                </div>
                <p style={{ margin: '14px 0 0', fontSize: '12.5px', fontWeight: 600, color: '#9a8487' }}>{T.envNote[lang]}</p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ 03 · REPORTAR VULNERABILIDADES ═══════════════ */}
      <section id="reportar" style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
        <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: '56px', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <SectionLabel n="03" label={T.label03[lang]} panel />
              <H2 a={T.s3h2a[lang]} b={T.s3h2b[lang]} />
              <p style={{ margin: '16px 0 0', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '440px', textWrap: 'pretty' }}>{T.s3lead[lang]}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginTop: '28px' }}>
                <Btn href={MAILTO} kind="red">security@banzami.com</Btn>
              </div>
            </div>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <div className="bz-g2s" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <ReportCard icon="bug" title={T.includeTitle[lang]} items={INCLUDE} lang={lang} />
                <ReportCard icon="shield" title={T.askTitle[lang]} items={ASK} lang={lang} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ HONESTIDADE ═══════════════ */}
      <section style={{ position: 'relative', padding: 'clamp(40px,5vw,72px) 24px clamp(56px,7vw,96px)', overflow: 'hidden' }}>
        <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <SandboxNotice title={T.honestTitle[lang]} cta={<Btn href={route('sobre', lang)} kind="ghost">{T.aboutCta[lang]}</Btn>}>
            {T.honestText[lang]}
          </SandboxNotice>
        </div>
      </section>
    </>
  );
}
