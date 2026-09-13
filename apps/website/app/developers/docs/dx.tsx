'use client';

// Building blocks for task-shaped documentation pages. Each one exists because a
// page needed to answer the same questions in the same place every time: what
// is this, why, what do I do, how do I know it worked, and what comes next.
// Same palette and type as ui.tsx; nothing here introduces a new visual language.

import type { ReactNode } from 'react';
import { INK, LINK, RED } from './ui';

type Lang = 'pt' | 'en';
const tr = (lang: Lang, pt: string, en: string) => (lang === 'pt' ? pt : en);

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #EAE3E3', borderRadius: 12, padding: '16px 18px',
  margin: '0 0 14px', maxWidth: 760,
};
const kicker: React.CSSProperties = { margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#6f6468' };
const rowText: React.CSSProperties = { margin: 0, fontSize: 14, lineHeight: 1.6, color: '#3f3538', fontWeight: 400, minWidth: 0, overflowWrap: 'break-word' };

// ── progress model ───────────────────────────────────────────────────────────

export type Stage = { title: string; steps: [number, number]; note: string };

/** The stages of a multi-step guide, each linking to its first step. */
export function StageBar({ lang, stages, anchor }: { lang: Lang; stages: Stage[]; anchor: (n: number) => string }) {
  return (
    <nav aria-label={tr(lang, 'Etapas', 'Stages')} style={{ margin: '0 0 18px', maxWidth: 760 }}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {stages.map((s, i) => (
          <li key={s.title}>
            <a href={`#${anchor(s.steps[0])}`} className="bz-doccard" style={{ display: 'block', height: '100%', textDecoration: 'none', background: '#fff', border: '1px solid #EAE3E3', borderRadius: 14, padding: '10px 12px' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: RED }}>
                {tr(lang, 'ETAPA', 'STAGE')} {i + 1} · {tr(lang, 'PASSOS', 'STEPS')} {s.steps[0]}{s.steps[1] !== s.steps[0] ? `–${s.steps[1]}` : ''}
              </span>
              <span style={{ display: 'block', margin: '3px 0 0', fontSize: 14, fontWeight: 700, color: INK }}>{s.title}</span>
              <span style={{ display: 'block', margin: '2px 0 0', fontSize: 12.5, fontWeight: 400, color: '#6f6468', lineHeight: 1.45 }}>{s.note}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ── one step: what, why, do, done, next ──────────────────────────────────────

export function StepCard({
  lang, n, of, id, title, what, why, success, next, children,
}: {
  lang: Lang; n: number; of: number; id: string; title: string;
  what: ReactNode; why: ReactNode; success: ReactNode; next: ReactNode; children: ReactNode;
}) {
  const label = (k: string) => <dt style={{ fontSize: 12, fontWeight: 700, color: '#6f6468', paddingTop: 2 }}>{k}</dt>;
  return (
    <section id={id} aria-labelledby={`${id}-title`} style={{ ...card, scrollMarginTop: 80 }}>
      <p style={kicker}>{tr(lang, 'PASSO', 'STEP')} {n} {tr(lang, 'DE', 'OF')} {of}</p>
      <h3 id={`${id}-title`} style={{ margin: '2px 0 10px', fontSize: 17, fontWeight: 700, color: INK }}>{title}</h3>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(78px, max-content) 1fr', gap: '6px 14px', margin: 0 }}>
        {label(tr(lang, 'O quê', 'What'))}<dd style={rowText}>{what}</dd>
        {label(tr(lang, 'Porquê', 'Why'))}<dd style={rowText}>{why}</dd>
        {label(tr(lang, 'Fazer', 'Do'))}<dd style={{ ...rowText, minWidth: 0 }}>{children}</dd>
        {label(tr(lang, 'Feito quando', 'Done when'))}<dd style={{ ...rowText, color: '#1F6B47', fontWeight: 600 }}>{success}</dd>
        {label(tr(lang, 'A seguir', 'Next'))}<dd style={rowText}>{next}</dd>
      </dl>
    </section>
  );
}

// ── the end of every guide: somewhere to go ─────────────────────────────────

export type NextItem = { href: string; title: string; desc: string };

export function NextStepCards({ lang, items }: { lang: Lang; items: NextItem[] }) {
  return (
    <nav aria-label={tr(lang, 'Próximos passos', 'Next steps')} style={{ margin: '26px 0 18px', maxWidth: 760 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, color: INK }}>{tr(lang, 'Próximos passos', 'Next steps')}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
        {items.map((i) => (
          <a key={i.href} href={i.href} className="bz-doccard" style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #EAE3E3', borderRadius: 14, padding: '12px 14px' }}>
            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: LINK }}>{i.title}</span>
            <span style={{ display: 'block', margin: '3px 0 0', fontSize: 13, fontWeight: 400, color: '#6f6468', lineHeight: 1.45 }}>{i.desc}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

// ── task cards on the home page ──────────────────────────────────────────────

export function TaskCards({ items }: { items: NextItem[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, margin: '0 0 22px' }}>
      {items.map((i) => (
        <a key={i.href} href={i.href} className="bz-doccard" style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #EAE3E3', borderRadius: 16, padding: '14px 16px' }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: INK }}>{i.title}</span>
          <span style={{ display: 'block', margin: '4px 0 0', fontSize: 13, fontWeight: 400, color: '#6f6468', lineHeight: 1.5 }}>{i.desc}</span>
        </a>
      ))}
    </div>
  );
}

// ── a recipe: one scenario, tested the same way every time ───────────────────

export type RecipeFields = {
  id: string; title: string;
  trigger: ReactNode; api: ReactNode; event: ReactNode; console: ReactNode; cleanup: ReactNode;
  limits?: ReactNode;
};

export function RecipeCard({ lang, r }: { lang: Lang; r: RecipeFields }) {
  const rows: [string, ReactNode][] = [
    [tr(lang, 'Como provocar', 'How to trigger'), r.trigger],
    [tr(lang, 'Resposta da API', 'API result'), r.api],
    [tr(lang, 'Evento', 'Event'), r.event],
    [tr(lang, 'Na Consola', 'In the Console'), r.console],
    [tr(lang, 'Limpar', 'Clean up'), r.cleanup],
    ...(r.limits ? [[tr(lang, 'Limitações', 'Limitations'), r.limits] as [string, ReactNode]] : []),
  ];
  return (
    <section id={r.id} aria-labelledby={`${r.id}-title`} style={{ ...card, scrollMarginTop: 80 }}>
      <h3 id={`${r.id}-title`} style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: INK }}>{r.title}</h3>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, max-content) 1fr', gap: '6px 14px', margin: 0 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt style={{ fontSize: 12, fontWeight: 700, color: '#6f6468', paddingTop: 2 }}>{k}</dt>
            <dd style={rowText}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── a tutorial chapter: the application's half and Banzami's half ────────────

export function ChapterFacts({
  lang, goal, app, banzami, result, failure, appLabel,
}: { lang: Lang; goal: ReactNode; app: ReactNode; banzami: ReactNode; result: ReactNode; failure: ReactNode; appLabel: string }) {
  const rows: [string, ReactNode, string?][] = [
    [tr(lang, 'Objetivo', 'Goal'), goal],
    [tr(lang, `O ${appLabel} faz`, `${appLabel} does`), app],
    [tr(lang, 'O Banzami faz', 'Banzami does'), banzami, '#9A1B22'],
    [tr(lang, 'Resultado esperado', 'Expected result'), result, '#1F6B47'],
    [tr(lang, 'Falha comum', 'Common failure'), failure],
  ];
  return (
    <dl style={{ ...card, display: 'grid', gridTemplateColumns: 'minmax(96px, max-content) 1fr', gap: '6px 14px' }}>
      {rows.map(([k, v, color]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt style={{ fontSize: 12, fontWeight: 700, color: '#6f6468', paddingTop: 2 }}>{k}</dt>
          <dd style={{ ...rowText, ...(color ? { color, fontWeight: 600 } : {}) }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── do / do not ──────────────────────────────────────────────────────────────

export function DoDont({ lang, dos, donts }: { lang: Lang; dos: ReactNode[]; donts: ReactNode[] }) {
  const col = (title: string, items: ReactNode[], ok: boolean) => (
    <div style={{ ...card, margin: 0, borderColor: ok ? '#CFE9DA' : '#F7DAD7', background: ok ? '#F6FBF8' : '#FFF7F6' }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: ok ? '#1F6B47' : '#9A1B22' }}>{title}</p>
      <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it, i) => <li key={i} style={{ fontSize: 13.5, lineHeight: 1.55, color: '#3f3538' }}>{it}</li>)}
      </ul>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, margin: '0 0 16px', maxWidth: 760 }}>
      {col(tr(lang, 'Faça', 'Do'), dos, true)}
      {col(tr(lang, 'Nunca', 'Never'), donts, false)}
    </div>
  );
}
