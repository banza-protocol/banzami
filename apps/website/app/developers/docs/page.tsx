'use client';

// PT documentation home (P3A) — a clean landing/index page, not the former
// giant single page. Same visual system: status card, capability cards,
// badges, callouts. All previous content lives on the area routes below.

import { DocsShell, AREAS_PT, areaHref } from './shell';
import { Badge, Callout, INK, LI, MUT, P, RED, UL } from './ui';

export default function DocsHomePt() {
  return (
    <DocsShell lang="pt" active="">
      {() => (
        <section id="inicio" style={{ scrollMarginTop: 72, marginBottom: 46 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>Documentação Developers Banzami</h1>
          <P style={{ fontSize: 15.5, color: MUT, fontWeight: 600 }}>
            Integre pagamentos Banzami com um modelo <strong>SDK-first</strong>: os SDKs Banzami são o caminho recomendado;
            a API HTTP e o OpenAPI existem como camada de referência técnica do protocolo. Toda a documentação usa o
            ambiente <strong>Sandbox</strong> por defeito.
          </P>

          {/* Estado atual — mesmo cartão de status de sempre */}
          <div id="estado" style={{ scrollMarginTop: 72, margin: '0 0 18px', borderRadius: 16, border: '1px solid #F7DAD7', background: '#FFF7F6', padding: '16px 18px', maxWidth: 660 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: INK }}>Estado atual</span>
              <Badge tone="prep">Sandbox / Pré-visualização</Badge>
            </div>
            <UL>
              <LI><strong>Produção e trilhos de dinheiro real não estão disponíveis.</strong> Pay/checkout públicos, trilhos live e fornecedores externos não estão disponíveis.</LI>
              <LI>Os SDKs estão em <strong>pré-visualização controlada</strong> — ainda não publicados publicamente; sem comandos de instalação pública.</LI>
              <LI>As páginas visuais da Consola (dashboard, webhooks, logs) são <strong>demo, não operacionais</strong>, salvo indicação explícita.</LI>
              <LI>Disponível em Sandbox controlado: identidade da chave, sessões de pagamento, payment links e QR; reembolsos/transferências <strong>Pendente E2E</strong> para chaves developer; entrega outbound de webhooks <strong>simulada</strong>.</LI>
            </UL>
          </div>

          {/* Escolha o seu caminho — mesmos doccards de sempre */}
          <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '18px 0 26px' }}>
            {AREAS_PT.filter((a) => a.slug).map((a) => (
              <a key={a.slug} href={areaHref('pt', a.slug)} className="bz-doccard" style={{ position: 'relative', display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 18, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: INK }}>{a.label}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600 }}>{a.desc}</p>
              </a>
            ))}
          </div>

          <Callout>
            Comece por <a href="/docs/get-started" style={{ color: '#9A1B22', fontWeight: 800, textDecoration: 'none' }}>Começar</a>,
            veja os <a href="/docs/artifacts" style={{ color: '#9A1B22', fontWeight: 800, textDecoration: 'none' }}>artefactos técnicos</a> e
            o <a href="/docs/trust" style={{ color: '#9A1B22', fontWeight: 800, textDecoration: 'none' }}>pacote de confiança e prontidão</a>.
            Nada nesta documentação ativa trilhos live, autoriza dinheiro real ou representa aprovação regulatória.
          </Callout>
        </section>
      )}
    </DocsShell>
  );
}
