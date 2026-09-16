import Link from 'next/link';
import { PUBLIC_TRUTH } from '@/lib/public-truth';
import { PUBLISHED_PACKAGES } from '@/app/developers/docs/published-packages';

// The single FAQ knowledge base (PUBLIC-WEBSITE-RELEASE-001 §24): one source,
// embedded in /suporte (#faq); /faq redirects here. Every answer states what
// exists today — no dates, no roadmap — and the Sandbox/Live facts come from
// lib/public-truth.ts, so this cannot drift from the rest of the site.
type QA = { q: string; a: string; linkComerciantes?: boolean };
type Category = { title: string; items: QA[] };

export const FAQ_CATEGORIES: Category[] = [
  {
    title: 'O essencial',
    items: [
      { q: 'O que é o Banzami?', a: 'O Banzami é uma rede de pagamentos nativa de carteira para mover Kwanza entre pessoas, negócios e aplicações — por QR ou para um @banza, com comprovativos verificáveis. É o operador de referência construído sobre o protocolo aberto BANZA.' },
      { q: 'O que é o @banza?', a: 'O @banza é o identificador público da sua carteira — o nome que as pessoas usam para lhe pagar, em vez de um IBAN. A conta junta o @banza a um nome próprio, que serve apenas para mostrar quem é: não é único nem é uma verificação de identidade.' },
      { q: 'O que é o BANZA?', a: 'O BANZA é o protocolo aberto que define as regras, invariantes e contratos dos pagamentos. O Banzami é o operador que transforma essas regras numa experiência para pessoas e negócios. O BANZA é governado de forma independente do Banzami.' },
      { q: 'O que é a App Banzami Web?', a: 'É a App Banzami a correr no browser, em app.banzami.com. É o mesmo produto de consumidor do iPhone e do Android — o mesmo @banza e a mesma carteira — hoje disponível na Sandbox, com dinheiro fictício.' },
    ],
  },
  {
    title: 'Disponibilidade',
    items: [
      { q: 'O Banzami já está disponível?', a: `Para developers, sim: a ${PUBLIC_TRUTH.sandbox.name} está disponível, é self-service e usa dinheiro fictício. ${PUBLIC_TRUTH.live.summary}` },
      { q: 'Posso descarregar a App Banzami?', a: 'A App Banzami Web está disponível no browser, em app.banzami.com. No iPhone e no Android está em testes, para testers convidados (TestFlight e Google Play) — ainda não está na App Store nem no Google Play para o público. Pode registar o interesse em /testes.' },
      { q: 'Preciso de verificar a identidade (KYC) para usar a Sandbox?', a: 'Não. A Sandbox pública não exige verificação de identidade de consumidor: crie a conta e teste com dinheiro fictício. A verificação exigida para dinheiro real faz parte das aprovações de que o Financial Live depende.' },
      { q: 'O Banzami guarda o meu dinheiro?', a: 'Hoje não. Sem o Financial Live não há operação com dinheiro real: na Sandbox todos os saldos são fictícios.' },
    ],
  },
  {
    title: 'App, pagamentos e QR',
    items: [
      { q: 'Como se paga com QR?', a: 'O pagador lê o QR com a app, confirma com PIN ou biometria e o pagamento fica registado. Na Sandbox, o mesmo percurso corre com pagadores de teste e dinheiro fictício.' },
      { q: 'A câmara não abre para ler o QR. O que faço?', a: 'Autorize o acesso à câmara no seu navegador ou nas definições do dispositivo, e tente novamente. No browser, a leitura de QR só funciona numa ligação segura (https).' },
      { q: 'Como funcionam os comprovativos?', a: 'Cada operação tem um comprovativo com data, valor e referência. Qualquer pessoa pode verificar a referência em banzami.com/verificar.' },
      { q: 'Um pagamento pode ser anulado?', a: 'Um pagamento concluído não é anulado; é o recebedor que o pode reembolsar, total ou parcialmente. Confirme sempre o valor e o destinatário antes de pagar.' },
    ],
  },
  {
    title: 'Segurança',
    items: [
      { q: 'Como são registados os movimentos?', a: 'Cada movimento é registado num ledger de dupla entrada, que não se edita: uma correção é um novo movimento.' },
      { q: 'Como devo proteger a minha conta?', a: 'Nunca partilhe o seu PIN nem um código de verificação com ninguém.' },
      { q: 'Como reporto um problema de segurança?', a: 'Escreva para security@banzami.com, ou veja a página de Segurança.' },
    ],
  },
  {
    title: 'Comerciantes e developers',
    items: [
      { q: 'Um comerciante pode receber pagamentos?', a: 'Os pagamentos de comerciante estão disponíveis na Sandbox, com dinheiro fictício. Veja a página ', linkComerciantes: true },
      { q: 'Existe uma API?', a: `Sim: uma API REST pública (${PUBLIC_TRUTH.apiVersion}) para pagamentos, reembolsos, webhooks e liquidações, documentada em developers.banzami.com/docs.` },
      { q: 'Existem SDKs?', a: `Estão publicados ${PUBLISHED_PACKAGES.map((p) => `${p.name} (${p.registry})`).join(' e ')}. A lista completa e atual está na documentação.` },
      { q: 'Preciso de aprovação para usar a Sandbox?', a: 'Não. Crie a conta na Consola, crie um projeto e receba chaves de teste, sem aprovação de um operador Banzami.' },
      { q: 'Posso usar uma chave secreta no browser ou numa app móvel?', a: 'Não. Uma chave secreta fica sempre no seu servidor. O browser e a app móvel usam uma chave publicável, que só lê.' },
    ],
  },
];

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-none transition-transform duration-[250ms] group-open/faq:rotate-180">
      <path d="M6 9l6 6 6-6" stroke="#9A1B22" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FaqItem({ item }: { item: QA }) {
  return (
    <details className="group/faq mb-[10px] rounded-[16px] border border-border-soft bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-[18px] py-4 text-[16px] font-extrabold text-ink [&::-webkit-details-marker]:hidden">
        {item.q}
        <Chevron />
      </summary>
      <div className="px-[18px] pb-4 text-[14.5px] font-semibold leading-[1.6] text-ink-secondary">
        {item.a}
        {item.linkComerciantes && <Link href="/comerciantes" className="font-extrabold text-cherry no-underline">Comerciantes</Link>}
        {item.linkComerciantes && '.'}
      </div>
    </details>
  );
}

/** The full FAQ accordion, grouped by category. */
export function Faq() {
  return (
    <>
      {FAQ_CATEGORIES.map((cat) => (
        <div key={cat.title}>
          <h3 className="mb-3 mt-9 text-[21px] font-black tracking-[-0.02em] text-ink">{cat.title}</h3>
          {cat.items.map((item) => (
            <FaqItem key={item.q} item={item} />
          ))}
        </div>
      ))}
    </>
  );
}
