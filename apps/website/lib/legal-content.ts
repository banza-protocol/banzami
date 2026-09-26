// Canonical legal content for the Public Beta Sandbox — Terms of Service and
// Privacy Policy. Single source of truth: /termos and /privacidade render this
// through the frozen docPage layout, and lib/terms.ts pins the version + a
// content hash computed over this module (see legal-content.test.ts).
//
// Scope: PUBLIC BETA SANDBOX only. No real money, no settlement, no real-money
// operations. Nothing here claims Banzami is a licensed/regulated financial
// institution. Sources: docs/legal/BETA-LEGAL-SOURCES.md. Data reality:
// docs/legal/BETA-DATA-MAP.md + docs/legal/SUBPROCESSORS.md.

export type Loc = { pt: string; en: string };
export type Block = { p: Loc } | { ul: Loc[] };
export type LegalSection = { id: string; n: string; title: Loc; body: Block[] };

// Version history (immutable once published):
//   2026-09-beta.1 — initial same-day publication (operator name + contact).
//   2026-09-beta.2 — complete legal-entity identification (NIF + registered
//                    seat) woven into §01 of both documents. See
//                    docs/legal/LEGAL-CHANGELOG.md.
//   2026-09-beta.3 — editorial terminology normalization: the public term
//                    "Financial Live" replaced by "operações com dinheiro real"
//                    / "real-money operations". Meaning preserved (real money
//                    remains unavailable); reacceptance not forced.
/** Immutable once published. Bump on any material change (see reacceptance). */
export const TERMS_VERSION = '2026-09-beta.3';
export const PRIVACY_VERSION = '2026-09-beta.3';
/** ISO date the Beta legal documents take effect / were published. */
export const LEGAL_EFFECTIVE_DATE = '2026-09-26';

/** Operator identity — from the AGT taxpayer registration (NIF 5003208729) and
 *  the company statutes (sociedade por quotas). Registered seat and NIF are the
 *  company's own public identification; personal data of the shareholders is
 *  never placed here. */
export const OPERATOR_NAME = 'BANZAMI – Tecnologia e Serviços, Lda.';
export const OPERATOR_NIF = '5003208729';
export const OPERATOR_ADDRESS: Loc = {
  pt: 'Rua Avenida 21 de Janeiro, Bairro Morro Bento, Município da Samba, Luanda, Angola',
  en: 'Rua Avenida 21 de Janeiro, Bairro Morro Bento, Samba Municipality, Luanda, Angola',
};
export const OPERATOR_CONTACT = 'contact@banzami.com';
export const OPERATOR_SECURITY = 'security@banzami.com';
export const OPERATOR_JURISDICTION: Loc = { pt: 'Angola', en: 'Angola' };

const p = (pt: string, en: string): Block => ({ p: { pt, en } });
const ul = (items: [string, string][]): Block => ({ ul: items.map(([pt, en]) => ({ pt, en })) });

