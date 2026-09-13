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
    term: 'Produção',
    def: 'Ambiente destinado a operações com dinheiro real quando a plataforma estiver habilitada.',
  },
  {
    id: 'ledger',
    term: 'Ledger',
    def: 'Registo financeiro que mantém cada débito e crédito associado a uma transação, preservando a integridade do saldo.',
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
    def: 'Header de assinatura do protocolo BANZA usado pelo Banzami para confirmar que um webhook é autêntico e não foi alterado.',
  },
  {
    id: 'hmac-sha256',
    term: 'HMAC-SHA256',
    def: 'Método de assinatura usado para verificar a origem e a integridade de um evento recebido.',
  },
  {
    id: 'otp',
    term: 'OTP',
    def: 'Código temporário usado para confirmar que controla o email ou contacto utilizado no acesso.',
  },
  {
    id: 'conta-business',
    term: 'Conta Business',
    def: 'Conta Banzami usada por uma organização para operar integrações, receber valores e gerir a sua atividade na plataforma.',
  },
  {
    id: 'liquidacao',
    term: 'Liquidação',
    def: 'Processo pelo qual valores confirmados são apurados e tratados segundo as regras do operador.',
  },
  {
    id: 'banza-handle',
    term: '@banza',
    code: true,
    def: 'Identificador público de uma conta Banzami usado para receber transferências.',
  },
  {
    id: 'api-key',
    term: 'API key',
    def: 'Credencial usada por uma aplicação para se autenticar perante uma integração Banzami.',
  },
  {
    id: 'chave-publicavel',
    term: 'Chave publicável',
    def: 'Identificador que pode ser usado no cliente quando o fluxo o permite; não substitui uma chave secreta.',
  },
  {
    id: 'chave-secreta',
    term: 'Chave secreta',
    def: 'Credencial reservada ao servidor da aplicação. Nunca deve ser exposta no browser, app móvel, repositórios, logs ou capturas de ecrã.',
  },
  {
    id: 'replay',
    term: 'Replay',
    def: 'Nova entrega ou repetição de um pedido/evento já recebido. A idempotência impede que produza efeitos duplicados.',
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
    def: 'Código visual que abre uma jornada de pagamento Banzami ou identifica uma operação de forma rápida.',
  },
  {
    id: 'sessao-pagamento',
    term: 'Sessão de pagamento',
    def: 'Representação de uma tentativa de pagamento associada a uma referência da sua aplicação.',
  },
  {
    id: 'comprovativo',
    term: 'Comprovativo',
    def: 'Registo emitido após uma operação confirmada, com os dados necessários para consulta e verificação.',
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
    def: 'A ligação entre um projeto e o Business que recebe o seu dinheiro. Sem ela, o projeto não recebe pagamentos.',
  },
  {
    id: 'business',
    term: 'Business',
    def: 'A entidade legal verificada pelo Banzami que é dona do dinheiro que um projeto recebe.',
  },
  {
    id: 'wallet-account',
    term: 'Wallet account',
    def: 'Uma conta dentro da carteira de um Business, para separar valor — por exemplo uma por campanha.',
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
    def: 'Um movimento de valor registado no livro-razão — um pagamento, um reembolso ou uma transferência.',
  },
  {
    id: 'unidades-menores',
    term: 'Unidades menores',
    def: 'A forma como os montantes viajam na API: inteiros, em que 100 unidades menores são 1 Kz. Nunca decimais.',
  },
];

export const GLOSSARY_BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(
  GLOSSARY.map((e) => [e.id, e]),
);
