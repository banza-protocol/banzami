'use client';

// The documentation home, in either language: what you can build, the two ways
// in, the current environment, the path to a first payment, and the tasks.

import { AREAS_EN, AREAS_PT, NAV_GROUPS, areaHref } from './shell';
import { PathDiagram } from './diagrams';
import { TaskCards } from './dx';
import { BODY, H1_STYLE, INK, LINE, LINK, MUT, P, RED } from './ui';

type Lang = 'pt' | 'en';

const COPY = {
  pt: {
    title: 'Documentação para developers',
    lede: 'Aceite pagamentos em kwanzas na sua aplicação: crie um pagamento, confirme-o por webhook, reembolse e liquide. A API v1 e o SDK TypeScript estão disponíveis no Sandbox.',
    start: 'Começar a construir', reference: 'Referência da API',
    sandbox: 'Sandbox disponível', live: 'Operações com dinheiro real indisponíveis', envLink: 'Sandbox e Live',
    pathTitle: 'O caminho até ao primeiro pagamento',
    pathDesc: 'Conta, workspace, projeto, configuração financeira, chave de API, SDK e pagamento. O Quickstart segue esta ordem.',
    path: ['Conta', 'Workspace', 'Projeto', 'Config. financeira', 'Chave de API', 'SDK', 'Pagamento'],
    tasks: 'O que pode construir', browse: 'Toda a documentação',
    cards: [
      { href: '/docs/payments', title: 'Aceitar um pagamento', desc: 'Sessão de pagamento com link e QR, confirmada no servidor.' },
      { href: '/docs/payments#links', title: 'Partilhar um link de pagamento', desc: 'Um endereço reutilizável, sem uma sessão por cliente.' },
      { href: '/docs/payments#apresentar', title: 'Mostrar um QR', desc: 'O QR da sessão abre a página de pagamento do Banzami.' },
      { href: '/docs/webhooks', title: 'Receber webhooks', desc: 'Eventos assinados: verificar, deduplicar e responder.' },
      { href: '/docs/refunds', title: 'Reembolsar um pagamento', desc: 'Total ou parcial, sem risco de devolver duas vezes.' },
      { href: '/docs/settlements', title: 'Liquidar uma conta', desc: 'Do saldo da conta para o beneficiário, com a taxa calculada.' },
      { href: '/docs/receipts', title: 'Verificar um comprovativo', desc: 'A referência BZM-… verifica-se sem conta nem chave.' },
      { href: '/docs/doa', title: 'Construir como o DOA', desc: 'Uma integração de referência, do pagamento à liquidação.' },
    ],
  },
  en: {
    title: 'Developer documentation',
    lede: 'Accept kwanza payments in your application: create a payment, confirm it by webhook, refund it and settle. API v1 and the TypeScript SDK are available in the Sandbox.',
    start: 'Start building', reference: 'API reference',
    sandbox: 'Sandbox available', live: 'Real-money operations unavailable', envLink: 'Sandbox and Live',
    pathTitle: 'The path to a first payment',
    pathDesc: 'Account, workspace, project, Financial Setup, API key, SDK and payment. The Quickstart follows this order.',
    path: ['Account', 'Workspace', 'Project', 'Financial Setup', 'API key', 'SDK', 'Payment'],
    tasks: 'What you can build', browse: 'All documentation',
    cards: [
      { href: '/docs/en/payments', title: 'Accept a payment', desc: 'A Payment Session with a link and QR, confirmed on your server.' },
      { href: '/docs/en/payments#links', title: 'Share a Payment Link', desc: 'A reusable URL, without one session per customer.' },
      { href: '/docs/en/payments#present', title: 'Show a QR code', desc: 'The session QR opens Banzami’s hosted payment page.' },
      { href: '/docs/en/webhooks', title: 'Receive webhooks', desc: 'Signed events: verify, deduplicate and respond.' },
      { href: '/docs/en/refunds', title: 'Refund a payment', desc: 'In full or in part, without refunding twice.' },
      { href: '/docs/en/settlements', title: 'Settle an account', desc: 'From the account balance to a beneficiary, with the fee calculated.' },
      { href: '/docs/en/receipts', title: 'Verify a receipt', desc: 'A BZM-… reference verifies with no account and no key.' },
      { href: '/docs/en/doa', title: 'Build like DOA', desc: 'A reference integration, from payment to settlement.' },
    ],
  },
} as const;

function Status({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px', borderRadius: 999, border: `1px solid ${ok ? '#CFE9DA' : LINE}`, background: ok ? '#F1FAF5' : '#F7F4F3', fontSize: 13, fontWeight: 600, color: ok ? '#1F6B47' : BODY }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: ok ? '#1F8A5B' : '#9a8f92' }} />
      {children}
    </span>
  );
}

export function DocsHome({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const areas = lang === 'pt' ? AREAS_PT : AREAS_EN;
  return (
    <section id={lang === 'pt' ? 'inicio' : 'home'} style={{ marginBottom: 40 }}>
      <h1 style={{ ...H1_STYLE, fontSize: 34 }}>{c.title}</h1>
      <P style={{ fontSize: 17, color: MUT, maxWidth: 680 }}>{c.lede}</P>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '18px 0 14px' }}>
        <a href={areaHref(lang, 'get-started')} className="bz-cta" style={{ padding: '11px 18px', borderRadius: 10, background: RED, color: '#fff', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>{c.start}</a>
        <a href={areaHref(lang, 'reference')} style={{ padding: '10px 18px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>{c.reference}</a>
      </div>
      <p style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '0 0 26px' }}>
        <Status ok>{c.sandbox}</Status>
        <Status ok={false}>{c.live}</Status>
        <a href={`${areaHref(lang, 'concepts')}#sandbox-live`} style={{ color: LINK, fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>{c.envLink}</a>
      </p>

      <PathDiagram title={c.pathTitle} desc={c.pathDesc} steps={[...c.path]} highlight={3} />

      <h2 style={{ margin: '30px 0 12px', fontSize: 22, fontWeight: 700, color: INK }}>{c.tasks}</h2>
      <TaskCards items={[...c.cards]} />

      <h2 style={{ margin: '30px 0 12px', fontSize: 22, fontWeight: 700, color: INK }}>{c.browse}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px 24px' }}>
        {NAV_GROUPS.map((g) => (
          <div key={g.id}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: MUT }}>{g.title[lang]}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {g.slugs.filter(Boolean).map((slug) => {
                const a = areas.find((x) => x.slug === slug)!;
                return (
                  <li key={slug}>
                    <a href={areaHref(lang, slug)} style={{ color: LINK, fontWeight: 600, fontSize: 14.5, textDecoration: 'none' }}>{a.label}</a>
                    <span style={{ display: 'block', fontSize: 13, color: MUT }}>{a.desc}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
