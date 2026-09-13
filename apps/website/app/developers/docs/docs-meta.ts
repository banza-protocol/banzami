// Page metadata for the documentation routes — server-safe, no 'use client'.
//
// Every docs page used to inherit the consumer site's title and description
// ("Banzami — A carteira Kwanza de Angola"), with no canonical URL and no
// language alternates, so a search result for the error catalogue read as an
// ad for the wallet app. Each route's layout.tsx now takes its own entry here.
import type { Metadata } from 'next';

const ORIGIN = 'https://developers.banzami.com';

export const DOCS_META: Record<string, { pt: [string, string]; en: [string, string] }> = {
  '': { pt: ['Documentação', 'Integre pagamentos em Kwanza com o Banzami: quickstart, SDK, referência da API, webhooks e a implementação de referência DOA. Sandbox operacional; Financial LIVE indisponível.'], en: ['Documentation', 'Integrate Kwanza payments with Banzami: quickstart, SDK, API reference, webhooks and the DOA reference implementation. Sandbox operational; Financial LIVE unavailable.'] },
  'get-started': { pt: ['Começar', 'Do primeiro acesso ao primeiro pagamento confirmado no Sandbox, em doze passos — configuração financeira, chave, SDK, sessão de pagamento e webhook.'], en: ['Get started', 'From first sign-in to your first confirmed payment in the Sandbox, in twelve steps — financial setup, key, SDK, payment session and webhook.'] },
  console: { pt: ['A Consola', 'Conta, workspaces e papéis, projetos, configuração financeira, chaves de API, webhooks, registos e atividade do workspace.'], en: ['The Console', 'Account, workspaces and roles, projects, financial setup, API keys, webhooks, logs and workspace activity.'] },
  sdk: { pt: ['SDKs', '@banzami/sdk (npm) e banzami_client (pub.dev): instalação, contrato do SDK e estado de cada família.'], en: ['SDKs', '@banzami/sdk (npm) and banzami_client (pub.dev): installation, the SDK contract and the status of each family.'] },
  guides: { pt: ['Guias', 'Contas segregadas, cobranças, transferências, reembolsos, comprovativos e webhooks — com resolução de problemas.'], en: ['Guides', 'Segregated accounts, charges, transfers, refunds, receipts and webhooks — with troubleshooting.'] },
  doa: { pt: ['Implementação de referência — DOA', 'Como uma plataforma de doações integra o Banzami pelos contratos públicos: contas por campanha, pagamento, webhook, comprovativo e liquidação.'], en: ['Reference implementation — DOA', 'How a donation platform integrates Banzami through the public contracts: per-campaign accounts, payment, webhook, receipt and settlement.'] },
  reference: { pt: ['Referência da API', 'API pública v1: credenciais, idempotência, limites, datas, identificadores, cada endpoint e o catálogo de erros.'], en: ['API reference', 'Public API v1: credentials, idempotency, limits, dates, identifiers, every endpoint and the error catalogue.'] },
  testing: { pt: ['Testar no Sandbox', 'O que o Sandbox é, como validar a integração, e o que não é.'], en: ['Sandbox testing', 'What the Sandbox is, how to validate an integration, and what it is not.'] },
  trust: { pt: ['Segurança', 'Onde vivem as chaves, segredos de webhook, rotação, menor privilégio e suporte sem segredos.'], en: ['Security', 'Where keys live, webhook secrets, rotation, least privilege and support without secrets.'] },
  artifacts: { pt: ['Artefactos', 'OpenAPI v1, coleção Postman, matriz de disponibilidade e manifests.'], en: ['Artifacts', 'OpenAPI v1, Postman collection, availability matrix and manifests.'] },
  changelog: { pt: ['Changelog', 'Mudanças datadas na documentação, no contrato da API e no Sandbox.'], en: ['Changelog', 'Dated changes to the documentation, the API contract and the Sandbox.'] },
  glossary: { pt: ['Glossário', 'Os conceitos usados na documentação do Banzami.'], en: ['Glossary', 'The concepts used across the Banzami documentation.'] },
};

export function docsMetadata(lang: 'pt' | 'en', slug: string): Metadata {
  const [title, description] = DOCS_META[slug][lang];
  const path = (l: 'pt' | 'en') => `${l === 'pt' ? '/docs' : '/docs/en'}${slug ? `/${slug}` : ''}`;
  return {
    // absolute: the root layout's template would append "· Banzami" again.
    title: { absolute: `${title} — Banzami Developers` },
    description,
    alternates: {
      canonical: `${ORIGIN}${path(lang)}`,
      languages: { pt: `${ORIGIN}${path('pt')}`, en: `${ORIGIN}${path('en')}` },
    },
    openGraph: { title: `${title} — Banzami Developers`, description, url: `${ORIGIN}${path(lang)}`, siteName: 'Banzami Developers' },
    robots: { index: true, follow: true },
  };
}
