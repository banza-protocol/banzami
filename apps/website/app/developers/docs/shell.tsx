'use client';

// Shared documentation shell (P3A) — the SAME header, sidebar, layout grid and
// copy-toast the single-page docs used, reused verbatim for every area page.
// No new visual system: same styles, same components, same brand tokens. The
// sidebar now navigates between area routes instead of in-page anchors.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrandTile } from '@/components/developers/portal/icons';
import { DOCS_SANS, INK, LINK, MUT, RED, backLinkStyle } from './ui';
import { DocsSearch, OnThisPage } from './DocsSearch';

export type CopyFn = (text: string, label: string) => void;

export const AREAS_PT: { slug: string; label: string; desc: string }[] = [
  { slug: '', label: 'Início', desc: 'O que pode construir e por onde começar.' },
  { slug: 'get-started', label: 'Quickstart', desc: 'Da conta ao primeiro pagamento confirmado.' },
  { slug: 'concepts', label: 'Como o Banzami funciona', desc: 'Modelo, ambientes, montantes e idempotência.' },
  { slug: 'payments', label: 'Aceitar pagamentos', desc: 'Sessões, links e QR.' },
  { slug: 'webhooks', label: 'Webhooks', desc: 'Receber e verificar eventos.' },
  { slug: 'refunds', label: 'Reembolsos', desc: 'Devolver um pagamento, total ou parcialmente.' },
  { slug: 'settlements', label: 'Liquidações', desc: 'Transferir o saldo de uma conta para um beneficiário.' },
  { slug: 'receipts', label: 'Comprovativos', desc: 'Referências públicas e verificação.' },
  { slug: 'transfers', label: 'Contas e transferências', desc: 'Contas segregadas e movimentos entre contas.' },
  { slug: 'doa', label: 'Construir como o DOA', desc: 'Uma integração completa, de referência.' },
  { slug: 'console', label: 'A Consola', desc: 'Workspaces, projetos, chaves, webhooks e registos.' },
  { slug: 'reference', label: 'Referência da API', desc: 'Cada endpoint da API v1.' },
  { slug: 'events', label: 'Eventos', desc: 'Os eventos de webhook e os seus campos.' },
  { slug: 'errors', label: 'Erros', desc: 'O envelope de erro e todos os códigos.' },
  { slug: 'sdk', label: 'SDKs', desc: 'Pacotes publicados e o que cada um trata.' },
  { slug: 'artifacts', label: 'Artefactos', desc: 'OpenAPI, Postman e manifests.' },
  { slug: 'testing', label: 'Testar no Sandbox', desc: 'Cenários de teste, com resultados esperados.' },
  { slug: 'going-live', label: 'Do Sandbox ao Live', desc: 'Estado de Live e lista de verificação.' },
  { slug: 'trust', label: 'Segurança', desc: 'Chaves, segredos e rotação.' },
  { slug: 'glossary', label: 'Glossário', desc: 'Os termos desta documentação.' },
  { slug: 'troubleshooting', label: 'Resolução de problemas', desc: 'Por sintoma.' },
  { slug: 'support', label: 'Suporte', desc: 'Como pedir ajuda.' },
  { slug: 'changelog', label: 'Changelog', desc: 'Alterações, impacto e ação.' },
];