// ─────────────────────────────────────────────────────────────────────────
// TERMS OF SERVICE — Banzami Beta Sandbox
// ─────────────────────────────────────────────────────────────────────────
export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'identificacao', n: '01', title: { pt: 'Identificação do operador', en: 'Who we are' },
    body: [
      p(
        `Estes Termos de Serviço («Termos») são disponibilizados por ${OPERATOR_NAME} («Banzami», «nós»), sociedade por quotas de direito angolano, com o NIF ${OPERATOR_NIF} e sede na ${OPERATOR_ADDRESS.pt}, operadora de referência da rede de pagamentos aberta BANZA.`,
        `These Terms of Service ("Terms") are provided by ${OPERATOR_NAME} ("Banzami", "we"), a private limited company incorporated under Angolan law, tax number (NIF) ${OPERATOR_NIF}, with registered office at ${OPERATOR_ADDRESS.en}, the reference operator of the open BANZA payment network.`,
      ),
      p(
        `Contacto geral e jurídico: ${OPERATOR_CONTACT}. Comunicações de segurança: ${OPERATOR_SECURITY}.`,
        `General and legal contact: ${OPERATOR_CONTACT}. Security reports: ${OPERATOR_SECURITY}.`,
      ),
      p(
        'O Banzami não é, nesta fase, uma instituição financeira, um prestador de serviços de pagamento licenciado nem uma entidade regulada, e não faz qualquer afirmação nesse sentido.',
        'At this stage Banzami is not a financial institution, a licensed payment service provider or a regulated entity, and makes no such claim.',
      ),
    ],
  },
  {
    id: 'ambito', n: '02', title: { pt: 'Âmbito e aceitação', en: 'Scope and acceptance' },
    body: [
      p(
        'Estes Termos regem a utilização da app Banzami, do Banzami Business, da plataforma para developers, das APIs, SDKs e do website, no âmbito da Beta pública em ambiente Sandbox. Ao criar uma conta ou ao utilizar estes serviços, aceita estes Termos.',
        'These Terms govern the use of the Banzami app, Banzami Business, the developer platform, the APIs, SDKs and the website, within the public Beta in the Sandbox environment. By creating an account or using these services, you accept these Terms.',
      ),
      p(
        'Se não aceitar estes Termos, não utilize os serviços.',
        'If you do not accept these Terms, do not use the services.',
      ),
    ],
  },
  {
    id: 'beta', n: '03', title: { pt: 'Natureza Beta e disponibilidade', en: 'Beta nature and availability' },
    body: [
      p(
        'Os serviços são disponibilizados numa fase Beta, para efeitos de teste, demonstração e recolha de feedback. Podem conter erros, mudar, ser interrompidos ou ser reiniciados a qualquer momento.',
        'The services are provided in a Beta phase, for testing, demonstration and feedback. They may contain errors, change, be interrupted or be reset at any time.',
      ),
      p(
        'Não garantimos disponibilidade permanente, ausência total de erros nem segurança absoluta. Podemos realizar experiências e alterar funcionalidades sem aviso prévio.',
        'We do not guarantee continuous availability, the complete absence of errors or absolute security. We may run experiments and change features without prior notice.',
      ),
    ],
  },
  {
    id: 'sandbox', n: '04', title: { pt: 'Sandbox e dinheiro fictício', en: 'Sandbox and test money' },
    body: [
      p(
        'Toda a atividade decorre em ambiente Sandbox, com dinheiro fictício destinado a testes.',
        'All activity takes place in the Sandbox environment, with test money intended for testing.',
      ),
      ul([
        ['O dinheiro de teste não é moeda nem moeda com curso legal.', 'Test money is not currency or legal tender.'],
        ['Não é moeda eletrónica nem representa um saldo financeiro real.', 'It is not electronic money and does not represent a real financial balance.'],
        ['Não tem valor monetário e não pode ser levantado nem convertido.', 'It has no monetary value and cannot be withdrawn or converted.'],
        ['Pode ser reiniciado ou removido a qualquer momento como parte dos testes.', 'It may be reset or removed at any time as part of testing.'],
      ]),
      p(
        'Nenhum saldo, comprovativo ou transação em Sandbox representa uma obrigação financeira do Banzami ou de terceiros.',
        'No Sandbox balance, receipt or transaction represents a financial obligation of Banzami or any third party.',
      ),
    ],
  },
  {
    id: 'financial-live', n: '05', title: { pt: 'Operações com dinheiro real indisponíveis', en: 'Real-money operations unavailable' },
    body: [
      p(
        'As operações com dinheiro real — a movimentação de dinheiro real — não estão disponíveis e estão fora do âmbito destes Termos.',
        'Real-money operations — the movement of real money — are not available and are out of scope of these Terms.',
      ),
      p(
        'Não realizamos liquidação, transferências financeiras reais nem levantamentos. Caso as operações com dinheiro real venham a ser lançadas, terão termos e condições próprios.',
        'We do not perform settlement, real financial transfers or withdrawals. Should real-money operations ever launch, they will have their own terms and conditions.',
      ),
    ],
  },
  {
    id: 'elegibilidade', n: '06', title: { pt: 'Elegibilidade', en: 'Eligibility' },
    body: [
      p(
        'Deve ter capacidade legal para aceitar estes Termos. Se utilizar os serviços em nome de um negócio, declara ter poderes para o vincular.',
        'You must have the legal capacity to accept these Terms. If you use the services on behalf of a business, you represent that you are authorised to bind it.',
      ),
    ],
  },
  {
    id: 'conta', n: '07', title: { pt: 'Conta, @banza e segurança', en: 'Account, @banza and security' },
    body: [
      p(
        'Cada conta é uma carteira em Kwanza (de teste, em Sandbox) identificada por um @banza único. É responsável por manter o acesso à sua conta seguro e por toda a atividade realizada com as suas credenciais.',
        'Each account is a Kwanza wallet (test money, in Sandbox) identified by a unique @banza. You are responsible for keeping access to your account secure and for all activity carried out with your credentials.',
      ),
      p(
        'Deve informar-nos sem demora se suspeitar de acesso não autorizado.',
        'You must notify us without delay if you suspect unauthorised access.',
      ),
    ],
  },
  {
    id: 'pin', n: '08', title: { pt: 'PIN, credenciais e autenticação', en: 'PIN, credentials and authentication' },
    body: [
      p(
        'Alguns fluxos usam um PIN ou outros fatores de autenticação. Guarde estes elementos em segredo. Não os partilhe. O PIN é guardado de forma protegida e nunca é apresentado nem registado em texto simples.',
        'Some flows use a PIN or other authentication factors. Keep these secret. Do not share them. The PIN is stored in a protected form and is never displayed or logged in plain text.',
      ),
    ],
  },
  {
    id: 'app', n: '09', title: { pt: 'Utilização da App Banzami', en: 'Using the Banzami app' },
    body: [
      p(
        'A app permite enviar, receber e visualizar pagamentos de teste em Kwanza e gerar comprovativos verificáveis, no âmbito da Sandbox. Os comprovativos referem-se a transações de teste, sem valor financeiro real.',
        'The app lets you send, receive and view test payments in Kwanza and generate verifiable receipts, within the Sandbox. Receipts refer to test transactions, with no real financial value.',
      ),
    ],
  },
  {
    id: 'business', n: '10', title: { pt: 'Utilização por negócios (Banzami Business)', en: 'Business use (Banzami Business)' },
    body: [
      p(
        'Um negócio pode candidatar-se a aceder ao Banzami Business em Sandbox para experimentar cobranças por QR, links e ferramentas de cobrança, com dinheiro de teste. A aprovação de uma candidatura Beta destina-se ao acesso Sandbox e não constitui aprovação para serviços financeiros reais.',
        'A business can apply to access Banzami Business in the Sandbox to try QR charges, links and billing tools, with test money. Approving a Beta application grants Sandbox access and is not an approval for real financial services.',
      ),
      p(
        'Presta informações verdadeiras na candidatura. Recolhemos apenas os dados necessários ao acesso Sandbox (ver Política de Privacidade); a verificação completa de identidade de empresa (KYB) só é exigida para as operações com dinheiro real, que não estão disponíveis.',
        'You must provide truthful information in the application. We collect only the data needed for Sandbox access (see the Privacy Policy); full business identity verification (KYB) is only required for real-money operations, which are not available.',
      ),
    ],
  },
  {
    id: 'developers', n: '11', title: { pt: 'Plataforma para developers', en: 'Developer platform' },
    body: [
      p(
        'O acesso às APIs, SDKs e webhooks está sujeito às chaves emitidas na Consola de Developers e à documentação publicada. As chaves são pessoais e confidenciais. As chaves secretas nunca devem ser usadas em código de cliente (browser, mobile).',
        'Access to the APIs, SDKs and webhooks is subject to the keys issued in the Developer Console and to the published documentation. Keys are personal and confidential. Secret keys must never be used in client code (browser, mobile).',
      ),
      p(
        'É responsável pela utilização feita com as suas chaves e por proteger os segredos e os endpoints de webhook.',
        'You are responsible for the use made with your keys and for protecting your secrets and webhook endpoints.',
      ),
    ],
  },
  {
    id: 'test-data', n: '12', title: { pt: 'Dados de teste', en: 'Test data' },
    body: [
      p(
        'Os dados criados em Sandbox (transações, referências, links, pagadores de teste) destinam-se a testes e podem ser reiniciados ou eliminados. Não coloque dados pessoais reais sensíveis nem dados de terceiros sem base para o fazer em campos de teste.',
        'Data created in the Sandbox (transactions, references, links, test payers) is for testing and may be reset or deleted. Do not place real sensitive personal data or third-party data without a basis to do so in test fields.',
      ),
    ],
  },
  {
    id: 'propriedade', n: '13', title: { pt: 'Propriedade intelectual e licença', en: 'Intellectual property and licence' },
    body: [
      p(
        'O Banzami, as suas marcas, o software, a documentação e o conteúdo são protegidos por direitos de propriedade intelectual. Concedemos-lhe uma licença limitada, pessoal, revogável e não transferível para utilizar os serviços no âmbito destes Termos.',
        'Banzami, its trademarks, software, documentation and content are protected by intellectual property rights. We grant you a limited, personal, revocable and non-transferable licence to use the services within these Terms.',
      ),
      p(
        'Não adquire quaisquer direitos sobre o Banzami além da licença de utilização aqui prevista.',
        'You acquire no rights over Banzami beyond the licence to use granted here.',
      ),
    ],
  },
  {
    id: 'condutas', n: '14', title: { pt: 'Condutas proibidas', en: 'Prohibited conduct' },
    body: [
      ul([
        ['Utilizar os serviços para atividades ilícitas ou fraudulentas.', 'Using the services for unlawful or fraudulent activities.'],
        ['Tentar aceder a contas, dados ou sistemas de terceiros.', 'Attempting to access third-party accounts, data or systems.'],
        ['Interferir com o funcionamento, a integridade ou a segurança dos serviços.', 'Interfering with the operation, integrity or security of the services.'],
        ['Contornar limites de utilização, autenticação ou controlos de segurança.', 'Circumventing usage limits, authentication or security controls.'],
        ['Utilizar o dinheiro de teste como se tivesse valor real ou induzir terceiros em erro.', 'Using test money as if it had real value or misleading third parties.'],
      ]),
    ],
  },
  {
    id: 'seguranca-limites', n: '15', title: { pt: 'Testes de segurança e limites de utilização', en: 'Security testing and usage limits' },
    body: [
      p(
        'Aceitamos comunicações responsáveis de vulnerabilidades em security@banzami.com, nas condições do nosso ficheiro SECURITY. Não realize testes de segurança que degradem o serviço, acedam a dados de terceiros ou violem a lei.',
        'We welcome responsible vulnerability reports at security@banzami.com, under the conditions of our SECURITY file. Do not perform security testing that degrades the service, accesses third-party data or breaks the law.',
      ),
      p(
        'Aplicamos limites de utilização (rate limits) para proteger o serviço. Não os contorne.',
        'We apply usage limits (rate limits) to protect the service. Do not circumvent them.',
      ),
    ],
  },
  {
    id: 'suspensao', n: '16', title: { pt: 'Suspensão e encerramento', en: 'Suspension and termination' },
    body: [
      p(
        'Podemos suspender ou encerrar o acesso, no todo ou em parte, se violar estes Termos, se for necessário para proteger o serviço ou terceiros, ou no termo da fase Beta. Pode encerrar a sua conta a qualquer momento.',
        'We may suspend or terminate access, in whole or in part, if you breach these Terms, where necessary to protect the service or third parties, or at the end of the Beta phase. You may close your account at any time.',
      ),
    ],
  },
  {
    id: 'privacidade', n: '17', title: { pt: 'Dados pessoais e Privacidade', en: 'Personal data and Privacy' },
    body: [
      p(
        'O tratamento de dados pessoais é descrito na Política de Privacidade, que faz parte integrante da sua relação connosco. A Política de Privacidade informa sobre o tratamento; alguns consentimentos específicos, quando necessários, são recolhidos separadamente.',
        'The processing of personal data is described in the Privacy Policy, which forms an integral part of your relationship with us. The Privacy Policy informs you about processing; specific consents, where needed, are collected separately.',
      ),
    ],
  },
  {
    id: 'conteudo-terceiros', n: '18', title: { pt: 'Conteúdo do utilizador e terceiros', en: 'User content and third parties' },
    body: [
      p(
        'É responsável pelo conteúdo e pelos dados que introduz. Os serviços podem conter ligações ou integrações com serviços de terceiros, pelos quais não somos responsáveis e que têm as suas próprias condições.',
        'You are responsible for the content and data you enter. The services may contain links to or integrations with third-party services, for which we are not responsible and which have their own terms.',
      ),
    ],
  },
  {
    id: 'responsabilidade', n: '19', title: { pt: 'Limitação de responsabilidade', en: 'Limitation of liability' },
    body: [
      p(
        'Os serviços são disponibilizados «tal como estão» e «conforme disponíveis» durante a Beta. Na medida máxima permitida pela lei aplicável, não somos responsáveis por danos indiretos, incidentais ou por perda de dados de teste resultante do uso ou da indisponibilidade dos serviços.',
        'The services are provided "as is" and "as available" during the Beta. To the maximum extent permitted by applicable law, we are not liable for indirect or incidental damages or for loss of test data arising from the use or unavailability of the services.',
      ),
      p(
        'Nada nestes Termos exclui ou limita responsabilidades que não possam ser legalmente excluídas ou limitadas.',
        'Nothing in these Terms excludes or limits liability that cannot be lawfully excluded or limited.',
      ),
    ],
  },
  {
    id: 'lei', n: '20', title: { pt: 'Lei aplicável e resolução de litígios', en: 'Governing law and disputes' },
    body: [
      p(
        'Estes Termos regem-se pela lei angolana. Os litígios serão dirimidos pelos tribunais competentes de Angola, sem prejuízo das normas imperativas de proteção do consumidor que sejam aplicáveis.',
        'These Terms are governed by Angolan law. Disputes will be settled by the competent courts of Angola, without prejudice to any applicable mandatory consumer-protection rules.',
      ),
    ],
  },
  {
    id: 'alteracoes', n: '21', title: { pt: 'Alterações, versão e contactos', en: 'Changes, version and contact' },
    body: [
      p(
        'Podemos atualizar estes Termos. Alterações materiais são comunicadas e, quando exigido, requerem nova aceitação; correções editoriais não materiais não exigem nova aceitação. Publicamos a versão em vigor e a data nesta página.',
        'We may update these Terms. Material changes are notified and, where required, require re-acceptance; non-material editorial corrections do not require re-acceptance. We publish the version in force and the date on this page.',
      ),
      p(
        `Versão ${TERMS_VERSION}, em vigor desde ${LEGAL_EFFECTIVE_DATE}. Questões sobre estes Termos: ${OPERATOR_CONTACT}.`,
        `Version ${TERMS_VERSION}, effective ${LEGAL_EFFECTIVE_DATE}. Questions about these Terms: ${OPERATOR_CONTACT}.`,
      ),
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// PRIVACY POLICY — Banzami Beta
// ─────────────────────────────────────────────────────────────────────────
export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'responsavel', n: '01', title: { pt: 'Responsável pelo tratamento', en: 'Data controller' },
    body: [
      p(
        `${OPERATOR_NAME} («Banzami»), NIF ${OPERATOR_NIF}, com sede na ${OPERATOR_ADDRESS.pt}, é o responsável pelo tratamento dos dados pessoais recolhidos através da app Banzami, do Banzami Business, da plataforma para developers e do website. Contacto para questões de privacidade e para exercer os seus direitos: ${OPERATOR_CONTACT}.`,
        `${OPERATOR_NAME} ("Banzami"), tax number (NIF) ${OPERATOR_NIF}, with registered office at ${OPERATOR_ADDRESS.en}, is the controller of the personal data collected through the Banzami app, Banzami Business, the developer platform and the website. Contact for privacy questions and to exercise your rights: ${OPERATOR_CONTACT}.`,
      ),
    ],
  },
  {
    id: 'ambito', n: '02', title: { pt: 'Âmbito', en: 'Scope' },
    body: [
      p(
        'Esta Política descreve o tratamento de dados no âmbito da Beta pública em ambiente Sandbox. Não há movimentação de dinheiro real; as operações com dinheiro real não estão disponíveis.',
        'This Policy describes data processing within the public Beta in the Sandbox environment. There is no movement of real money; real-money operations are not available.',
      ),
    ],
  },
  {
    id: 'dados-conta', n: '03', title: { pt: 'Dados de identidade e conta', en: 'Identity and account data' },
    body: [
      ul([
        ['Email, nome e telefone associados à conta.', 'Email, name and phone associated with the account.'],
        ['O seu @banza (identificador da carteira).', 'Your @banza (wallet identifier).'],
        ['Metadados de sessão e de autenticação (incluindo metadados de PIN/MFA — nunca o próprio PIN).', 'Session and authentication metadata (including PIN/MFA metadata — never the PIN itself).'],
      ]),
    ],
  },
  {
    id: 'dados-uso', n: '04', title: { pt: 'Dados gerados pela utilização', en: 'Data generated by use' },
    body: [
      ul([
        ['Dados técnicos: endereço IP, agente do navegador, datas/horas.', 'Technical data: IP address, browser user-agent, timestamps.'],
        ['Registos (logs), eventos de segurança e de limites de utilização.', 'Logs, security events and rate-limit events.'],
      ]),
      p(
        'Estes dados são usados sobretudo para operar e proteger o serviço.',
        'This data is used mainly to operate and protect the service.',
      ),
    ],
  },
  {
    id: 'dados-negocio', n: '05', title: { pt: 'Dados de negócios (candidaturas)', en: 'Business data (applications)' },
    body: [
      p(
        'Numa candidatura Business em Sandbox recolhemos apenas o necessário para o acesso de teste: nome do negócio, @negócio pretendido, categoria e email de contacto (e, quando útil, município e descrição). Não recolhemos NIF, documentos de identidade, certidões comerciais nem documentos fiscais para o acesso Sandbox.',
        'For a Business application in the Sandbox we collect only what is needed for test access: business name, requested @business handle, category and contact email (and, where useful, municipality and description). We do not collect tax ID, identity documents, commercial certificates or tax documents for Sandbox access.',
      ),
      p(
        'A verificação completa de identidade de empresa (KYB), incluindo documentos, só será exigida para as operações com dinheiro real, que não estão disponíveis.',
        'Full business identity verification (KYB), including documents, will only be required for real-money operations, which are not available.',
      ),
    ],
  },
  {
    id: 'dados-developer', n: '06', title: { pt: 'Dados de developers', en: 'Developer data' },
    body: [
      ul([
        ['Perfil de developer e projetos.', 'Developer profile and projects.'],
        ['Metadados de chaves de API e configuração de webhooks (não o segredo em claro após emissão).', 'API-key metadata and webhook configuration (not the secret in clear after issuance).'],
      ]),
    ],
  },
  {
    id: 'dados-testers', n: '07', title: { pt: 'Testers e contactos', en: 'Testers and contact' },
    body: [
      p(
        'Nos formulários de inscrição de testers e de contacto recolhemos os dados que submete (por exemplo nome, email, plataforma, mensagem) para gerir o programa Beta e responder aos pedidos.',
        'In the tester registration and contact forms we collect the data you submit (for example name, email, platform, message) to manage the Beta programme and answer requests.',
      ),
    ],
  },
  {
    id: 'sandbox', n: '08', title: { pt: 'Transações Sandbox', en: 'Sandbox transactions' },
    body: [
      p(
        'As transações, referências, links de pagamento e dados de pagadores de teste em Sandbox usam dinheiro fictício e podem ser reiniciados ou removidos como parte dos testes.',
        'Sandbox transactions, references, payment links and test-payer data use test money and may be reset or removed as part of testing.',
      ),
    ],
  },
  {
    id: 'finalidades', n: '09', title: { pt: 'Finalidades', en: 'Purposes' },
    body: [
      ul([
        ['Criar e operar a sua conta e os serviços Beta.', 'Create and operate your account and the Beta services.'],
        ['Autenticação, segurança e prevenção de abuso.', 'Authentication, security and abuse prevention.'],
        ['Processar candidaturas Business e pedidos de contacto/testers.', 'Process Business applications and contact/tester requests.'],
        ['Comunicar sobre o serviço (por exemplo, estado de candidatura, ativação).', 'Communicate about the service (for example, application status, activation).'],
        ['Melhorar e testar a plataforma durante a Beta.', 'Improve and test the platform during the Beta.'],
      ]),
    ],
  },
  {
    id: 'fundamentos', n: '10', title: { pt: 'Fundamentos jurídicos', en: 'Legal bases' },
    body: [
      p(
        'Tratamos dados com base na execução do contrato e em medidas pré-contratuais (para criar e operar a conta e as candidaturas), no interesse legítimo (segurança e prevenção de abuso), no cumprimento de obrigações legais quando aplicável, e no consentimento quando este for a base adequada (por exemplo, comunicações opcionais). A informação de privacidade é obrigatória; o consentimento é apenas uma das bases possíveis, não a base de todo o tratamento.',
        'We process data on the basis of contract performance and pre-contractual steps (to create and operate the account and applications), legitimate interest (security and abuse prevention), compliance with legal obligations where applicable, and consent where consent is the appropriate basis (for example, optional communications). Privacy information is mandatory; consent is only one possible basis, not the basis for all processing.',
      ),
    ],
  },
  {
    id: 'cookies', n: '11', title: { pt: 'Cookies e armazenamento local', en: 'Cookies and local storage' },
    body: [
      p(
        'O website público usa apenas cookies estritamente necessários e funcionais — por exemplo, um cookie não secreto que ajuda a encaminhar links de pagamento para a app quando tem sessão iniciada, e o cookie de sessão da Consola de Developers. Não usamos cookies de análise ou de marketing no website público, pelo que não apresentamos um banner de cookies.',
        'The public website uses only strictly necessary and functional cookies — for example, a non-secret cookie that helps route payment links to the app when you are signed in, and the Developer Console session cookie. We do not use analytics or marketing cookies on the public website, so we do not show a cookie banner.',
      ),
    ],
  },
  {
    id: 'analytics', n: '12', title: { pt: 'Análise (analytics)', en: 'Analytics' },
    body: [
      p(
        'Não utilizamos ferramentas de análise de terceiros (por exemplo, Google Analytics) no website público. Usamos registos do servidor para operar e proteger o serviço.',
        'We do not use third-party analytics tools (for example, Google Analytics) on the public website. We use server logs to operate and protect the service.',
      ),
    ],
  },
  {
    id: 'subprocessadores', n: '13', title: { pt: 'Subcontratantes', en: 'Subprocessors' },
    body: [
      p(
        'Recorremos a subcontratantes para prestar o serviço: alojamento e base de dados (IONOS), CDN/DNS/TLS e proteção de tráfego (Cloudflare), envio de emails transacionais (Resend), notificações push (Google Firebase) e, quando aplicável às operações com dinheiro real, armazenamento de documentos (Cloudflare R2). Estes tratam dados por nossa conta e segundo as nossas instruções.',
        'We use subprocessors to provide the service: hosting and database (IONOS), CDN/DNS/TLS and traffic protection (Cloudflare), transactional email (Resend), push notifications (Google Firebase) and, where applicable to real-money operations, document storage (Cloudflare R2). They process data on our behalf and under our instructions.',
      ),
    ],
  },
  {
    id: 'transferencias', n: '14', title: { pt: 'Alojamento e transferências internacionais', en: 'Hosting and international transfers' },
    body: [
      p(
        'Alguns subcontratantes podem tratar dados fora de Angola. Quando existam transferências internacionais, procuramos assegurar salvaguardas adequadas nos termos da lei aplicável.',
        'Some subprocessors may process data outside Angola. Where international transfers occur, we seek to ensure appropriate safeguards under applicable law.',
      ),
    ],
  },
  {
    id: 'conservacao', n: '15', title: { pt: 'Conservação e eliminação', en: 'Retention and deletion' },
    body: [
      p(
        'Conservamos os dados enquanto forem necessários para as finalidades descritas e durante a fase Beta. Os dados de Sandbox podem ser reiniciados ou removidos como parte dos testes. Pode pedir a eliminação da sua conta e dos seus dados através de ' + OPERATOR_CONTACT + ', sem prejuízo de conservação exigida por lei (por exemplo, registos de segurança).',
        'We keep data for as long as it is needed for the purposes described and during the Beta phase. Sandbox data may be reset or removed as part of testing. You can request deletion of your account and data via ' + OPERATOR_CONTACT + ', without prejudice to retention required by law (for example, security logs).',
      ),
    ],
  },
  {
    id: 'seguranca', n: '16', title: { pt: 'Segurança', en: 'Security' },
    body: [
      p(
        'Aplicamos medidas técnicas e organizativas para proteger os dados, incluindo TLS, controlo de acessos, limites de utilização e registo de eventos de segurança. O PIN é guardado de forma protegida e nunca em texto simples, nem em registos ou análises. Nenhum sistema é totalmente seguro.',
        'We apply technical and organisational measures to protect data, including TLS, access control, rate limits and security event logging. The PIN is stored in a protected form and never in plain text, logs or analytics. No system is completely secure.',
      ),
    ],
  },
  {
    id: 'direitos', n: '17', title: { pt: 'Os seus direitos', en: 'Your rights' },
    body: [
      p(
        'Nos termos da Lei n.º 22/11, de 17 de junho (Lei da Protecção de Dados Pessoais), tem direito de acesso, informação, retificação, cancelamento (eliminação) e oposição relativamente aos seus dados pessoais.',
        'Under Law no. 22/11 of 17 June (Personal Data Protection Law), you have the rights of access, information, rectification, cancellation (deletion) and objection regarding your personal data.',
      ),
    ],
  },
  {
    id: 'exercer', n: '18', title: { pt: 'Como exercer os seus direitos e reclamações', en: 'Exercising your rights and complaints' },
    body: [
      p(
        `Para exercer os seus direitos, contacte ${OPERATOR_CONTACT}. Responderemos dentro dos prazos aplicáveis. Tem também o direito de apresentar reclamação junto da Agência de Protecção de Dados (APD): www.apd.ao · geral@apd.ao.`,
        `To exercise your rights, contact ${OPERATOR_CONTACT}. We will respond within the applicable time limits. You also have the right to lodge a complaint with the Data Protection Agency (APD): www.apd.ao · geral@apd.ao.`,
      ),
    ],
  },
  {
    id: 'menores', n: '19', title: { pt: 'Menores', en: 'Minors' },
    body: [
      p(
        'Os serviços não se destinam a menores sem a devida autorização legal. Se soubermos que recolhemos dados de um menor sem base adequada, eliminá-los-emos.',
        'The services are not intended for minors without appropriate legal authorisation. If we learn that we have collected a minor’s data without an adequate basis, we will delete it.',
      ),
    ],
  },
  {
    id: 'automatizadas', n: '20', title: { pt: 'Decisões automatizadas', en: 'Automated decisions' },
    body: [
      p(
        'Não tomamos decisões exclusivamente automatizadas com efeitos jurídicos significativos sobre si. As candidaturas Business são revistas por pessoas.',
        'We do not take solely automated decisions with significant legal effects on you. Business applications are reviewed by people.',
      ),
    ],
  },
  {
    id: 'alteracoes', n: '21', title: { pt: 'Alterações, versão e contactos', en: 'Changes, version and contact' },
    body: [
      p(
        `Podemos atualizar esta Política e informaremos de forma adequada consoante a materialidade da alteração. Versão ${PRIVACY_VERSION}, em vigor desde ${LEGAL_EFFECTIVE_DATE}. Contacto: ${OPERATOR_CONTACT}.`,
        `We may update this Policy and will inform you appropriately depending on how material the change is. Version ${PRIVACY_VERSION}, effective ${LEGAL_EFFECTIVE_DATE}. Contact: ${OPERATOR_CONTACT}.`,
      ),
    ],
  },
];
