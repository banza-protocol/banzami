// Page metadata for the documentation routes — server-safe, no 'use client'.
//
// Every docs page used to inherit the consumer site's title and description
// ("Banzami — A carteira Kwanza de Angola"), with no canonical URL and no
// language alternates, so a search result for the error catalogue read as an
// ad for the wallet app. Each route's layout.tsx now takes its own entry here.
import type { Metadata } from 'next';

const ORIGIN = 'https://developers.banzami.com';

export const DOCS_META: Record<string, { pt: [string, string]; en: [string, string] }> = {
  '': { pt: ['Documentação', 'Aceite pagamentos em kwanzas com o Banzami: quickstart, API v1, SDK, webhooks e uma implementação de referência. Sandbox disponível; operações com dinheiro real indisponíveis.'], en: ['Documentation', 'Accept kwanza payments with Banzami: quickstart, API v1, SDK, webhooks and a reference implementation. Sandbox available; real-money operations unavailable.'] },
  'get-started': { pt: ['Quickstart', 'Crie e confirme o primeiro pagamento no Sandbox em doze passos: conta, projeto, configuração financeira, chave, SDK, sessão e webhook.'], en: ['Quickstart', 'Create and confirm your first Sandbox payment in twelve steps: account, project, Financial Setup, key, SDK, session and webhook.'] },
  concepts: { pt: ['Como o Banzami funciona', 'O modelo de integração, Sandbox e Live, montantes em unidades menores, idempotência e request_id.'], en: ['How Banzami works', 'The integration model, Sandbox and Live, amounts in minor units, idempotency and request_id.'] },
  payments: { pt: ['Aceitar pagamentos', 'Sessões de pagamento, links e QR: criar, apresentar e confirmar um pagamento no servidor.'], en: ['Accept payments', 'Payment Sessions, Payment Links and QR: create, present and confirm a payment on your server.'] },
  webhooks: { pt: ['Webhooks', 'Receber eventos assinados: verificar a assinatura, deduplicar, responder, reenviar e rodar o segredo.'], en: ['Webhooks', 'Receive signed events: verify the signature, deduplicate, respond, replay and rotate the secret.'] },
  events: { pt: ['Eventos', 'Os sete eventos de webhook do Banzami: quando são emitidos, campos, ação esperada e exemplos.'], en: ['Events', 'Banzami’s seven webhook events: when they are emitted, fields, expected action and examples.'] },
  refunds: { pt: ['Reembolsos', 'Devolver um pagamento total ou parcialmente, com idempotência, regras e erros.'], en: ['Refunds', 'Return a payment in full or in part, with idempotency, rules and errors.'] },
  settlements: { pt: ['Liquidações', 'Liquidar o saldo de uma conta para um beneficiário: bruto, taxa, líquido, destino da taxa e erros.'], en: ['Settlements', 'Settle an account balance to a beneficiary: gross, fee, net, fee destination and errors.'] },
  receipts: { pt: ['Comprovativos', 'Referências de prova SECURE_V1, verificação pública e diferença para a referência da transação.'], en: ['Receipts', 'SECURE_V1 proof references, public verification and how they differ from a transaction reference.'] },
  transfers: { pt: ['Contas e transferências', 'Contas segregadas por campanha ou loja e transferências entre contas do mesmo Business.'], en: ['Accounts and transfers', 'Segregated accounts per campaign or store, and transfers between accounts of the same Business.'] },
  console: { pt: ['A Consola', 'Conta, workspaces e papéis, projetos, configuração financeira, chaves de API, webhooks, registos e atividade.'], en: ['The Console', 'Account, workspaces and roles, projects, Financial Setup, API keys, webhooks, logs and activity.'] },
  sdk: { pt: ['SDKs', '@banzami/sdk (npm) e banzami_client (pub.dev): o que cada SDK trata e o estado de cada família.'], en: ['SDKs', '@banzami/sdk (npm) and banzami_client (pub.dev): what each SDK handles and the status of each family.'] },
  doa: { pt: ['Implementação de referência — DOA', 'Como uma aplicação de angariação de fundos integra o Banzami pelos contratos públicos, da conta da campanha à liquidação.'], en: ['Reference implementation — DOA', 'How a fundraising application integrates Banzami through the public contracts, from campaign account to settlement.'] },
  reference: { pt: ['Referência da API', 'API pública v1: autenticação, idempotência, limites e cada endpoint, com scope, parâmetros, resposta, erros e método do SDK.'], en: ['API reference', 'Public API v1: authentication, idempotency, limits and every endpoint, with scope, parameters, response, errors and SDK method.'] },
  errors: { pt: ['Erros', 'O envelope de erro, o que fazer por código HTTP e o catálogo pesquisável de todos os códigos.'], en: ['Errors', 'The error envelope, what to do by HTTP status and the searchable catalogue of every code.'] },
  testing: { pt: ['Testar no Sandbox', 'Cenários de teste com a forma de os provocar, a resposta esperada, o evento e a verificação na Consola.'], en: ['Sandbox testing', 'Test scenarios with how to trigger them, the expected response, the event and the Console check.'] },
  'going-live': { pt: ['Do Sandbox ao Live', 'O estado das operações com dinheiro real e a lista de verificação de uma integração pronta.'], en: ['From Sandbox toward Live', 'The status of real-money operations and the checklist for a ready integration.'] },
  trust: { pt: ['Segurança', 'Onde guardar chaves e segredos de webhook, scopes mínimos e rotação de credenciais.'], en: ['Security', 'Where to keep keys and webhook secrets, least-privilege scopes and credential rotation.'] },
  artifacts: { pt: ['Artefactos', 'OpenAPI v1, coleção Postman, exemplos, matriz de disponibilidade e manifests.'], en: ['Artifacts', 'OpenAPI v1, Postman collection, examples, availability matrix and manifests.'] },
  troubleshooting: { pt: ['Resolução de problemas', 'Diagnóstico por sintoma: causas, o que verificar, onde ver na Consola e quando repetir.'], en: ['Troubleshooting', 'Diagnosis by symptom: causes, what to check, where to look in the Console and when to retry.'] },
  support: { pt: ['Suporte', 'Como contactar o suporte, o que incluir e o que nunca enviar.'], en: ['Support', 'How to contact support, what to include and what never to send.'] },
  changelog: { pt: ['Changelog', 'Alterações à API, ao SDK, ao Sandbox e à documentação, com impacto e ação necessária.'], en: ['Changelog', 'Changes to the API, SDK, Sandbox and documentation, with impact and required action.'] },
  glossary: { pt: ['Glossário', 'Os termos usados na documentação do Banzami.'], en: ['Glossary', 'The terms used across the Banzami documentation.'] },
  guides: { pt: ['Guias', 'Os guias passaram a ter uma página por tarefa: pagamentos, webhooks, eventos, reembolsos e comprovativos.'], en: ['Guides', 'The guides now have one page per task: payments, webhooks, events, refunds and receipts.'] },
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
    robots: slug === 'guides' ? { index: false, follow: true } : { index: true, follow: true },
  };
}
