'use client';

// The error reference, rendered from error-catalogue.json in either language.
//
// It used to be two hand-written tables, one per language, and they said
// things the API does not: a 403 FORBIDDEN "without an active binding" (that
// is 403 PAYMENTS_UNAVAILABLE), a 409 CONFLICT and a 422 VALIDATION_ERROR that
// no developer route returns. Now there is one list, derived from and checked
// against the source by tools/check-docs-error-catalogue.mjs, and both
// languages read it.

import catalogue from './error-catalogue.json';
import { H3, INK, MUT, P, mono } from './ui';

type Lang = 'pt' | 'en';
type Entry = {
  code: string;
  http: (number | string)[];
  family: string;
  meaning: Record<Lang, string>;
  action: Record<Lang, string>;
  retry: 'no' | 'yes' | 'after_delay' | 'after_change';
  idempotency_key: 'new' | 'same' | 'n/a';
};

const FAMILIES: { id: string; pt: string; en: string }[] = [
  { id: 'credentials', pt: 'Chave e permissões', en: 'Key and permissions' },
  { id: 'setup', pt: 'Configuração financeira', en: 'Financial setup' },
  { id: 'request', pt: 'Pedido inválido', en: 'Invalid request' },
  { id: 'not_found', pt: 'Não encontrado', en: 'Not found' },
  { id: 'idempotency', pt: 'Idempotência', en: 'Idempotency' },
  { id: 'state', pt: 'Estado da conta ou do recurso', en: 'Account or resource state' },
  { id: 'settlement', pt: 'Liquidações', en: 'Settlements' },
  { id: 'refund', pt: 'Reembolsos', en: 'Refunds' },
  { id: 'server', pt: 'Limites e falhas do Banzami', en: 'Limits and Banzami failures' },
];

const RETRY: Record<Entry['retry'], Record<Lang, string>> = {
  no: { pt: 'Não', en: 'No' },
  yes: { pt: 'Sim', en: 'Yes' },
  after_delay: { pt: 'Depois de esperar', en: 'After waiting' },
  after_change: { pt: 'Quando a condição mudar', en: 'Once the condition changes' },
};
const KEY: Record<Entry['idempotency_key'], Record<Lang, string>> = {
  new: { pt: 'nova', en: 'new' },
  same: { pt: 'a mesma', en: 'the same' },
  'n/a': { pt: '—', en: '—' },
};

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' };
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #F5E9E7', verticalAlign: 'top', color: '#5a4a4e' };

export const ERROR_CATALOGUE = catalogue.errors as Entry[];

export function ErrorCatalogue({ lang }: { lang: Lang }) {
  const t = (pt: string, en: string) => (lang === 'pt' ? pt : en);
  return (
    <>
      <P>{catalogue.idempotency_rule[lang]}</P>
      {FAMILIES.map((f) => {
        const rows = ERROR_CATALOGUE.filter((e) => e.family === f.id);
        if (!rows.length) return null;
        return (
          <div key={f.id}>
            <H3 id={`${t('erros', 'errors')}-${f.id.replace('_', '-')}`}>{f[lang]}</H3>
            <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={th}>{t('Código', 'Code')}</th>
                    <th style={th}>HTTP</th>
                    <th style={th}>{t('O que significa', 'What it means')}</th>
                    <th style={th}>{t('O que fazer', 'What to do')}</th>
                    <th style={th}>{t('Repetir?', 'Retry?')}</th>
                    <th style={th}>{t('Chave de idempotência', 'Idempotency key')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.code} id={`error-${e.code}`}>
                      <td style={{ ...td, fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#9A1B22', whiteSpace: 'nowrap' }}>{e.code}</td>
                      <td style={{ ...td, fontFamily: mono, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{e.http.join(' · ')}</td>
                      <td style={td}>{e.meaning[lang]}</td>
                      <td style={td}>{e.action[lang]}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{RETRY[e.retry][lang]}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: MUT }}>{KEY[e.idempotency_key][lang]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
