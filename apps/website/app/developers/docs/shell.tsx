'use client';

// Shared documentation shell (P3A) — the SAME header, sidebar, layout grid and
// copy-toast the single-page docs used, reused verbatim for every area page.
// No new visual system: same styles, same components, same brand tokens. The
// sidebar now navigates between area routes instead of in-page anchors.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrandTile } from '@/components/developers/portal/icons';
import { INK, RED, backLinkStyle } from './ui';
import { DocsSearch, OnThisPage } from './DocsSearch';

export type CopyFn = (text: string, label: string) => void;

export const AREAS_PT: { slug: string; label: string; desc: string }[] = [
  { slug: '', label: 'Início', desc: 'Página inicial da documentação.' },
  { slug: 'get-started', label: 'Começar', desc: 'Visão geral, estado atual e quickstart.' },
  { slug: 'console', label: 'A Consola', desc: 'Conta, workspaces, projetos, configuração financeira, chaves, webhooks e registos.' },
  { slug: 'sdk', label: 'SDKs', desc: 'Modelo SDK-first, pacotes publicados e onboarding.' },
  { slug: 'guides', label: 'Guias', desc: 'Cobranças, transferências, reembolsos e webhooks.' },
  { slug: 'doa', label: 'Implementação de referência', desc: 'O DOA — uma aplicação real integrada pelos contratos públicos.' },
  { slug: 'reference', label: 'Referência API', desc: 'Credenciais, endpoints, erros e idempotência.' },
  { slug: 'testing', label: 'Testar no Sandbox', desc: 'O que o Sandbox é, validação e limites.' },
  { slug: 'trust', label: 'Segurança', desc: 'Credenciais, segredos de webhook, e o que o Sandbox garante.' },
  { slug: 'artifacts', label: 'Artefactos', desc: 'OpenAPI, Postman, manifests e exemplos.' },
  { slug: 'changelog', label: 'Changelog', desc: 'Mudanças datadas por categoria.' },
  { slug: 'glossary', label: 'Glossário', desc: 'Conceitos usados nesta documentação.' },
];

export const AREAS_EN: { slug: string; label: string; desc: string }[] = [
  { slug: '', label: 'Home', desc: 'Documentation home page.' },
  { slug: 'get-started', label: 'Get started', desc: 'Overview, current status and quickstart.' },
  { slug: 'console', label: 'The Console', desc: 'Account, workspaces, projects, financial setup, keys, webhooks and logs.' },
  { slug: 'sdk', label: 'SDKs', desc: 'SDK-first model, published packages, and what each SDK handles.' },
  { slug: 'guides', label: 'Guides', desc: 'Payments, webhooks and task guides.' },
  { slug: 'doa', label: 'Reference implementation', desc: 'DOA — a real application integrated through the public contracts.' },
  { slug: 'reference', label: 'API Reference', desc: 'Credentials, endpoints, errors and idempotency.' },
  { slug: 'testing', label: 'Sandbox testing', desc: 'What Sandbox means, validation and limits.' },
  { slug: 'trust', label: 'Security', desc: 'Credentials, webhook secrets, and what the Sandbox guarantees.' },
  { slug: 'artifacts', label: 'Artifacts', desc: 'OpenAPI, Postman, manifests and examples.' },
  { slug: 'changelog', label: 'Changelog', desc: 'Dated changes by category.' },
  { slug: 'glossary', label: 'Glossary', desc: 'Concepts used across this documentation.' },
];

// P3B — three primary "choose your path" cards for the landing pages, and the
// three developer-journey trails. Data only; rendered with existing card/link
// styles on the home pages (no new visual system).
export const PRIMARY_PATHS_PT: { slug: string; title: string; desc: string }[] = [
  { slug: 'get-started', title: 'Começar', desc: 'Da primeira chamada ao primeiro pagamento — SDK-first, curl para inspeccionar o protocolo.' },
  { slug: 'testing', title: 'Validar no Sandbox', desc: 'Checklist de validação, limites e o que o Sandbox não é. Nunca há dinheiro real.' },
  { slug: 'reference', title: 'Consultar referência técnica', desc: 'Camada de referência do protocolo (API/OpenAPI) — não é o caminho de implementação recomendado.' },
];
export const PRIMARY_PATHS_EN: { slug: string; title: string; desc: string }[] = [
  { slug: 'get-started', title: 'Get started', desc: 'From the first call to the first payment — SDK-first, curl to inspect the protocol.' },
  { slug: 'testing', title: 'Validate in Sandbox', desc: 'Validation checklist, limits and what the Sandbox is not. No real money ever moves.' },
  { slug: 'reference', title: 'Read technical reference', desc: 'Protocol reference layer (API/OpenAPI) — not the recommended implementation path.' },
];

