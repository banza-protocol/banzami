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
  { group: 'sdk-preview-onboarding', ptRoute: '/docs/sdk', enRoute: '/docs/en/sdk', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Onboarding do preview SDK', enToken: 'SDK preview onboarding' },
  { group: 'trust-readiness-package', ptRoute: '/docs/trust', enRoute: '/docs/en/trust', ptSource: 'content-pt.tsx', enSource: 'content-en.tsx', ptToken: 'Confiança técnica e prontidão', enToken: 'Technical trust and readiness' },
];

/** Public artifact URLs that must never change across the reorganization. */
export const PRESERVED_ARTIFACT_URLS: string[] = [
  '/developers/openapi/banzami-sandbox.openapi.json',
  '/developers/postman/banzami-sandbox.postman_collection.json',
  '/developers/availability/banzami-developers-availability.json',
  '/developers/artifacts/manifest.json',
  '/developers/artifacts/sdk-first-manifest.json',
  '/developers/artifacts/sdk-contract.json',
  '/developers/examples/curl/get-me.sh',
  '/developers/examples/curl/create-payment-session.sh',
  '/developers/onboarding/sdk-preview-onboarding.json',
  '/developers/onboarding/sandbox-validation-checklist.json',
  '/developers/onboarding/partner-responsibilities.json',
  '/developers/onboarding/preview-issue-report-template.md',
  '/developers/onboarding/readiness-review-checklist.json',
  '/developers/trust/developer-trust-summary.json',
  '/developers/trust/sandbox-evidence-map.json',
  '/developers/trust/risk-limitations-matrix.json',
  '/developers/trust/partner-readiness-package.json',
  '/developers/trust/decision-gates.json',
  '/developers/trust/preview-security-posture.json',
  '/developers/trust/trust-readiness-summary.md',
];
