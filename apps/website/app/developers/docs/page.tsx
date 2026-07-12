'use client';

// PT documentation home (P3B) — a clear, scannable landing/index page. Same
// visual system (cards, badges, callouts); data-driven from shell.tsx so the
// page stays lean. Deep content lives on the area routes.

import { DocsShell, AREAS_PT, PRIMARY_PATHS_PT, JOURNEYS_PT, areaHref } from './shell';
import { Badge, Callout, INK, LI, MUT, P, RED, UL } from './ui';

const STATE_PT: [string, string][] = [
  ['SDKs', 'pré-visualização controlada, não publicados'],
  ['HTTP/OpenAPI', 'referência técnica secundária'],
  ['Produção / trilhos live', 'não disponíveis'],
  ['Console visual', 'demo / não-operacional'],
  ['Reembolsos / transferências', 'Pendente E2E para chave developer'],
  ['Webhooks outbound', 'simulado / não reivindicado publicamente'],
];

export default function DocsHomePt() {
  return (
    <DocsShell lang="pt" active="">
      {() => (
        <section id="inicio" style={{ scrollMarginTop: 72, marginBottom: 46 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>Documentação Developers Banzami</h1>
          <P style={{ fontSize: 15.5, color: MUT, fontWeight: 600 }}>
            Infraestrutura de pagamentos <strong>SDK-first</strong> para Angola. Os SDKs Banzami são o caminho recomendado;
            a API HTTP e o OpenAPI existem como referência técnica do protocolo. Âmbito atual: <strong>Sandbox / Pré-visualização</strong>.
          </P>

          {/* Três caminhos principais */}
          <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '18px 0 20px' }}>
            {PRIMARY_PATHS_PT.map((p) => (
              <a key={p.slug} href={areaHref('pt', p.slug)} className="bz-doccard" style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 18, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: RED }}>{p.title}</p>
                <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.5 }}>{p.desc}</p>
              </a>
            ))}
          </div>

          {/* Estado atual — resumo conciso */}
          <div id="estado" style={{ scrollMarginTop: 72, margin: '0 0 22px', borderRadius: 16, border: '1px solid #F7DAD7', background: '#FFF7F6', padding: '16px 18px', maxWidth: 660 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: INK }}>Estado atual</span>
              <Badge tone="prep">Sandbox / Pré-visualização</Badge>
            </div>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
              {STATE_PT.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ fontSize: 13, fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{k}</dt>
                  <dd style={{ margin: 0, fontSize: 13, color: '#5a4a4e', fontWeight: 500 }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Grelha completa de secções */}
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 900, letterSpacing: '.05em', color: '#a89a9e' }}>TODAS AS SECÇÕES</p>
          <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '0 0 26px' }}>
            {AREAS_PT.filter((a) => a.slug).map((a) => (
              <a key={a.slug} href={areaHref('pt', a.slug)} className="bz-doccard" style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 16, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: INK }}>{a.label}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8a7a7e', fontWeight: 600 }}>{a.desc}</p>
              </a>
            ))}
          </div>

          {/* Percursos por perfil */}
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 900, letterSpacing: '.05em', color: '#a89a9e' }}>PERCURSOS SUGERIDOS</p>
          <UL>
            {JOURNEYS_PT.map((j) => (
              <LI key={j.role}>
                <strong>{j.role}:</strong>{' '}
                {j.steps.map((s, i) => (
                  <span key={s.slug || 'home'}>
                    {i > 0 ? ' → ' : ''}
                    <a href={areaHref('pt', s.slug)} style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>{s.label}</a>
                  </span>
                ))}
              </LI>
            ))}
          </UL>

          <Callout>
            Nada nesta documentação ativa trilhos live, autoriza dinheiro real ou representa aprovação regulatória.
          </Callout>
        </section>
      )}
    </DocsShell>
  );
}