export const JOURNEYS_PT: { role: string; steps: { slug: string; label: string }[] }[] = [
  { role: 'Novo developer', steps: [{ slug: '', label: 'Início' }, { slug: 'get-started', label: 'Começar' }, { slug: 'sdk', label: 'SDKs' }, { slug: 'testing', label: 'Testar no Sandbox' }, { slug: 'trust', label: 'Segurança' }] },
  { role: 'Developer técnico', steps: [{ slug: '', label: 'Início' }, { slug: 'sdk', label: 'SDKs' }, { slug: 'guides', label: 'Guias' }, { slug: 'reference', label: 'Referência API' }, { slug: 'artifacts', label: 'Artefactos' }] },
  { role: 'Auditor/avaliador técnico', steps: [{ slug: '', label: 'Início' }, { slug: 'trust', label: 'Segurança' }, { slug: 'artifacts', label: 'Artefactos' }, { slug: 'changelog', label: 'Changelog' }] },
];
export const JOURNEYS_EN: { role: string; steps: { slug: string; label: string }[] }[] = [
  { role: 'New developer', steps: [{ slug: '', label: 'Home' }, { slug: 'get-started', label: 'Get started' }, { slug: 'sdk', label: 'SDKs' }, { slug: 'testing', label: 'Sandbox testing' }, { slug: 'trust', label: 'Security' }] },
  { role: 'Technical developer', steps: [{ slug: '', label: 'Home' }, { slug: 'sdk', label: 'SDKs' }, { slug: 'guides', label: 'Guides' }, { slug: 'reference', label: 'API Reference' }, { slug: 'artifacts', label: 'Artifacts' }] },
  { role: 'Technical reviewer', steps: [{ slug: '', label: 'Home' }, { slug: 'trust', label: 'Security' }, { slug: 'artifacts', label: 'Artifacts' }, { slug: 'changelog', label: 'Changelog' }] },
];

const base = (lang: 'pt' | 'en') => (lang === 'pt' ? '/docs' : '/docs/en');
export const areaHref = (lang: 'pt' | 'en', slug: string) => (slug ? `${base(lang)}/${slug}` : base(lang));

