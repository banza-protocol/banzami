/**
 * DOCS-PROD-001 coverage manifest — every *_COMPLETE counter, item by item.
 *
 * Each item's `spec` is text that must appear VERBATIM in the named spec
 * section (docs/quality/DOCS_PROD_001_SPEC.md), so an item cannot be invented
 * here; and tools/check-docs-coverage.mjs derives the item lists back out of the
 * spec and fails on any spec item this file does not map. `pt` and `en` are
 * what the published documentation must say for the item to count — the
 * substance, not the topic word.
 */
export const COVERAGE = {
  DOCS_WORKSPACE_COMPLETE: {
    section: 7, heading: 'WORKSPACE',
    items: [
      { spec: 'what Workspace represents', pt: /A fronteira de acesso da equipa|O workspace define quem tem acesso/, en: /Your team’s access boundary|A workspace defines who has access/ },
      { spec: 'membership', pt: /Uma pessoa pode pertencer a vários workspaces/, en: /A person can belong to several workspaces/ },
      { spec: 'roles', pt: /Owner[\s\S]{0,600}Viewer/, en: /Owner[\s\S]{0,600}Viewer/ },
      { spec: 'ownership', pt: /O último Owner não pode sair/, en: /The last Owner cannot leave/ },
      { spec: 'invites', pt: /Convidar gera um link/, en: /Invite generates a link/ },
      { spec: 'leave Workspace', pt: /Sair de um workspace é sempre possível/, en: /Leaving a workspace is always possible/ },
      { spec: 'ownership transfer', pt: /Transferir a titularidade faz-se em dois passos/, en: /Transferring ownership takes two steps/ },
      { spec: 'hard-delete conditions', pt: /Eliminar só é possível num workspace sem histórico/, en: /Delete is possible only for a workspace with no history/ },
      { spec: 'archive conditions', pt: /Arquivar é recusado enquanto houver projetos ativos/, en: /Archive is refused while projects are active/ },
      { spec: 'Workspace Activity = administrative\nmembership/ownership audit', pt: /Atividade do workspace[\s\S]{0,300}registo administrativo/, en: /Workspace activity[\s\S]{0,300}administrative record/i },
      { spec: 'Do not confuse the two', pt: /Quem alterou o quê no workspace[\s\S]{0,120}O que a aplicação pediu à API/, en: /Who changed what in the workspace[\s\S]{0,120}What your application asked the API/ },
    ],
  },
  DOCS_PROJECT_COMPLETE: {
    section: 7, heading: 'PROJECT',
    items: [
      { spec: 'purpose', pt: /A unidade de integração: uma aplicação/, en: /The unit of integration: one application/ },
      { spec: 'stable Project ID', pt: /Project ID — não muda/, en: /Project ID — does not change/ },
      { spec: 'environment', pt: /environment: SANDBOX|"environment": "SANDBOX"/, en: /environment: SANDBOX|"environment": "SANDBOX"/ },
      { spec: 'rename', pt: /não muda quando altera o nome/, en: /does not change when you rename the project/ },
      { spec: 'delete empty Project', pt: /Eliminar — possível enquanto o projeto não tiver histórico/, en: /Delete — possible while the project has no history/ },
      { spec: 'archive financial/historical Project', pt: /Arquivar — para projetos com histórico/, en: /Archive — for projects with history/ },
    ],
  },
  DOCS_FINANCIAL_SETUP_COMPLETE: {
    section: 7, heading: 'FINANCIAL SETUP',
    items: [
      { spec: 'why it exists', pt: /A configuração financeira liga o projeto a um Business/, en: /Financial Setup connects the project to a Business/ },
      { spec: 'Project → Financial Setup → Business → financial authority', pt: /A autoridade vem da chave\. A chave identifica o projeto, e o projeto determina o Business/, en: /Authority comes from the key\. The key identifies the project, and the project determines the Business/ },
      // The spec's labels, read under ADR-060 (SANDBOX-SELF-SERVICE-001): in the
      // Sandbox the "new Business" path is a test Business created from the use
      // case with no review, and "truthfully" now means saying nobody reviews it.
      { spec: 'A. new Business application', pt: /Negócio de teste[\s\S]{0,400}Escolhe o tipo de uso/, en: /Test Business[\s\S]{0,400}Choose the use case/ },
      { spec: 'B. connect existing Business with single-use consent code', pt: /código de consentimento[\s\S]{0,400}utilização única/, en: /consent code[\s\S]{0,400}works once/ },
      { spec: 'Explain operator\nreview truthfully', pt: /Ninguém espera: o Banzami cria o negócio/, en: /Nobody waits: Banzami creates the Business/ },
      { spec: 'No auto-KYB fiction', pt: /É uma entidade de teste — não é verificada/, en: /It is a test entity — not verified/ },
    ],
  },
  DOCS_API_KEYS_COMPLETE: {
    section: 7, heading: 'API KEYS',
    items: [
      { spec: 'name', pt: /Nome — identifica a chave/, en: /Name — identifies the key/ },
      { spec: 'scopes', pt: /Scopes — definidos na criação e imutáveis/, en: /Scopes — set at creation and immutable/ },
      { spec: 'reveal once', pt: /Segredo — (começa por bz_test_sk_ e é )?mostrado uma única vez/, en: /Secret — (starts with bz_test_sk_ and is )?shown once/ },
      { spec: 'rotation', pt: /Rodar — cria a chave sucessora e revoga a anterior/, en: /Rotate — creates the successor and revokes the previous key/ },
      { spec: 'revocation', pt: /Revogar — imediato/, en: /Revoke — immediate/ },
      { spec: 'last use', pt: /Última utilização/, en: /Last used/ },
      { spec: 'server-side-only storage', pt: /Mantenha a chave secreta no servidor/, en: /Keep the secret key on your server/ },
      { spec: 'Sandbox key semantics', pt: /bz_test_sk_/, en: /bz_test_sk_/ },
      { spec: 'Live fail-closed status', pt: /bz_live_[\s\S]{0,60}recusad/, en: /bz_live_[\s\S]{0,60}refused/ },
    ],
  },
  DOCS_WEBHOOKS_COMPLETE: {
    section: 7, heading: 'WEBHOOKS',
    items: [
      { spec: 'endpoint lifecycle', pt: /Configurar um endpoint, passo a passo/, en: /Set up an endpoint, step by step/ },
      { spec: 'signing secret', pt: /devolve o segredo de assinatura uma única vez/, en: /the signing secret is returned once/ },
      { spec: 'delivery activity', pt: /cada evento mostra as entregas/, en: /each event shows its deliveries/ },
      { spec: 'disable/re-enable', pt: /A reativação aplica-se aos eventos seguintes/, en: /Re-enabling applies to the events that follow/ },
      { spec: 'rotation', pt: /A troca é imediata/, en: /The switch is immediate/ },
      { spec: 'retries', pt: /Depois da quinta falha/, en: /After the fifth failure/ },
      { spec: 'troubleshooting', pt: /O webhook não chega/, en: /Webhook not arriving/ },
    ],
  },
  DOCS_CONSOLE_COMPLETE: {
    section: 7, heading: 'ACCOUNT',
    // The Console counter is the account surface plus every other Console
    // counter above; check-docs-coverage folds them in.
    includes: ['DOCS_WORKSPACE_COMPLETE', 'DOCS_PROJECT_COMPLETE', 'DOCS_FINANCIAL_SETUP_COMPLETE', 'DOCS_API_KEYS_COMPLETE', 'DOCS_WEBHOOKS_COMPLETE'],
    items: [
      { spec: 'personal account', pt: /A conta pessoal fica em/, en: /Your personal account is at/ },
      { spec: 'profile', pt: /Perfil — o nome/, en: /Profile — the name/ },
      { spec: 'security', pt: /Segurança — descreve o modelo de autenticação/, en: /Security — describes how sign-in works/ },
      { spec: 'sessions', pt: /Sessões — as sessões abertas/, en: /Sessions — open sessions/ },
      { spec: 'preferences if they truly exist', pt: /Não há palavra-passe nem MFA para configurar/, en: /There is no password or MFA to configure/ },
      { spec: 'logout', pt: /Sair — pede confirmação/, en: /Sign out — asks for confirmation/ },
      { spec: 'developer integration/API activity', pt: /Registos — cada pedido feito com as chaves do projeto/, en: /Logs — every request made with the project’s keys/ },
    ],
  },
  DOCS_PAYMENT_SESSIONS_COMPLETE: {
    section: 25, heading: null,
    items: [
      { spec: 'Payment Session', pt: /POST \/v1\/payment-sessions|method: 'POST',\s*path: '\/v1\/payment-sessions'/, en: /POST \/v1\/payment-sessions|method: 'POST',\s*path: '\/v1\/payment-sessions'/ },
      { spec: 'Use current canonical vocabulary only', pt: /code: 'ACTIVE'[\s\S]{0,200}code: 'PAID'|"status": "ACTIVE"/, en: /"status": "ACTIVE"/ },
      { spec: 'Do not invent\ngeneric CREATED→PAID state\nnames', pt: /getPaymentSession passa a[\s\S]{0,30}PAID|getPaymentSession/, en: /getPaymentSession/ },
    ],
  },
  DOCS_PAYMENT_LINKS_COMPLETE: {
    section: 25, heading: null,
    items: [
      { spec: 'Payment Link', pt: /POST \/v1\/payment-links/, en: /POST \/v1\/payment-links/ },
      { spec: 'Separate where necessary', pt: /LINK_NOT_ACTIVE/, en: /LINK_NOT_ACTIVE/ },
    ],
  },
  DOCS_QR_PAYMENTS_COMPLETE: {
    section: 24, heading: null,
    items: [
      { spec: 'what developer creates', pt: /DYNAMIC_QR/, en: /DYNAMIC_QR/ },
      { spec: 'what payer scans', pt: /QR que codifica o mesmo endereço|O QR codifica o mesmo endereço/, en: /QR code that encodes the same address|The QR code encodes the same address/ },
      { spec: 'what happens next', pt: /O doador paga numa página do Banzami/, en: /The donor pays on a Banzami page/ },
      { spec: 'how result is observed', pt: /a confirmação chega pelo webhook, ou lendo a sessão no servidor/, en: /the confirmation arrives by webhook, or by reading the session on the server/ },
    ],
  },
  DOCS_REFUNDS_COMPLETE: {
    section: 26, heading: null,
    items: [
      { spec: 'eligible payment sources', pt: /ACQUIRING_PAYMENT, para pagamentos por trilho externo/, en: /ACQUIRING_PAYMENT for payments over an external rail/ },
      { spec: 'partial refund', pt: /Parciais: pode fazer vários reembolsos/, en: /Partial refunds: you can make several refunds/ },
      { spec: 'full refund', pt: /a totalidade ou parte/, en: /all or part/ },
      { spec: 'cumulative limit', pt: /até ao total recebido/, en: /up to the amount received/ },
      { spec: 'currency', pt: /Moeda: tem de ser a do pagamento/, en: /Currency: must be the payment’s currency/ },
      { spec: 'idempotency', pt: /devolve o reembolso original em vez de devolver o valor duas vezes/, en: /returns the original refund instead of refunding twice/ },
      { spec: 'receipt/proof transition where applicable', pt: /o comprovativo passa a REVERSED/, en: /its receipt becomes REVERSED/ },
      { spec: 'webhook/event behaviour', pt: /refund\.completed/, en: /refund\.completed/ },
    ],
  },
  DOCS_SETTLEMENTS_COMPLETE: {
    section: 27, heading: null,
    items: [
      { spec: 'payment ≠ settlement', pt: /Do pagador para a sua conta[\s\S]{0,60}Da sua conta para o beneficiário/, en: /From the payer to your account[\s\S]{0,60}From your account to the beneficiary/ },
      { spec: 'who controls settlement', pt: /Não\. Só acontece quando a pede/, en: /No\. It happens only when you request it/ },
      { spec: 'source account', pt: /sourceAccountId/, en: /sourceAccountId/ },
      { spec: 'beneficiary', pt: /beneficiaryBanzaName/, en: /beneficiaryBanzaName/ },
      { spec: 'fee destination', pt: /feeDestinationBanzaName/, en: /feeDestinationBanzaName/ },
      { spec: 'operator-governed pricing', pt: /perfil de preço atribuído pelo Banzami ao seu Business/, en: /pricing profile Banzami assigned to your Business/ },
      { spec: 'developer cannot choose pricing rate', pt: /um campo de preço no pedido responde 400 PRICING_FIELD_NOT_ACCEPTED/, en: /a pricing field in the request returns 400 PRICING_FIELD_NOT_ACCEPTED/ },
      { spec: '-100000 + 2000 + 98000 = 0', pt: /-100000 \+ 2000 \+ 98000 = 0/, en: /-100000 \+ 2000 \+ 98000 = 0/ },
    ],
  },
  DOCS_RECEIPTS_COMPLETE: {
    section: 28, heading: null,
    items: [
      { spec: 'receipt reference', pt: /referência pública/, en: /public reference/ },
      { spec: 'SECURE_V1 public-proof reference format', pt: /SECURE_V1/, en: /SECURE_V1/ },
      { spec: 'QR verification', pt: /O QR do comprovativo abre/, en: /The receipt’s QR code opens/ },
      { spec: 'public verifier', pt: /banzami\.com\/r\//, en: /banzami\.com\/r\// },
      { spec: 'PDF evidence', pt: /PDF do comprovativo/, en: /receipt PDF/ },
      { spec: 'public verifier as canonical verification truth', pt: /\/v1\/public\/proofs\//, en: /\/v1\/public\/proofs\// },
      { spec: 'exact-reference behaviour', pt: /Copie a referência, não a reescreva/, en: /Copy the reference; do not retype it/ },
      { spec: 'no normalization', pt: /sem normalização|Não há normalização/, en: /no normalisation|There is no normalisation/ },
      { spec: 'reversed/refunded state where relevant', pt: /REVERSED/, en: /REVERSED/ },
      { spec: 'verified', pt: /Verificado\./, en: /Verified\./ },
      { spec: 'not found', pt: /NOT_FOUND/, en: /NOT_FOUND/ },
      { spec: 'temporarily unavailable', pt: /temporariamente indisponível/, en: /temporarily unavailable/ },
    ],
  },
};
