'use client';

import type { ReactNode } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { IconCheck, IconCircle, IconClock, IconHelp } from '@/components/developers/portal/icons';

// Go Live / KYB — dossier ecrã 9. No sandbox banner. Checklist of KYB steps +
// what-happens-next card. Live is unlocked only after KYB approval.

type Status = 'done' | 'pending' | 'analysis';

type Item = { title: string; desc: string; status: Status; descColor?: string };
const ITEMS: Item[] = [
  { title: 'Informações da empresa', desc: 'Nome legal, NIF, morada', status: 'done' },
  { title: 'Documentos legais', desc: 'Certidão comercial, estatutos', status: 'done' },
  { title: 'Proprietários / Beneficiários', desc: 'Titulares com >25%', status: 'done' },
  { title: 'Verificação KYB', desc: 'Aguarda o envio dos beneficiários finais', status: 'pending', descColor: '#C77A0A' },
  { title: 'Revisão final', desc: 'Aprovação da equipa Banzami', status: 'analysis' },
];

function statusIcon(s: Status): { tile: string; color: string; icon: ReactNode } {
  if (s === 'done') return { tile: '#EAF7F0', color: '#1F8A5B', icon: <IconCheck size={19} strokeWidth={2.2} /> };
  if (s === 'pending') return { tile: '#FDF3E2', color: '#C77A0A', icon: <IconClock size={19} /> };
  return { tile: '#F3EDEC', color: '#b8a4a6', icon: <IconCircle size={19} /> };
}

function badge(s: Status) {
  const map = {
    done: { bg: '#EAF7F0', color: '#1F8A5B', label: 'Concluído' },
    pending: { bg: '#FDF3E2', color: '#B8770A', label: 'Pendente' },
    analysis: { bg: '#F3EDEC', color: '#8a7a7e', label: 'Em análise' },
  }[s];
  return (
    <span style={{ padding: '4px 11px', borderRadius: 30, background: map.bg, fontSize: 11.5, fontWeight: 800, color: map.color }}>
      {map.label}
    </span>
  );
}

const WHATS_NEXT = [
  'Acesso às chaves Live de produção',
  'Processamento de pagamentos reais',
  'Configuração de liquidações',
  'Suporte prioritário dedicado',
];

export default function GoLivePage() {
  return (
    <PortalPage active="golive">
      <div className="bz-view" style={{ maxWidth: 920 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 12px',
            borderRadius: 30,
            background: '#FDF3E2',
            fontSize: 11.5,
            fontWeight: 900,
            color: '#B8770A',
            marginBottom: 12,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E0930F' }} />
          SANDBOX → PRODUÇÃO
        </span>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: '-.02em' }}>Go Live</h1>
        <p style={{ margin: '8px 0 24px', fontSize: 15, color: '#8a7a7e', fontWeight: 600, maxWidth: 560 }}>
          Complete os requisitos abaixo para desbloquear o ambiente de produção e processar pagamentos reais.
        </p>

        <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
          <Card style={{ padding: '8px 6px' }}>
            {ITEMS.map((it, i) => {
              const si = statusIcon(it.status);
              return (
                <div
                  key={it.title}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: 16,
                    borderRadius: 14,
                    borderTop: i === 0 ? undefined : '1px solid #F5E9E7',
                    background: it.status === 'pending' ? '#FFFAF3' : undefined,
                  }}
                >
                  <span
                    style={{
                      flex: 'none',
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      background: si.tile,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: si.color,
                    }}
                  >
                    {si.icon}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: it.status === 'analysis' ? '#8a7a7e' : undefined }}>{it.title}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: it.descColor || '#a89a9e', fontWeight: it.descColor ? 800 : 700 }}>{it.desc}</p>
                  </div>
                  {badge(it.status)}
                </div>
              );
            })}
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'linear-gradient(155deg,#B5101F,#6E0E14)', borderRadius: 18, padding: 24, color: '#fff', boxShadow: '0 26px 56px -34px rgba(122,16,22,.6)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 900 }}>O que acontece após a aprovação</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {WHATS_NEXT.map((t) => (
                  <span key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, fontWeight: 700, color: 'rgba(255,255,255,.92)' }}>
                    <span style={{ flex: 'none', marginTop: 1, color: '#fff', display: 'inline-flex' }}>
                      <IconCheck size={17} strokeWidth={2.2} />
                    </span>
                    {t}
                  </span>
                ))}
              </div>
              <button
                className="bz-cta"
                style={{ width: '100%', marginTop: 20, padding: 13, border: 'none', borderRadius: 12, background: '#fff', color: '#9A1B22', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
              >
                Solicitar revisão
              </button>
            </div>
            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ width: 32, height: 32, borderRadius: 9, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#B5101F' }}>
                  <IconHelp size={17} />
                </span>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>Precisa de ajuda?</h4>
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#8a7a7e', fontWeight: 600 }}>
                Fale com a nossa equipa de compliance para acelerar a verificação.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </PortalPage>
  );
}
