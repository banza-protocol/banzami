'use client';

// The webhook event reference, rendered from events.ts in either language: a
// scannable index, then one mini reference per event.

import { EVENT_DOCS } from './events';
import { Code, CodeBlock, INK, P, mono } from './ui';

type Lang = 'pt' | 'en';

export const eventAnchor = (name: string) => `event-${name.replace('.', '-')}`;

const cell: React.CSSProperties = { padding: '7px 9px', borderBottom: '1px solid #EAE3E3', verticalAlign: 'top', color: '#3f3538' };
const link: React.CSSProperties = { color: '#9A1B22', fontWeight: 600, textDecoration: 'none' };

const GUIDE: Record<string, Record<Lang, string>> = {
  payments: { pt: 'Aceitar pagamentos', en: 'Accept payments' },
  refunds: { pt: 'Reembolsos', en: 'Refunds' },
  settlements: { pt: 'Liquidações', en: 'Settlements' },
};

export function EventReference({ lang, onCopy }: { lang: Lang; onCopy: (t: string, l: string) => void }) {
  const t = (pt: string, en: string) => (lang === 'pt' ? pt : en);
  const base = lang === 'pt' ? '/docs' : '/docs/en';
  const copyProps = lang === 'en' ? { toastText: 'Copied to clipboard', buttonText: 'Copy' } : {};
  return (
    <>
      <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 18px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6f6468' }}>
              <th style={{ ...cell, fontWeight: 600 }}>{t('Evento', 'Event')}</th>
              <th style={{ ...cell, fontWeight: 600 }}>{t('Quando', 'When')}</th>
              <th style={{ ...cell, fontWeight: 600 }}>{t('Recurso', 'Resource')}</th>
            </tr>
          </thead>
          <tbody>
            {EVENT_DOCS.map((e) => (
              <tr key={e.name}>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}><a href={`#${eventAnchor(e.name)}`} style={{ ...link, fontFamily: mono, fontSize: 12.5 }}>{e.name}</a></td>
                <td style={cell}>{e.when[lang]}</td>
                <td style={cell}>{e.resource[lang]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {EVENT_DOCS.map((e) => (
        <section key={e.name} aria-labelledby={eventAnchor(e.name)} style={{ borderTop: '1px solid #EAE3E3', paddingTop: 4, marginTop: 18 }}>
          <h3 id={eventAnchor(e.name)} style={{ scrollMarginTop: 80, margin: '18px 0 6px', fontSize: 17, fontWeight: 700, color: INK, fontFamily: mono }}>{e.name}</h3>
          <P>{e.when[lang]}</P>
          <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 12px' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520, fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6f6468' }}>
                  <th style={{ ...cell, fontWeight: 600 }}>{t('Campo de data', 'data field')}</th>
                  <th style={{ ...cell, fontWeight: 600 }}>{t('Tipo', 'Type')}</th>
                  <th style={{ ...cell, fontWeight: 600 }}>{t('O que é', 'What it is')}</th>
                </tr>
              </thead>
              <tbody>
                {e.fields.map((f) => (
                  <tr key={f.name}>
                    <td style={{ ...cell, fontFamily: mono, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{f.name}</td>
                    <td style={{ ...cell, fontFamily: mono, whiteSpace: 'nowrap' }}>{f.type}</td>
                    <td style={cell}>{f.note[lang]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 14px', margin: '0 0 12px', maxWidth: 760 }}>
            {([
              [t('O que fazer', 'What to do'), e.action[lang]],
              [t('Duplicados', 'Duplicates'), e.dedupe[lang]],
              [t('Ordem', 'Ordering'), e.ordering[lang]],
              [t('No Sandbox', 'In the Sandbox'), e.sandbox[lang]],
              ...(e.doa ? [[t('Como o DOA o usa', 'How DOA uses it'), e.doa[lang]]] : []),
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt style={{ fontSize: 12.5, fontWeight: 600, color: '#6f6468' }}>{k}</dt>
                <dd style={{ margin: 0, fontSize: 13.5, color: '#3f3538', lineHeight: 1.55 }}>{v}</dd>
              </div>
            ))}
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12.5, fontWeight: 600, color: '#6f6468' }}>{t('Relacionado', 'Related')}</dt>
              <dd style={{ margin: 0, fontSize: 13.5 }}>
                <a href={`${base}/reference#${e.endpoint}`} style={link}>{e.resource[lang]}</a>{' · '}
                <a href={`${base}/${e.guide}`} style={link}>{GUIDE[e.guide]?.[lang] ?? e.guide}</a>
              </dd>
            </div>
          </dl>
          <details style={{ margin: '0 0 8px' }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#9A1B22', margin: '0 0 8px' }}>
              {t('Exemplo de entrega', 'Example delivery')} — <Code>{e.name}</Code>
            </summary>
            <CodeBlock label={`json · ${e.name}`} raw={e.sample} onCopy={onCopy} {...copyProps} />
          </details>
        </section>
      ))}
    </>
  );
}
