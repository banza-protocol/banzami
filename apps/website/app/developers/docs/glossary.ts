// Canonical glossary for the Banzami Developers documentation.
//
// SINGLE SOURCE OF TRUTH: every contextual definition (inline popovers) and the
// Conceitos section read from this array, so wording stays consistent. Keep each
// definition concise, plain-language and contextual to Banzami — it explains why
// the term matters, not an abstract dictionary entry.
//
// `id`   — stable anchor slug; the Conceitos section renders `glossario-<id>`
//          (internal per-term anchor, kept for deep-link back-compat) and the
//          popover's "Ver nos conceitos" link deep-links to it.
// `code` — render the trigger + heading in monospace (for header/handle-like terms).

export type GlossaryEntry = {
  id: string;
  term: string;
  def: string;
  code?: boolean;
};

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'sandbox',
    term: 'Sandbox',
    def: 'Ambiente de testes que permite validar integrações Banzami sem movimentar dinheiro real.',
  },
  {
    id: 'producao',
    term: 'Financial Live',
    def: 'O ambiente de dinheiro real. Não está disponível: o Sandbox é o único ambiente.',
  },
  {
    id: 'ledger',
    term: 'Ledger',
    def: 'O registo contabilístico do Banzami: cada débito e crédito de cada transação, de onde derivam os saldos.',
  },
  {
    id: 'idempotencia',
    term: 'Idempotência',
    def: 'Garantia de que repetir o mesmo pedido não cria uma segunda transferência, pagamento ou efeito financeiro.',
  },
  {
    id: 'webhook',
    term: 'Webhook',
    def: 'Notificação enviada pelo Banzami diretamente para o servidor da sua aplicação quando um evento acontece.',
  },
  {
    id: 'banza-signature',
    term: 'banza-signature',
    code: true,
    def: 'O header com a assinatura de cada entrega de webhook. Verificá-lo confirma que a entrega vem do Banzami e não foi alterada.',
  },
  {
    id: 'hmac-sha256',
    term: 'HMAC-SHA256',
    def: 'O algoritmo da assinatura dos webhooks, calculada com o segredo do endpoint.',
  },
  {
    id: 'otp',
    term: 'OTP',
    def: 'O código de seis dígitos, enviado por email, com que entra na Consola.',
  },
  {
    id: 'conta-business',
    term: 'Conta Business',
    def: 'A conta Banzami de uma organização, usada para receber pagamentos e gerir a sua atividade.',
  },
  {
    id: 'liquidacao',
    term: 'Liquidação',
    def: 'A transferência do saldo de uma conta para um beneficiário, com a taxa definida pelo Banzami. Só acontece quando a aplicação a pede.',
  },
  {
    id: 'banza-handle',
    term: '@banza',
    code: true,
    def: 'Identificador público de uma conta Banzami usado para receber transferências.',
  },
  {
    id: 'api-key',
    term: 'Chave de API',
    def: 'A credencial com que uma aplicação se autentica na API do Banzami. Identifica um projeto.',
  },
  {
    id: 'chave-publicavel',
    term: 'Chave publicável',
    def: 'Uma chave bz_test_pk_ que pode ser usada no cliente, apenas para leitura. Não substitui a chave secreta.',
  },
  {
    id: 'chave-secreta',
    term: 'Chave secreta',
    def: 'Uma chave bz_test_sk_, reservada ao servidor. Nunca deve estar no browser, numa app móvel ou num repositório.',
  },
  {
    id: 'replay',
    term: 'Replay',
    def: 'Uma nova entrega de um evento ou a repetição de um pedido. A idempotência impede efeitos duplicados.',
  },
  {
    id: 'at-least-once',
    term: 'At-least-once',
    code: true,
    def: 'Modelo de entrega em que um evento pode ser enviado mais de uma vez; o seu servidor deve processá-lo de forma idempotente.',
  },
  {
    id: 'qr',
    term: 'QR',
    def: 'O código que abre a página de pagamento de uma sessão quando lido com a câmara ou a app Banzami.',
  },
  {
    id: 'sessao-pagamento',
    term: 'Sessão de pagamento',
    def: 'Um pedido de pagamento associado a uma referência da sua aplicação, com link e QR.',
  },
  {
    id: 'comprovativo',
    term: 'Comprovativo',
    def: 'O documento de um pagamento confirmado, com uma referência BZM-… verificável publicamente.',
  },
  {
    id: 'workspace',
    term: 'Workspace',
    def: 'O grupo de pessoas com acesso a um conjunto de projetos, com papéis (Owner, Admin, Developer, Finance, Viewer).',
  },
  {
    id: 'projeto',
    term: 'Projeto',
    def: 'Uma aplicação integrada: as suas chaves, webhooks e registos. O Project ID não muda quando o nome muda.',
  },
  {
    id: 'configuracao-financeira',
    term: 'Configuração financeira',
    def: 'A ligação entre um projeto e o Business que recebe os seus pagamentos. Sem ela, o projeto não recebe pagamentos.',
  },
  {
    id: 'business',
    term: 'Business',
    def: 'A entidade verificada pelo Banzami que recebe os pagamentos de um projeto.',
  },
  {
    id: 'wallet-account',
    term: 'Conta (wallet account)',
    def: 'Uma conta dentro da carteira de um Business, para separar valores — por exemplo, uma por campanha.',
  },
  {
    id: 'link-pagamento',
    term: 'Link de pagamento',
    def: 'Um endereço em pay.banzami.com onde o pagador paga; pode ter montante fixo ou aberto.',
  },
  {
    id: 'reembolso',
    term: 'Reembolso',
    def: 'A devolução, total ou parcial, de um pagamento confirmado, a partir da conta que o recebeu.',
  },
  {
    id: 'transacao',
    term: 'Transação',
    def: 'Um movimento de valor registado no ledger: um pagamento, um reembolso ou uma transferência.',
  },
  {
    id: 'unidades-menores',
    term: 'Unidades menores',
    def: 'O formato dos montantes na API: inteiros, em que 100 unidades menores são 1 Kz. Nunca decimais.',
  },
  {
    id: 'amount-minor',
    term: 'amount_minor',
    code: true,
    def: 'O campo de montante da API, em unidades menores: 25000 são 250 Kz.',
  },
];

export const GLOSSARY_BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(
  GLOSSARY.map((e) => [e.id, e]),
);
