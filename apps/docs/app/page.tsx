import type { Metadata } from 'next'
import Link from 'next/link'
import { getReference, getSectionByNumber } from '@/lib/reference'
import { HeroSection } from '@/components/HeroSection'
import { ManifestoQuote } from '@/components/ManifestoQuote'
import { PaymentFlowDiagram } from '@/components/PaymentFlowDiagram'
import { EcosystemMap } from '@/components/EcosystemMap'
import { WalletToWalletVisual } from '@/components/WalletToWalletVisual'
import { QRCommerceVisual } from '@/components/QRCommerceVisual'
import { SDKArchitectureVisual } from '@/components/SDKArchitectureVisual'
import { SecurityPipelineVisual } from '@/components/SecurityPipelineVisual'
import { MobilePaymentMockup } from '@/components/MobilePaymentMockup'
import { SectionCard } from '@/components/SectionCard'

export const metadata: Metadata = {
  title: 'Banzami — Rede Angolana de Pagamentos Instantâneos por QR Code',
  description:
    'Banzami é a rede angolana de pagamentos instantâneos por QR Code, permitindo pagamentos wallet-to-wallet em Kwanza através de SDKs oficiais.',
}

// ---- Problem cards -----------------------------------------------------------
const problems = [
  { icon: '💵', title: 'Dependência de dinheiro físico', desc: 'Comerciantes perdem vendas por falta de troco. Consumidores carregam notas.' },
  { icon: '📸', title: 'Comprovativos por WhatsApp', desc: 'Pagamentos manuais que exigem captura de ecrã, confirmação manual e risco de fraude.' },
  { icon: '📱', title: 'Apps sem pagamento integrado', desc: 'Táxis, delivery e ecommerce angolanos não têm gateway de pagamento nativo.' },
  { icon: '🏪', title: 'Pequenos negócios excluídos', desc: 'TPA físico é caro e burocrático. A cantina da esquina fica fora do sistema.' },
  { icon: '🔧', title: 'Sem SDK angolano', desc: 'Programadores angolanos não têm uma API de pagamentos feita para Kwanza e para Angola.' },
]

// ---- Use case cards ----------------------------------------------------------
const useCases = [
  { icon: '🚕', title: 'Apps de Táxi',         desc: 'Corrida terminada → pagamento instantâneo. Sem confirmação manual.' },
  { icon: '🍲', title: 'Cantinas',              desc: 'QR impresso no balcão. Sem TPA. Sem troco.' },
  { icon: '🛒', title: 'Ecommerce',             desc: 'Link de pagamento partilhado no WhatsApp. Pago em segundos.' },
  { icon: '❤️', title: 'Doações',              desc: 'QR para receber doações instantâneas em Kwanza.' },
  { icon: '🏫', title: 'Escolas',               desc: 'Propinas e inscrições pagas por pedido de pagamento.' },
  { icon: '🛵', title: 'Delivery',              desc: 'Pagamento na entrega via QR. Sem dinheiro na mão do estafeta.' },
]

