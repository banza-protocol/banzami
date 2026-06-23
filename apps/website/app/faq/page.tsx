import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site/SiteHeader';
import { CTASection } from '@/components/site/CTASection';
import { Footer } from '@/components/site/Footer';
import { ComingSoonBadge } from '@/components/site/ComingSoonBadge';
import { Reveal } from '@/components/Reveal';
import { mailto } from '@/lib/site';

export const metadata: Metadata = { title: 'FAQ' };

// FAQ content — verbatim from FAQ.dc.html (5 categorias em acordeão).
// `soon` items render the "Em breve" badge inline before the answer.
// `linkComerciantes` injects the inline /comerciantes link in the answer.
type QA = { q: string; a: string; soon?: boolean; linkComerciantes?: boolean };
type Category = { title: string; items: QA[] };

const CATEGORIES: Category[] = [
  {
    title: 'Começar',
    items: [
      {
        q: 'Como criar uma conta?',
        a: 'Descarregue a app Banzami, escolha o seu @banza e defina um PIN. A sua carteira fica pronta em segundos.',
      },
      {
        q: 'Preciso de um banco para usar o Banzami?',
        a: 'Não. Cada conta Banzami é uma carteira em Kwanza — basta o seu @banza para pagar e receber.',
      },
      {
        q: 'O Banzami já está disponível?',
        a: 'Estamos em fase de lançamento. Junte-se cedo para ser dos primeiros a experimentar.',
      },
    ],
  },
  {
    title: 'Pagamentos',
    items: [
      {
        q: 'Como pagar com QR?',
        a: 'Abra a app, toque em Scan, aponte ao QR do comerciante e confirme com o seu PIN. O pagamento é instantâneo.',
      },
      {
        q: 'Como enviar dinheiro para um @banza?',
        a: 'Toque em Enviar, escreva o @banza do destinatário e o valor, e confirme. Sem IBAN, sem números longos.',
      },
      {
        q: 'Como funcionam os comprovativos digitais?',
        a: 'Após cada pagamento recebe um comprovativo com data, valor e referência, guardado no seu histórico.',
      },
      {
        q: 'Posso cancelar um pagamento?',
        a: 'Os pagamentos são instantâneos e irreversíveis. Confirme sempre o valor e o destinatário antes de pagar.',
      },
    ],
  },
  {
    title: 'Produtos',
    items: [
      {
        q: 'O que é a Banzami Wallet?',
        a: 'A sua carteira digital em Kwanza: saldo, pagamentos, comprovativos e histórico, tudo num só lugar.',
      },
      {
        q: 'Como funciona dividir pagamentos?',
        a: 'Vai permitir dividir uma conta entre várias pessoas, de forma instantânea.',
        soon: true,
      },
      {
        q: 'O que são pedidos de pagamento?',
        a: 'Vai permitir pedir dinheiro a alguém em segundos, com um link ou @banza.',
        soon: true,
      },
    ],
  },
  {
    title: 'Segurança',
    items: [
      {
        q: 'O Banzami é seguro?',
        a: 'Cada movimento é registado num ledger de dupla entrada e confirmado com PIN ou biometria.',
      },
      {
        q: 'Como protejo a minha conta?',
        a: 'Use um PIN forte e ative a biometria do telemóvel. Nunca partilhe o seu PIN com ninguém.',
      },
      {
        q: 'O que acontece se perder o telemóvel?',
        a: 'A sua carteira fica protegida pelo PIN. Pode recuperar o acesso noutro dispositivo com a sua identidade.',
      },
    ],
  },
  {
    title: 'Empresas & Developers',
    items: [
      {
        q: 'Comerciantes podem receber pagamentos?',
        a: 'Sim. Os comerciantes recebem por QR sem terminal POS — veja a página ',
        linkComerciantes: true,
      },
      {
        q: 'Existe API?',
        a: 'Sim — uma API REST para criar pagamentos, confirmar transações e receber eventos. Disponível para integração técnica e testes em sandbox.',
      },
      {
        q: 'Existem SDKs?',
        a: 'SDKs oficiais para JavaScript/TypeScript, iOS, Android e REST. Disponível para integração técnica e testes em sandbox.',
      },
      {
        q: 'Posso testar antes de ir para produção?',
        a: 'Sim. O sandbox permite simular pagamentos, confirmações, falhas, reembolsos e webhooks. A produção depende da ativação dos rails externos aprovados.',
      },
    ],
  },
];

function Chevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className="flex-none transition-transform duration-[250ms] group-open/faq:rotate-180"
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="#9A1B22"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
        {item.soon && (
          <span className="mr-[6px] inline-block rounded-pill bg-pink-200 px-2 py-[2px] text-[10px] font-extrabold text-cherry-dark">
            Em breve
          </span>
        )}
        {item.a}
        {item.linkComerciantes && (
          <Link href="/comerciantes" className="font-extrabold text-cherry no-underline">
            Comerciantes
          </Link>
        )}
        {item.linkComerciantes && '.'}
      </div>
    </details>
  );
}

export default function FaqPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* HERO */}
      <section className="bg-[linear-gradient(180deg,#FFF3F1,#fff)] px-6 pb-10 pt-[120px]">
        <div className="mx-auto max-w-[760px] text-center">
          <p className="m-0 mb-3 text-[14px] font-black tracking-[0.04em] text-cherry">FAQ</p>
          <h1 className="m-0 text-[clamp(34px,6vw,56px)] font-black leading-[1.02] tracking-[-0.03em]">
            Perguntas frequentes
          </h1>
          <p className="m-0 mt-[18px] text-[18px] font-semibold leading-[1.55] text-ink-secondary">
            Respostas simples sobre como usar o Banzami.
          </p>
        </div>
      </section>

      {/* ACCORDION CATEGORIES */}
      <section className="px-6 pb-20 pt-2">
        <div className="mx-auto max-w-[760px]">
          {CATEGORIES.map((cat) => (
            <Reveal key={cat.title}>
              <h2 className="mb-3 mt-9 text-[23px] font-black tracking-[-0.02em]">{cat.title}</h2>
              {cat.items.map((item) => (
                <FaqItem key={item.q} item={item} />
              ))}
            </Reveal>
          ))}

          {/* "Ainda tem dúvidas?" CTA */}
          <Reveal className="mt-12 rounded-card border border-border-soft bg-[linear-gradient(135deg,#FFF3F1,#FFE6E4)] px-6 py-10 text-center">
            <h3 className="m-0 text-[24px] font-black tracking-[-0.02em]">Ainda tem dúvidas?</h3>
            <p className="m-0 mb-5 mt-[10px] text-[15px] font-semibold text-ink-secondary">
              Fale com a equipa Banzami — respondemos depressa.
            </p>
            <a
              href={mailto()}
              className="inline-flex items-center gap-2 rounded-pill bg-cherry px-7 py-[14px] text-[15px] font-extrabold text-white no-underline shadow-[0_12px_26px_-10px_rgba(181,16,31,.55)] transition-transform hover:-translate-y-0.5"
            >
              Contacte-nos
            </a>
          </Reveal>
        </div>
      </section>

      <CTASection />
      <Footer />
    </main>
  );
}
