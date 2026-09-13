// Public artifact URLs the documentation has always served. Integrations and
// tooling fetch these paths directly, so they must not move when pages do;
// dx-information-architecture.test.ts checks each still exists and is linked.

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
