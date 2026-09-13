'use client';

// Troubleshooting by symptom, rendered from troubleshooting.ts in either language.

import { SYMPTOMS } from './symptoms';
import { INK, mono } from './ui';

type Lang = 'pt' | 'en';

const GUIDE: Record<string, Record<Lang, string>> = {
  'get-started': { pt: 'Quickstart', en: 'Quickstart' },
  payments: { pt: 'Aceitar pagamentos', en: 'Accept payments' },
  webhooks: { pt: 'Webhooks', en: 'Webhooks' },
  refunds: { pt: 'Reembolsos', en: 'Refunds' },
  settlements: { pt: 'Liquidações', en: 'Settlements' },
  receipts: { pt: 'Comprovativos', en: 'Receipts' },
  reference: { pt: 'Referência API', en: 'API reference' },
  testing: { pt: 'Testar no Sandbox', en: 'Sandbox testing' },
  trust: { pt: 'Segurança', en: 'Security' },
};

const link: React.CSSProperties = { color: '#9A1B22', fontWeight: 600, textDecoration: 'none' };

export function Troubleshooting({ lang }: { lang: Lang }) {
  const t = (pt: string, en: string) => (lang === 'pt' ? pt : en);
  const base = lang === 'pt' ? '/docs' : '/docs/en';
  return (
    <>
      <nav aria-label={t('Sintomas', 'Symptoms')} style={{ margin: '0 0 16px', maxWidth: 760 }}>
        <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '4px 18px' }}>
          {SYMPTOMS.map((s) => (
            <li key={s.id} style={{ fontSize: 13.5 }}><a href={`#${s.id}`} style={link}>{s.symptom[lang]}</a></li>
          ))}
        </ul>
      </nav>
      {SYMPTOMS.map((s) => (
        <details key={s.id} id={s.id} style={{ scrollMarginTop: 80, background: '#fff', border: '1px solid #EAE3E3', borderRadius: 14, padding: '12px 16px', margin: '0 0 10px', maxWidth: 760 }}>
          <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700, color: INK }}>{s.symptom[lang]}</summary>
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, max-content) 1fr', gap: '6px 14px', margin: '10px 0 0' }}>
            {([
              [t('Costuma ser', 'Usually'), s.causes[lang]],
              [t('Verifique', 'Check'), s.check[lang]],
              [t('Na Consola', 'In the Console'), s.console[lang]],
              [t('Repetir?', 'Retry?'), s.retry[lang]],
              ['request_id', t('Guarde o da resposta: encontra o pedido nos Registos, e é o que o suporte pede.', 'Keep the one in the response: it finds the request in Logs, and it is what support asks for.')],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt style={{ fontSize: 12, fontWeight: 700, color: '#6f6468', paddingTop: 2 }}>{k}</dt>
                <dd style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: '#3f3538' }}>{v}</dd>
              </div>
            ))}
            {s.codes.length ? (
              <div style={{ display: 'contents' }}>
                <dt style={{ fontSize: 12, fontWeight: 700, color: '#6f6468', paddingTop: 2 }}>{t('Códigos', 'Codes')}</dt>
                <dd style={{ margin: 0, fontSize: 13 }}>
                  {s.codes.map((c, i) => <span key={c}>{i > 0 ? ' · ' : ''}<a href={`${base}/errors#error-${c}`} style={{ ...link, fontFamily: mono, fontSize: 12.5 }}>{c}</a></span>)}
                </dd>
              </div>
            ) : null}
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, fontWeight: 700, color: '#6f6468', paddingTop: 2 }}>{t('Guia', 'Guide')}</dt>
              <dd style={{ margin: 0, fontSize: 13.5 }}><a href={`${base}/${s.guide}`} style={link}>{GUIDE[s.guide]?.[lang] ?? s.guide}</a></dd>
            </div>
          </dl>
        </details>
      ))}
    </>
  );
}