export function DocsShell({ lang, active, children }: { lang: 'pt' | 'en'; active: string; children: (copy: CopyFn) => ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The document language follows the page.
   *
   * Only the root layout renders <html>, and it declares pt — so every page
   * under /docs/en told assistive technology it was Portuguese. A screen reader
   * takes that literally and reads English prose with Portuguese pronunciation,
   * which is worse than no declaration at all. Nothing else on the page can fix
   * it, because nothing else owns the element.
   */
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = previous; };
  }, [lang]);
  const copy = useCallback<CopyFn>((text, label) => {
    const onOk = () => {
      setToast(label);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 1600);
    };
    navigator?.clipboard?.writeText(text)?.then(onOk, () => {});
  }, []);

  const areas = lang === 'pt' ? AREAS_PT : AREAS_EN;
  const otherLangHref = lang === 'pt' ? areaHref('en', active) : areaHref('pt', active);

  // Chapter navigation — single source of truth is the AREAS order (same as the
  // sidebar and landing cards). prev/next are the neighbours in that sequence;
  // the first page has no prev and the last has no next.
  const idx = areas.findIndex((a) => a.slug === active);
  const prev = idx > 0 ? areas[idx - 1] : null;
  const next = idx >= 0 && idx < areas.length - 1 ? areas[idx + 1] : null;
  const chapterKicker = { prev: lang === 'pt' ? 'Capítulo anterior' : 'Previous chapter', next: lang === 'pt' ? 'Próximo capítulo' : 'Next chapter' };

  return (
    <div style={{ minHeight: '100vh', background: '#FFF9F8', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 28px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <a href="https://banzami.com" aria-label={lang === 'pt' ? 'Voltar ao Banzami' : 'Back to Banzami'} className="bz-toplink" style={backLinkStyle}>
            <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>←</span>
            {lang === 'pt' ? 'Voltar ao Banzami' : 'Back to Banzami'}
          </a>
          <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <BrandTile size={32} radius={10} />
            <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: '-.02em', color: INK }}>
              Banzami <span style={{ color: RED }}>Developers</span>
            </span>
          </span>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <a href={otherLangHref} className="bz-toplink" aria-label={lang === 'pt' ? 'Read the documentation in English' : 'Ler a documentação em português'} style={backLinkStyle}>
            {lang === 'pt' ? 'EN' : 'PT'}
          </a>
          <a href="/login" className="bz-toplink" aria-label={lang === 'pt' ? 'Entrar na Consola' : 'Open the Console'} style={{ ...backLinkStyle, color: RED, fontWeight: 800 }}>
            {lang === 'pt' ? 'Entrar na Consola' : 'Open the Console'}
            <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>→</span>
          </a>
        </span>
      </header>

      <main style={{ flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', padding: '10px 26px 72px' }}>
        <div className="bz-docsgrid" style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 26, alignItems: 'start' }}>
          <aside className="bz-docsnav">
            <DocsSearch lang={lang} />
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 900, letterSpacing: '.06em', color: '#a89a9e' }}>
              {lang === 'pt' ? 'DOCUMENTAÇÃO' : 'DOCUMENTATION'}
            </p>
            <nav aria-label={lang === 'pt' ? 'Secções da documentação' : 'Documentation sections'} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {areas.map((a) => {
                const on = active === a.slug;
                return (
                  <a
                    key={a.slug || 'home'}
                    href={areaHref(lang, a.slug)}
                    aria-current={on ? 'true' : undefined}
                    className="bz-toplink"
                    style={{ padding: '8px 12px', borderRadius: 10, background: on ? '#FFF1F0' : 'transparent', color: on ? RED : '#6a5a5e', fontSize: 13.5, fontWeight: on ? 800 : 700, textDecoration: 'none' }}
                  >
                    {a.label}
                  </a>
                );
              })}
            </nav>
          </aside>

          <article style={{ minWidth: 0 }}>
            {/* Only pages long enough to need one; the others have no sections. */}
            {['get-started', 'console', 'sdk', 'guides', 'doa', 'reference', 'trust'].includes(active) ? <OnThisPage lang={lang} /> : null}
            {children(copy)}

            {/* Chapter navigation — prev/next, reusing the doccard visual style */}
            {(prev || next) ? (
              <nav aria-label={lang === 'pt' ? 'Navegação de capítulos' : 'Chapter navigation'} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '10px 0 4px' }}>
                {prev ? (
                  <a href={areaHref(lang, prev.slug)} className="bz-doccard" style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 16, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}>
                    <p style={{ margin: 0, fontSize: 11.5, fontWeight: 800, letterSpacing: '.03em', color: '#a89a9e' }}>← {chapterKicker.prev}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 14.5, fontWeight: 900, color: RED }}>{prev.label}</p>
                  </a>
                ) : <span />}
                {next ? (
                  <a href={areaHref(lang, next.slug)} className="bz-doccard" style={{ display: 'block', textDecoration: 'none', textAlign: 'right', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 16, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}>
                    <p style={{ margin: 0, fontSize: 11.5, fontWeight: 800, letterSpacing: '.03em', color: '#a89a9e' }}>{chapterKicker.next} →</p>
                    <p style={{ margin: '4px 0 0', fontSize: 14.5, fontWeight: 900, color: RED }}>{next.label}</p>
                  </a>
                ) : <span />}
              </nav>
            ) : null}

            {/* Blush help card (same as before) */}
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 14, background: '#FFF1F0', border: '1px solid #F7DAD7', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: INK }}>{lang === 'pt' ? 'Precisa de ajuda?' : 'Need help?'}</p>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: '#a08a8c', fontWeight: 600 }}>{lang === 'pt' ? 'A nossa equipa de suporte está disponível.' : 'Our support team is available.'}</p>
              </div>
              <a href="/suporte" className="bz-cta" style={{ padding: '11px 18px', border: 'none', borderRadius: 12, background: 'linear-gradient(160deg,#B5101F,#7C1016)', color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', textDecoration: 'none', boxShadow: '0 12px 24px -12px rgba(181,16,31,.5)' }}>
                {lang === 'pt' ? 'Abrir suporte' : 'Open support'}
              </a>
            </div>

            {/* Back to documentation home */}
            <p style={{ margin: '18px 0 0' }}>
              <a href={base(lang)} className="bz-toplink" style={{ ...backLinkStyle, color: RED, fontWeight: 800 }}>
                <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>←</span>
                {lang === 'pt' ? 'Voltar ao início da documentação' : 'Back to documentation home'}
              </a>
            </p>
          </article>
        </div>
      </main>

      <div aria-live="polite" style={{ position: 'fixed', left: 0, right: 0, bottom: 26, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 60 }}>
        {toast ? (
          <span style={{ background: '#2a2024', color: '#fff', fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: 12, boxShadow: '0 16px 40px -18px rgba(0,0,0,.5)' }}>{toast}</span>
        ) : null}
      </div>
    </div>
  );
}
