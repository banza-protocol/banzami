'use client';

import Link from 'next/link';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';

// Go Live — the truthful state of an environment that does not exist yet.
//
// This page used to show a KYB checklist with three steps marked "Concluído",
// one "Pendente" and one "Em análise", and a "Solicitar revisão" button. None of
// it was connected to anything: no company information had been submitted, no
// documents existed, no review was pending, and the button had no handler. A
// developer reading it would have believed their Live application was three
// fifths of the way through a queue.
//
// Financial Live is not available on the Banzami platform. Not "coming soon for
// you" — not built, not enabled, and not reachable by anything in this Console.
// Saying that once, plainly, is the whole page. When there is a real Live
// onboarding flow with real state behind it, this becomes that flow; until
// then, an honest closed door beats a progress bar over an empty queue.

const mono = "'JetBrains Mono', ui-monospace, monospace";

export default function GoLivePage() {
  return (
    <PortalPage active="golive">
      <div className="bz-view" style={{ maxWidth: 760 }}>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 900, letterSpacing: '.09em', color: '#B5101F' }}>
          AMBIENTE DE PRODUÇÃO
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em' }}>
          Live ainda não está disponível
        </h1>
        <p style={{ margin: '14px 0 26px', fontSize: 15, lineHeight: 1.6, color: '#7a6a6e', fontWeight: 600 }}>
          O Banzami está em Sandbox. Os trilhos financeiros de produção não estão activados para
          nenhuma conta, não há candidaturas em curso, e nada nesta consola — nenhum botão, nenhuma
          definição, nenhuma chave — os pode activar.
        </p>

        <Card style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 900 }}>O que isto significa em concreto</h3>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.75, color: '#5a4a4e', fontWeight: 600 }}>
            <li>
              As chaves deste projeto começam por{' '}
              <code style={{ fontFamily: mono, fontSize: 13 }}>bz_test_</code>. Chaves{' '}
              <code style={{ fontFamily: mono, fontSize: 13 }}>bz_live_</code> não são emitidas por
              nenhuma via, incluindo o suporte.
            </li>
            <li>Nenhum pagamento feito em Sandbox move dinheiro real, nem hoje nem retroactivamente.</li>
            <li>Não há migração automática de Sandbox para produção. Quando Live existir, será uma decisão sua.</li>
            <li>O trabalho que fizer aqui — integração, webhooks, reconciliação — continua válido.</li>
          </ul>
        </Card>

        <Card style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 900 }}>Se quiser ser avisado</h3>
          <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.65, color: '#7a6a6e', fontWeight: 600 }}>
            Não há lista de espera nem formulário de candidatura — criar um daria a impressão de
            uma fila que não existe. Escreva-nos a partir do email da sua conta e responderemos
            quando houver algo concreto a dizer.
          </p>
          <a
            href="mailto:developers@banzami.com?subject=Interesse%20em%20produ%C3%A7%C3%A3o"
            style={{
              display: 'inline-block', padding: '12px 20px', borderRadius: 12,
              border: '1.5px solid #EBDBD9', background: '#fff',
              fontSize: 14, fontWeight: 800, color: '#B5101F', textDecoration: 'none',
            }}
          >
            developers@banzami.com
          </a>
          <p style={{ margin: '18px 0 0', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>
            Entretanto,{' '}
            <Link href="/dashboard" style={{ color: '#B5101F', fontWeight: 800 }}>a sua actividade em Sandbox</Link>
            {' '}é real e mostra-lhe exactamente o que a integração está a fazer.
          </p>
        </Card>
      </div>
    </PortalPage>
  );
}
