'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { developerApi } from '@/lib/developer-api';
import { Card } from './ui';
import { IconCheck } from './icons';

/**
 * The Sandbox onboarding path, as a checklist built from what is true for the
 * active Project — never a progress bar the developer ticks by hand.
 *
 * Each step is read from the operator's own records: the Financial Setup state,
 * the Project's keys, its API request log (a test payer created, a payment
 * made) and its webhook endpoints. A step that cannot be read shows as not done
 * rather than done.
 */

type Step = { id: string; title: string; hint: string; href: string; done: boolean };

export function SandboxChecklist({ projectId }: { projectId: string }) {
  const [steps, setSteps] = useState<Step[] | null>(null);

  const load = useCallback(async () => {
    const safe = async <T,>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };
    const [setup, keys, anyLogs, payerLogs, paymentLogs, endpoints] = await Promise.all([
      safe(developerApi.financialSetup(projectId)),
      safe(developerApi.listKeys(projectId)),
      safe(developerApi.listApiRequestLogs(projectId, { limit: 1 })),
      safe(developerApi.listApiRequestLogs(projectId, { path: '/v1/sandbox/test-payers', limit: 50 })),
      safe(developerApi.listApiRequestLogs(projectId, { path: '/payments', limit: 50 })),
      safe(developerApi.listWebhookEndpoints(projectId)),
    ]);
    const ok = (s: number) => s >= 200 && s < 300;
    setSteps([
      {
        id: 'setup', title: 'Configurar a Sandbox', hint: 'Escolha o tipo de uso; o Banzami cria um negócio de teste.',
        href: '/financeiro', done: setup?.state === 'READY' || setup?.state === 'SEALED',
      },
      {
        id: 'key', title: 'Criar uma chave secreta', hint: 'Uma chave bz_test_sk_ com os scopes da sua integração.',
        href: '/api-keys', done: (keys?.keys ?? []).some((k) => k.status === 'ACTIVE' && k.kind === 'SECRET'),
      },
      {
        id: 'explorer', title: 'Fazer um pedido', hint: 'No API Explorer, sem copiar a chave para o browser.',
        href: '/explorer', done: (anyLogs?.logs.length ?? 0) > 0,
      },
      {
        id: 'payer', title: 'Testar como consumidor', hint: 'Abra a App Banzami Web ou crie um pagador de teste.',
        href: '/app-banzami', done: (payerLogs?.logs ?? []).some((l) => l.method === 'POST' && ok(l.status) && l.path === '/v1/sandbox/test-payers'),
      },
      {
        id: 'pay', title: 'Pagar a primeira sessão', hint: 'Por link ou por QR, e ver o estado mudar em tempo real.',
        href: '/dados-de-teste', done: (paymentLogs?.logs ?? []).some((l) => l.method === 'POST' && ok(l.status) && /\/v1\/sandbox\/test-payers\/[^/]+\/payments$/.test(l.path)),
      },
      {
        id: 'webhook', title: 'Receber um webhook', hint: 'Registe um endpoint e envie um evento de teste.',
        href: '/webhooks', done: (endpoints?.endpoints ?? []).length > 0,
      },
    ]);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  if (!steps) return null;
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  return (
    <Card style={{ padding: 22, marginBottom: 16 }}>
      <div data-testid="sandbox-checklist">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Começar na Sandbox</h2>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#8a7a7e' }}>{done} de {steps.length}</span>
        </div>
        <ol style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {steps.map((s, i) => (
            <li key={s.id} data-step={s.id} data-done={s.done} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span
                aria-hidden="true"
                style={{
                  flex: '0 0 26px', height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12.5, fontWeight: 900,
                  background: s.done ? '#B5101F' : s === next ? '#fff' : '#FBE6E4',
                  color: s.done ? '#fff' : s === next ? '#B5101F' : '#C29597',
                  border: s === next ? '2px solid #B5101F' : 'none',
                }}
              >
                {s.done ? <IconCheck size={13} strokeWidth={2.6} /> : i + 1}
              </span>
              <span style={{ flex: 1 }}>
                <Link href={s.href} style={{ fontSize: 14, fontWeight: 900, color: s.done ? '#8a7a7e' : '#2a2024', textDecoration: 'none' }}>
                  {s.title}
                </Link>
                <span className="bz-sr-only">{s.done ? ' — concluído' : ' — por fazer'}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600 }}>{s.hint}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
