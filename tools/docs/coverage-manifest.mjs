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
      { spec: 'what Workspace represents', pt: /workspace é a fronteira de acesso|Um workspace é quem tem acesso/, en: /workspace is the access boundary|A workspace is who has access/ },
      { spec: 'membership', pt: /Uma pessoa é membro de vários workspaces/, en: /A person belongs to several workspaces/ },
      { spec: 'roles', pt: /Owner \(Proprietário\)[\s\S]{0,600}Viewer \(Observador\)/, en: /Owner[\s\S]{0,400}Viewer/ },
      { spec: 'ownership', pt: /O último owner não pode sair/, en: /last owner cannot leave/i },
      { spec: 'invites', pt: /Convidar gera um link/, en: /Inviting produces a link/ },
      { spec: 'leave Workspace', pt: /Sair de um workspace/, en: /Leaving a workspace/ },
      { spec: 'ownership transfer', pt: /Transferir a propriedade/, en: /Transferring ownership/ },
      { spec: 'hard-delete conditions', pt: /Apagar só é possível se o workspace estiver realmente vazio/, en: /Deleting is only possible when the workspace is genuinely empty/ },
      { spec: 'archive conditions', pt: /Arquivar um workspace é recusado enquanto tiver projetos ativos/, en: /Archiving a workspace is refused while it still has active projects/ },
      { spec: 'Workspace Activity = administrative\nmembership/ownership audit', pt: /Atividade do workspace[\s\S]{0,300}registo administrativo/, en: /Workspace activity[\s\S]{0,300}administrative record/i },
      { spec: 'Do not confuse the two', pt: /Atividade não é Registos/, en: /Activity is not Logs/ },
    ],
  },
  DOCS_PROJECT_COMPLETE: {
    section: 7, heading: 'PROJECT',
    items: [
      { spec: 'purpose', pt: /O projeto é a unidade de integração/, en: /The project is the unit of integration/ },
      { spec: 'stable Project ID', pt: /O Project ID não muda/, en: /The Project ID does not change/ },
      { spec: 'environment', pt: /environment: SANDBOX|"environment": "SANDBOX"/, en: /environment: SANDBOX|"environment": "SANDBOX"/ },
      { spec: 'rename', pt: /Renomear altera a etiqueta/, en: /Renaming changes the label/ },
      { spec: 'delete empty Project', pt: /Apagar é possível enquanto o projeto não tiver história/, en: /Deleting is possible while the project has no history/ },
      { spec: 'archive financial/historical Project', pt: /Arquivar é o que se faz a um projeto que teve história/, en: /Archiving is what you do to a project that had history/ },
    ],
  },
  DOCS_FINANCIAL_SETUP_COMPLETE: {
    section: 7, heading: 'FINANCIAL SETUP',
    items: [
      { spec: 'why it exists', pt: /um projeto ganha um titular financeiro/, en: /a project gains a financial owner/ },
      { spec: 'Project → Financial Setup → Business → financial authority', pt: /A autoridade desce, nunca sobe/, en: /Authority flows down, never up/ },
      { spec: 'A. new Business application', pt: /Business novo\. Submete uma candidatura/, en: /A new Business\. You submit an application/ },
      { spec: 'B. connect existing Business with single-use consent code', pt: /código de consentimento[\s\S]{0,200}uso único/, en: /consent code[\s\S]{0,200}single-use/ },
      { spec: 'Explain operator\nreview truthfully', pt: /o Banzami verifica-a\. É uma decisão humana/, en: /Banzami verifies it\. It is a human decision/ },
      { spec: 'No auto-KYB fiction', pt: /revisto pelo Banzami antes de poder receber/, en: /reviewed by Banzami before it can receive/ },
    ],
  },
  DOCS_API_KEYS_COMPLETE: {
    section: 7, heading: 'API KEYS',
    items: [
      { spec: 'name', pt: /O nome é seu: distingue a chave/, en: /The name is yours: it tells the key apart/ },
      { spec: 'scopes', pt: /Os scopes escolhem-se na criação e não mudam/, en: /Scopes are chosen at creation and do not change/ },
      { spec: 'reveal once', pt: /O segredo aparece uma única vez/, en: /The secret appears exactly once/ },
      { spec: 'rotation', pt: /Rodar cria a sucessora e revoga a anterior/, en: /Rotating creates the successor and revokes the predecessor/ },
      { spec: 'revocation', pt: /Revogar é imediato/, en: /Revoking is immediate/ },
      { spec: 'last use', pt: /última utilização/, en: /last use/ },
      { spec: 'server-side-only storage', pt: /A chave secreta é do servidor/, en: /The secret key belongs to the server/ },
      { spec: 'Sandbox key semantics', pt: /bz_test_sk_/, en: /bz_test_sk_/ },
      { spec: 'Live fail-closed status', pt: /bz_live_[\s\S]{0,40}recusadas fail-closed/, en: /bz_live_ keys are rejected fail-closed/ },
    ],
  },
  DOCS_WEBHOOKS_COMPLETE: {
    section: 7, heading: 'WEBHOOKS',
    items: [
      { spec: 'endpoint lifecycle', pt: /Gerir o endpoint com a sua chave de projeto/, en: /Manage the endpoint with your project key/ },
      { spec: 'signing secret', pt: /devolve o segredo de assinatura uma única vez/, en: /returns the signing secret exactly once/ },
      { spec: 'delivery activity', pt: /abrir um evento mostra as suas entregas/, en: /opening one shows its deliveries/ },
      { spec: 'disable/re-enable', pt: /reativar volta a recebê-los/, en: /re-enabling starts receiving again/ },
      { spec: 'rotation', pt: /A rotação é imediata, não sobreposta/, en: /Rotation is immediate, not overlapping/ },
      { spec: 'retries', pt: /até 5 tentativas/, en: /up to 5 attempts/ },
      { spec: 'troubleshooting', pt: /O webhook não chega/, en: /The webhook never arrives/ },
    ],
  },
  DOCS_CONSOLE_COMPLETE: {
    section: 7, heading: 'ACCOUNT',
    // The Console counter is the account surface plus every other Console
    // counter above; check-docs-coverage folds them in.
    includes: ['DOCS_WORKSPACE_COMPLETE', 'DOCS_PROJECT_COMPLETE', 'DOCS_FINANCIAL_SETUP_COMPLETE', 'DOCS_API_KEYS_COMPLETE', 'DOCS_WEBHOOKS_COMPLETE'],
    items: [
      { spec: 'personal account', pt: /O seu perfil pessoal, em/, en: /Your personal profile, at/ },
      { spec: 'profile', pt: /Perfil — o nome/, en: /Profile — the name/ },
      { spec: 'security', pt: /Segurança — descreve o modelo real/, en: /Security — describes the real model/ },
      { spec: 'sessions', pt: /Sessões — as sessões abertas/, en: /Sessions — your open sessions/ },
      { spec: 'preferences if they truly exist', pt: /Não há controlos de palavra-passe nem de MFA porque não existe/, en: /no password or MFA controls because neither exists/ },
      { spec: 'logout', pt: /Sair — pede confirmação/, en: /Sign out — asks for confirmation/ },
      { spec: 'developer integration/API activity', pt: /Registos lista os pedidos que a sua chave fez à API/, en: /Logs lists the requests your key made to the API/ },
    ],
  },
  DOCS_PAYMENT_SESSIONS_COMPLETE: {
    section: 25, heading: null,
    items: [
      { spec: 'Payment Session', pt: /POST \/v1\/payment-sessions/, en: /POST \/v1\/payment-sessions/ },
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
      { spec: 'what payer scans', pt: /QR que codifica esse mesmo endereço/, en: /QR that encodes the same address/ },
      { spec: 'what happens next', pt: /O doador paga numa página do Banzami/, en: /The donor pays on a Banzami page/ },
      { spec: 'how result is observed', pt: /a confirmação chega pelo webhook, ou lendo a sessão no servidor/, en: /confirmation arrives on the webhook, or by reading the session on the server/ },
    ],
  },
  DOCS_REFUNDS_COMPLETE: {
    section: 26, heading: null,
    items: [
      { spec: 'eligible payment sources', pt: /ACQUIRING_PAYMENT — pagamento realizado por um trilho externo/, en: /ACQUIRING_PAYMENT — payment made over an external rail/ },
      { spec: 'partial refund', pt: /Reembolsos parciais são permitidos/, en: /Partial refunds are allowed/ },
      { spec: 'full refund', pt: /reembolsos totais e parciais|totalmente ou parcialmente|total ou parcialmente/i, en: /full and partial refunds|fully or partially/i },
      { spec: 'cumulative limit', pt: /limite acumulado/, en: /accrued cap|cumulative cap/ },
      { spec: 'currency', pt: /A moeda é confirmada contra a origem original/, en: /currency is validated against the original source/i },
      { spec: 'idempotency', pt: /Repetir a mesma idempotency_key não devolve valor duas vezes/, en: /Reusing the same idempotency_key does not refund twice/ },
      { spec: 'receipt/proof transition where applicable', pt: /passa a REVERSED/, en: /it becomes REVERSED/ },
      { spec: 'webhook/event behaviour', pt: /refund\.completed/, en: /refund\.completed/ },
    ],
  },
  DOCS_SETTLEMENTS_COMPLETE: {
    section: 27, heading: null,
    items: [
      { spec: 'payment ≠ settlement', pt: /Pagamento não é liquidação/, en: /A payment is not a settlement/ },
      { spec: 'who controls settlement', pt: /O DOA pede-a depois de a campanha encerrar — não acontece sozinha/, en: /DOA requests it after the campaign closes — it does not happen on its own/ },
      { spec: 'source account', pt: /sourceAccountId/, en: /sourceAccountId/ },
      { spec: 'beneficiary', pt: /beneficiaryBanzaName/, en: /beneficiaryBanzaName/ },
      { spec: 'fee destination', pt: /feeDestinationBanzaName/, en: /feeDestinationBanzaName/ },
      { spec: 'operator-governed pricing', pt: /perfil de preço que o Banzami atribuiu à sua\s+empresa/, en: /pricing profile Banzami assigned to\s+your business/ },
      { spec: 'developer cannot choose pricing rate', pt: /A taxa não é escolhida por si/, en: /The fee is not yours to choose/ },
      { spec: '-100000 + 2000 + 98000 = 0', pt: /-100000 \+ 2000 \+ 98000 = 0/, en: /-100000 \+ 2000 \+ 98000 = 0/ },
    ],
  },
  DOCS_RECEIPTS_COMPLETE: {
    section: 28, heading: null,
    items: [
      { spec: 'receipt reference', pt: /referência de prova pública|referência pública/, en: /public proof reference/ },
      { spec: 'SECURE_V1 public-proof reference format', pt: /SECURE_V1/, en: /SECURE_V1/ },
      { spec: 'QR verification', pt: /O QR do comprovativo abre/, en: /The receipt’s QR opens/ },
      { spec: 'public verifier', pt: /banzami\.com\/r\//, en: /banzami\.com\/r\// },
      { spec: 'PDF evidence', pt: /comprovativo em PDF|O comprovativo PDF/, en: /PDF receipt/ },
      { spec: 'public verifier as canonical verification truth', pt: /\/v1\/public\/proofs\//, en: /\/v1\/public\/proofs\// },
      { spec: 'exact-reference behaviour', pt: /É exacta|é exacta/, en: /It is exact|is exact/ },
      { spec: 'no normalization', pt: /sem normalização|Não há normalização/, en: /no normalisation|There is no normalisation/ },
      { spec: 'reversed/refunded state where relevant', pt: /REVERSED/, en: /REVERSED/ },
      { spec: 'verified', pt: /Verificado\./, en: /Verified\./ },
      { spec: 'not found', pt: /NOT_FOUND/, en: /NOT_FOUND/ },
      { spec: 'temporarily unavailable', pt: /temporariamente indisponível/, en: /temporarily unavailable/ },
    ],
  },
};