export const AREAS_EN: { slug: string; label: string; desc: string }[] = [
  { slug: '', label: 'Home', desc: 'What you can build and where to start.' },
  { slug: 'get-started', label: 'Quickstart', desc: 'From sign-up to your first confirmed payment.' },
  { slug: 'concepts', label: 'How Banzami works', desc: 'Model, environments, amounts and idempotency.' },
  { slug: 'payments', label: 'Accept payments', desc: 'Sessions, links and QR.' },
  { slug: 'webhooks', label: 'Webhooks', desc: 'Receive and verify events.' },
  { slug: 'refunds', label: 'Refunds', desc: 'Return a payment in full or in part.' },
  { slug: 'settlements', label: 'Settlements', desc: 'Pay out an account balance to a beneficiary.' },
  { slug: 'receipts', label: 'Receipts', desc: 'Public references and verification.' },
  { slug: 'transfers', label: 'Accounts and transfers', desc: 'Segregated accounts and moves between them.' },
  { slug: 'doa', label: 'Build like DOA', desc: 'A complete reference integration.' },
  { slug: 'console', label: 'The Console', desc: 'Workspaces, projects, keys, webhooks and logs.' },
  { slug: 'reference', label: 'API reference', desc: 'Every v1 endpoint.' },
  { slug: 'events', label: 'Events', desc: 'Webhook events and their fields.' },
  { slug: 'errors', label: 'Errors', desc: 'The error envelope and every code.' },
  { slug: 'sdk', label: 'SDKs', desc: 'Published packages and what each handles.' },
  { slug: 'artifacts', label: 'Artifacts', desc: 'OpenAPI, Postman and manifests.' },
  { slug: 'testing', label: 'Sandbox testing', desc: 'Test scenarios with expected results.' },
  { slug: 'going-live', label: 'From Sandbox toward Live', desc: 'Live status and a readiness checklist.' },
  { slug: 'trust', label: 'Security', desc: 'Keys, secrets and rotation.' },
  { slug: 'glossary', label: 'Glossary', desc: 'The terms used in these docs.' },
  { slug: 'troubleshooting', label: 'Troubleshooting', desc: 'By symptom.' },
  { slug: 'support', label: 'Support', desc: 'How to get help.' },
  { slug: 'changelog', label: 'Changelog', desc: 'Changes, impact and action.' },
];

/** Sidebar groups, by what a developer is trying to do. Every slug appears once. */
export const NAV_GROUPS: { id: string; title: { pt: string; en: string }; slugs: string[] }[] = [
  { id: 'start', title: { pt: 'Começar', en: 'Get started' }, slugs: ['', 'get-started', 'concepts'] },
  { id: 'build', title: { pt: 'Construir', en: 'Build' }, slugs: ['payments', 'webhooks', 'refunds', 'settlements', 'receipts', 'transfers', 'doa'] },
  { id: 'console', title: { pt: 'Consola', en: 'Console' }, slugs: ['console'] },
  { id: 'reference', title: { pt: 'Referência', en: 'Reference' }, slugs: ['reference', 'events', 'errors', 'sdk', 'artifacts'] },
  { id: 'learn', title: { pt: 'Aprender', en: 'Learn' }, slugs: ['testing', 'going-live', 'trust', 'glossary'] },
  { id: 'resources', title: { pt: 'Recursos', en: 'Resources' }, slugs: ['troubleshooting', 'support', 'changelog'] },
];

/** Pages long enough to need an "on this page" box. */
export const TOC_PAGES = ['get-started', 'concepts', 'payments', 'webhooks', 'refunds', 'settlements', 'receipts', 'transfers', 'doa', 'console', 'reference', 'errors', 'sdk', 'testing', 'going-live', 'trust'];

const base = (lang: 'pt' | 'en') => (lang === 'pt' ? '/docs' : '/docs/en');
export const areaHref = (lang: 'pt' | 'en', slug: string) => (slug ? `${base(lang)}/${slug}` : base(lang));

