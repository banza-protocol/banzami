// P3A content preservation map — records where every major P0–P2E content
// group lives after the information-architecture reorganization. Checked by
// p3a-information-architecture.test.ts so no content group can silently drop
// out of the documentation.

export type ContentGroup = {
  group: string;
  ptRoute: string;
  enRoute: string;
  ptSource: string;
  enSource: string;
  /** A token that must exist in the named source component/module. */
  ptToken: string;
  enToken: string;
};

export const CONTENT_MAP: ContentGroup[] = [
  { group: 'status-availability', ptRoute: '/docs/get-started', enRoute: '/docs/en/get-started', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Estado atual desta documentação', enToken: 'Current status of this documentation' },
  { group: 'sdk-first-model', ptRoute: '/docs/sdk', enRoute: '/docs/en/sdk', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Modelo de integração SDK-first', enToken: 'SDK-first integration model' },
  { group: 'quickstart', ptRoute: '/docs/get-started', enRoute: '/docs/en/get-started', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'curl https://sandbox-api.banzami.com/v1/me', enToken: 'curl https://sandbox-api.banzami.com/v1/me' },
  { group: 'credential-capability-matrix', ptRoute: '/docs/reference', enRoute: '/docs/en/reference', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Credenciais e capacidades', enToken: 'Credentials and capabilities' },
  { group: 'resource-reference', ptRoute: '/docs/reference', enRoute: '/docs/en/reference', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Referência por recurso', enToken: 'Resource reference' },
  { group: 'sandbox-testing', ptRoute: '/docs/testing', enRoute: '/docs/en/testing', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Testar no Sandbox', enToken: 'Sandbox testing' },
  { group: 'webhooks', ptRoute: '/docs/guides', enRoute: '/docs/en/guides', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Contrato de reentrega', enToken: 'Redelivery contract' },
  { group: 'errors', ptRoute: '/docs/reference', enRoute: '/docs/en/reference', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Códigos por status HTTP', enToken: 'Codes by HTTP status' },
  { group: 'idempotency', ptRoute: '/docs/reference', enRoute: '/docs/en/reference', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Idempotency-Key: idem_', enToken: 'Idempotency-Key: idem_' },
  { group: 'authentication', ptRoute: '/docs/reference', enRoute: '/docs/en/reference', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Autenticação e gestão de chaves', enToken: 'Authentication and key management' },
  { group: 'changelog', ptRoute: '/docs/changelog', enRoute: '/docs/en/changelog', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: '[Breaking]', enToken: '[Breaking]' },
  { group: 'glossary', ptRoute: '/docs/glossary', enRoute: '/docs/en/glossary', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Conceitos', enToken: 'Concepts' },
  { group: 'technical-artifacts', ptRoute: '/docs/artifacts', enRoute: '/docs/en/artifacts', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Artefactos técnicos de referência', enToken: 'Technical reference artifacts' },
  { group: 'sdk-contracts', ptRoute: '/docs/sdk', enRoute: '/docs/en/sdk', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Contrato esperado do SDK', enToken: 'Expected SDK contract' },
  // Was 'sdk-preview-onboarding'. The controlled-preview programme is retired —
  // the packages are on public registries — and what survived it is the
  // pre-integration checklist, without the approval gate in front of it.
  { group: 'pre-integration-checklist', ptRoute: '/docs/sdk', enRoute: '/docs/en/sdk', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Antes de pôr a integração a sério', enToken: 'Before you put the integration in front of anyone' },
  // Was 'trust-readiness-package', a partner-assessment artifact for a programme
  // that no longer exists. /docs/trust is now the security guide.
  { group: 'security', ptRoute: '/docs/trust', enRoute: '/docs/en/trust', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'A chave secreta é do servidor', enToken: 'The secret key belongs to the server' },
];

/**
 * Public artifact URLs that must not move.
 *
 * Thirteen entries were removed on 2026-09-12, not renamed: the controlled-preview
 * onboarding pack and the partner-readiness pack described a programme that no
 * longer exists, and a stable URL for a retired programme is a museum with a
 * permanent address. What remains is the protocol layer — OpenAPI, Postman, the
 * availability matrix, the manifests and the examples — which an integrator can
 * still act on.
 */
export const PRESERVED_ARTIFACT_URLS: string[] = [
  '/developers/openapi/banzami-sandbox.openapi.json',
  '/developers/postman/banzami-sandbox.postman_collection.json',
  '/developers/availability/banzami-developers-availability.json',
  '/developers/artifacts/manifest.json',
  '/developers/artifacts/sdk-first-manifest.json',
  '/developers/artifacts/sdk-contract.json',
  '/developers/examples/curl/get-me.sh',
  '/developers/examples/curl/create-payment-session.sh',
];
