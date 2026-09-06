'use client';

import Link from 'next/link';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';

// Suporte — a working way to reach someone, and nothing that pretends to be
// more than that.
//
// This was a placeholder ("Esta secção está a ser preparada"). It could have
// become a ticket queue with a reference number and a response-time promise;
// there is no ticket system behind it, so the number would be decoration and
// the promise a guess. What exists is an address a person reads, so that is
// what the page offers — with the project's own identifiers to hand, because
// the first thing any answer needs is which project and which request.

const mono = "'JetBrains Mono', ui-monospace, monospace";

function ProjectFacts() {
  const { activeWs, activeProject } = useDeveloperData();
  if (!activeProject) return null;
  return (
    <div style={{ marginTop: 14, padding: '14px 16px', background: '#FDFAFA', border: '1px solid #F2E6E4', borderRadius: 12 }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: '#a89a9e' }}>
        INCLUA ISTO NA SUA MENSAGEM
      </p>
      <p style={{ margin: 0, fontSize: 13, fontFamily: mono, color: '#5a4a4e', lineHeight: 1.8, wordBreak: 'break-all' }}>
        workspace: {activeWs?.name ?? '—'}<br />
        project: {activeProject.name}<br />
        project_id: {activeProject.id}<br />
        ambiente: Sandbox
      </p>
    </div>
  );
}

export default function SuportePage() {
  return (
    <PortalPage active="suporte">
      <div className="bz-view" style={{ maxWidth: 760 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Suporte</h1>
        <p style={{ margin: '6px 0 22px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
          Uma pessoa lê o email desta caixa. Não há sistema de tickets, por isso não receberá um
          número de referência — receberá uma resposta.
        </p>

        <Card style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 900 }}>Escrever para o suporte</h3>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.65, color: '#7a6a6e', fontWeight: 600 }}>
            Escreva a partir do email da sua conta. Se a sua pergunta é sobre um pedido concreto,
            inclua o <code style={{ fontFamily: mono, fontSize: 13 }}>request_id</code> — está em
            cada linha da página <Link href="/logs" style={{ color: '#B5101F', fontWeight: 800 }}>Registos</Link> e
            é o que permite encontrar exactamente o que aconteceu do nosso lado.
          </p>
          <a
            href="mailto:developers@banzami.com"
            style={{
              display: 'inline-block', padding: '12px 20px', borderRadius: 12,
              border: '1.5px solid #EBDBD9', background: '#fff',
              fontSize: 14, fontWeight: 800, color: '#B5101F', textDecoration: 'none',
            }}
          >
            developers@banzami.com
          </a>
          <ProjectFacts />
        </Card>

        <Card style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 900 }}>Antes de escrever</h3>
          <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.65, color: '#7a6a6e', fontWeight: 600 }}>
            Muitas perguntas têm resposta directa na documentação, e a consola mostra-lhe o que a
            sua integração está realmente a fazer:
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.9, color: '#5a4a4e', fontWeight: 600 }}>
            <li><Link href="/docs" style={{ color: '#B5101F', fontWeight: 800 }}>Documentação</Link> — SDKs, referência da API e o que o Sandbox é e não é</li>
            <li><Link href="/logs" style={{ color: '#B5101F', fontWeight: 800 }}>Registos</Link> — cada pedido feito com uma chave deste projeto, com estado e latência</li>
            <li><Link href="/webhooks" style={{ color: '#B5101F', fontWeight: 800 }}>Webhooks</Link> — eventos emitidos e cada tentativa de entrega, com o estado HTTP</li>
            <li><Link href="/go-live" style={{ color: '#B5101F', fontWeight: 800 }}>Produção</Link> — porque Live ainda não está disponível</li>
          </ul>
        </Card>
      </div>
    </PortalPage>
  );
}