export function DocsShell({ lang, active, children }: { lang: 'pt' | 'en'; active: string; children: (copy: CopyFn) => ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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
  const hasToc = TOC_PAGES.includes(active);
  const chapterKicker = { prev: lang === 'pt' ? 'Capítulo anterior' : 'Previous chapter', next: lang === 'pt' ? 'Próximo capítulo' : 'Next chapter' };

  return (
    <div style={{ minHeight: '100vh', background: '#FCFAFA', display: 'flex', flexDirection: 'column', fontFamily: DOCS_SANS }}>
      <a href="#docs-content" className="bz-skip">{lang === 'pt' ? 'Saltar para o conteúdo' : 'Skip to content'}</a>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 28px', maxWidth: 1320, width: '100%', margin: '0 auto' }}>
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

      <main style={{ flex: 1, maxWidth: 1320, width: '100%', margin: '0 auto', padding: '10px 26px 72px' }}>
        <div className={`bz-docsgrid${hasToc ? ' has-toc' : ''}`}>
          <aside className="bz-docsnav">
            <DocsSearch lang={lang} />
            <button type="button" className="bz-docsmenu-toggle" aria-expanded={menuOpen} aria-controls="docs-nav-list" onClick={() => setMenuOpen((o) => !o)}
              style={{ width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', margin: '10px 0 0', border: '1px solid #EAE3E3', borderRadius: 10, background: '#fff', color: INK, font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              <span>{areas.find((x) => x.slug === active)?.label ?? (lang === 'pt' ? 'Documentação' : 'Documentation')}</span>
              <span aria-hidden="true">{menuOpen ? '▴' : '▾'}</span>
            </button>
            <div id="docs-nav-list" className={`bz-docsnavlist${menuOpen ? ' is-open' : ''}`} style={{ marginTop: 12 }}>
            <nav aria-label={lang === 'pt' ? 'Secções da documentação' : 'Documentation sections'} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {NAV_GROUPS.map((g) => (
                <div key={g.id}>
                  <p style={{ margin: '0 0 4px', padding: '0 12px', fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: MUT }}>{g.title[lang]}</p>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {g.slugs.map((slug) => {
                      const a = areas.find((x) => x.slug === slug)!;
                      const on = active === slug;
                      return (
                        <li key={slug || 'home'}>
                          <a
                            href={areaHref(lang, slug)}
                            aria-current={on ? 'page' : undefined}
                            className="bz-toplink"
                            style={{ display: 'block', padding: '6px 12px', borderRadius: 8, background: on ? '#F8EDEC' : 'transparent', color: on ? RED : '#4a4044', fontSize: 14, fontWeight: on ? 600 : 400, textDecoration: 'none', borderLeft: on ? `2px solid ${RED}` : '2px solid transparent' }}
                          >
                            {a.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
            </div>
          </aside>

          <article id="docs-content" className="bz-docarticle" tabIndex={-1} style={{ minWidth: 0, outline: 'none' }}>
            {/* Narrow screens: a collapsed list above the content. Wide screens use the rail. */}
            {hasToc ? <OnThisPage lang={lang} variant="inline" /> : null}
            {children(copy)}

            {/* Chapter navigation — prev/next, reusing the doccard visual style */}
            {(prev || next) ? (
              <nav aria-label={lang === 'pt' ? 'Navegação de capítulos' : 'Chapter navigation'} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '10px 0 4px' }}>
                {prev ? (
                  <a href={areaHref(lang, prev.slug)} className="bz-doccard" style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #EAE3E3', borderRadius: 12, padding: 14 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: MUT }}>← {chapterKicker.prev}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 600, color: LINK }}>{prev.label}</p>
                  </a>
                ) : <span />}
                {next ? (
                  <a href={areaHref(lang, next.slug)} className="bz-doccard" style={{ display: 'block', textDecoration: 'none', textAlign: 'right', background: '#fff', border: '1px solid #EAE3E3', borderRadius: 12, padding: 14 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: MUT }}>{chapterKicker.next} →</p>
                    <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 600, color: LINK }}>{next.label}</p>
                  </a>
                ) : <span />}
              </nav>
            ) : null}

            {/* Help */}
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #EAE3E3', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ flex: '1 1 220px' }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: INK }}>{lang === 'pt' ? 'Precisa de ajuda?' : 'Need help?'}</p>
                <p style={{ margin: '3px 0 0', fontSize: 13.5, color: MUT }}>{lang === 'pt' ? 'Comece pela resolução de problemas, ou escreva ao suporte com o request_id.' : 'Start with troubleshooting, or write to support with the request_id.'}</p>
              </div>
              <a href={areaHref(lang, 'troubleshooting')} className="bz-toplink" style={{ ...backLinkStyle, color: LINK, fontWeight: 600 }}>{lang === 'pt' ? 'Resolução de problemas' : 'Troubleshooting'}</a>
              <a href={areaHref(lang, 'support')} className="bz-cta" style={{ padding: '9px 14px', borderRadius: 10, background: RED, color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                {lang === 'pt' ? 'Contactar o suporte' : 'Contact support'}
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

          {/* Only pages long enough to need one; the others have no sections. */}
          {hasToc ? <aside className="bz-toc-rail"><OnThisPage lang={lang} variant="rail" /></aside> : null}
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