export default function HomePage() {
  const reference = getReference()

  const whyNowSection = getSectionByNumber(3)

  return (
    <div className="overflow-x-hidden">

      {/* ─── 1. HERO ──────────────────────────────────────────────────────── */}
      <div className="px-5 md:px-8 lg:px-12">
        <HeroSection tagline={reference.tagline} />
      </div>

      {/* ─── 2. MANIFESTO QUOTE ───────────────────────────────────────────── */}
      <div className="px-5 md:px-8 lg:px-12">
        <ManifestoQuote>
          Angola não precisa de copiar o modelo de pagamentos dos outros. Angola precisa do seu
          — construído para o Kwanza, construído para o QR, construído para o smartphone em cada bolso.
        </ManifestoQuote>
      </div>

      {/* ─── 3. PROBLEMA ──────────────────────────────────────────────────── */}
      <section className="px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          O problema
        </div>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          O que Angola precisa de ultrapassar
        </h2>
        <p className="mb-10 max-w-2xl text-bz-muted">
          O mercado angolano tem tudo para ser digital — smartphones, vontade, escala. O que falta é a infraestrutura de pagamento certa.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {problems.map((p, i) => (
            <div key={i} className="card p-5">
              <div className="mb-3 text-2xl">{p.icon}</div>
              <h3 className="mb-1 text-sm font-semibold text-bz-text">{p.title}</h3>
              <p className="text-xs leading-relaxed text-bz-muted">{p.desc}</p>
            </div>
          ))}
          {/* Why Now — sourced from §3 */}
          {whyNowSection && (
            <Link href="/por-que-agora" className="card group p-5 hover:border-bz-primary/30">
              <div className="mb-3 text-2xl">⏱️</div>
              <h3 className="mb-1 text-sm font-semibold text-bz-text group-hover:text-bz-primary transition-colors">
                Porquê agora?
              </h3>
              <p className="text-xs leading-relaxed text-bz-muted">
                Angola está pronta. O telemóvel chegou. O WhatsApp provou que a economia digital existe. O QR provou o modelo globalmente.
              </p>
              <div className="mt-3 text-[11px] font-semibold text-bz-primary opacity-0 transition-opacity group-hover:opacity-100">
                §{whyNowSection.number} — {whyNowSection.title} →
              </div>
            </Link>
          )}
        </div>
      </section>

      {/* ─── 4. COMO FUNCIONA ─────────────────────────────────────────────── */}
      <section className="border-y border-bz-border bg-bz-surface px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Como funciona
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          Escanear. Confirmar. Pago instantaneamente.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          Cada pagamento Banzami é uma transferência directa entre carteiras, registada no ledger de forma atómica e imutável.
        </p>
        <PaymentFlowDiagram />
      </section>

      {/* ─── 5. WALLET TO WALLET ──────────────────────────────────────────── */}
      <section className="px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Filosofia wallet-native
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          O telemóvel é a carteira.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          Sem números de cartão. Sem IBAN. Sem formulários. Apenas @banza, QR e liquidação instantânea em Kwanza.
        </p>
        <WalletToWalletVisual />
      </section>

      {/* ─── 6. ECOSSISTEMA ───────────────────────────────────────────────── */}
      <section className="border-y border-bz-border bg-bz-surface px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Ecossistema
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          Uma rede. Múltiplos actores.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          Consumidores, comerciantes, apps externas, SDKs, bancos e o core financeiro Banzami — todos ligados através de uma infraestrutura comum.
        </p>
        <EcosystemMap />
      </section>

      {/* ─── 7. QR COMMERCE ───────────────────────────────────────────────── */}
      <section className="px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          QR Commerce
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          Um QR code. Todo o comércio angolano.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          Do táxi à escola, da cantina à plataforma de doações — o QR Banzami serve todos os casos de uso do mercado angolano.
        </p>
        <QRCommerceVisual />
      </section>

      {/* ─── 8. CASOS DE USO ──────────────────────────────────────────────── */}
      <section className="border-y border-bz-border bg-bz-surface px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Casos de uso
        </div>
        <h2 className="mb-8 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          Banzami em todo o Angola
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((uc, i) => (
            <div key={i} className="card p-5">
              <div className="mb-3 text-2xl">{uc.icon}</div>
              <h3 className="mb-1 text-sm font-semibold text-bz-text">{uc.title}</h3>
              <p className="text-xs leading-relaxed text-bz-muted">{uc.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 9. EXPERIÊNCIA MOBILE ────────────────────────────────────────── */}
      <section className="px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Mobile-first
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          O pagamento perfeito dura menos de 3 segundos.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          A experiência mobile Banzami é desenhada para ser instantânea, em português (pt-AO), e funcionar em qualquer rede de dados angolana.
        </p>
        <MobilePaymentMockup />
      </section>

      {/* ─── 10. PARA PROGRAMADORES ───────────────────────────────────────── */}
      <section className="border-y border-bz-border bg-bz-surface px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Para programadores
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          SDK-first. Integração em Kwanza.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          A plataforma Banzami é SDK-first. Qualquer app — táxi, delivery, escola, ecommerce — integra pagamentos em Kwanza com uma única chamada ao SDK oficial.
        </p>
        <SDKArchitectureVisual />
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/banzami-para-programadores" className="btn-primary">
            Ver documentação de programadores
          </Link>
          <Link href="/o-motor-de-crescimento-banzami" className="btn-ghost">
            O Flywheel Banzami
          </Link>
        </div>
      </section>

      {/* ─── 11. SEGURANÇA ────────────────────────────────────────────────── */}
      <section className="px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Segurança &amp; integridade financeira
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          Infraestrutura de grau bancário.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          Cada transacção atravessa autenticação, KYC, motor de risco, idempotência, registo em ledger, auditoria e reconciliação — tudo automaticamente.
        </p>
        <SecurityPipelineVisual />
      </section>

      {/* ─── 12. QUOTE FINAL ──────────────────────────────────────────────── */}
      <div className="px-5 md:px-8 lg:px-12">
        <ManifestoQuote>
          O QR torna-se o terminal. O telemóvel torna-se a carteira. Angola salta directamente para a infraestrutura de pagamento do futuro.
        </ManifestoQuote>
      </div>

      {/* ─── 13. ALL SECTIONS GRID ────────────────────────────────────────── */}
      <section className="border-t border-bz-border px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Referência completa
        </div>
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
            {reference.sections.length} secções. Um manifesto.
          </h2>
          <Link href="/reference" className="hidden text-sm font-semibold text-bz-primary hover:underline sm:block">
            Ver tudo →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {reference.sections.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/reference" className="btn-primary inline-flex">
            Ler o manifesto completo
          </Link>
        </div>
      </section>

      {/* ─── 14. SOURCE ATTRIBUTION ───────────────────────────────────────── */}
      <div className="border-t border-bz-border bg-bz-surface px-5 py-6 text-center text-xs text-bz-muted md:px-8 lg:px-12">
        Organização Banzami · Referência v{reference.meta.version} · Todo o conteúdo deriva de{' '}
        <code className="rounded bg-bz-border px-1.5 py-0.5 font-mono">docs/BANZAMI_REFERENCE.md</code>
        {' '}· ADR-015
      </div>
    </div>
  )
}
