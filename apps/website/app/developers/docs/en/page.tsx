'use client';

// EN documentation home (P3B) — clear, scannable landing/index mirroring PT.

import { DocsShell, AREAS_EN, PRIMARY_PATHS_EN, JOURNEYS_EN, areaHref } from '../shell';
import { Badge, Callout, INK, LI, MUT, P, RED, UL } from '../ui';

// Kept in lockstep with STATE_PT — see the note there. A row moves only when
// deployed-Sandbox evidence moves it, in either direction.
const STATE_EN: [string, string][] = [
  ['TypeScript SDK', 'published — npm install @banzami/sdk'],
  ['Other SDKs', 'controlled preview, not publicly published'],
  ['HTTP/OpenAPI', 'secondary technical reference'],
  ['Production / live rails', 'not available'],
  ['Developer Console', 'operational in Sandbox'],
  ['Refunds / transfers', 'Pending E2E for developer keys'],
  ['Webhook outbound', 'signed delivery, verified in Sandbox'],
];

export default function DocsHomeEn() {
  return (
    <DocsShell lang="en" active="">
      {() => (
        <section id="home" style={{ scrollMarginTop: 72, marginBottom: 46 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>Banzami Developers Documentation</h1>
          <P style={{ fontSize: 15.5, color: MUT, fontWeight: 600 }}>
            <strong>SDK-first</strong> payment infrastructure for Angola. Banzami SDKs are the recommended path; the HTTP API
            and OpenAPI exist as the technical protocol reference. Current scope: <strong>Sandbox / Preview</strong>.
          </P>

          {/* Three primary paths */}
          <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '18px 0 20px' }}>
            {PRIMARY_PATHS_EN.map((p) => (
              <a key={p.slug} href={areaHref('en', p.slug)} className="bz-doccard" style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 18, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: RED }}>{p.title}</p>
                <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.5 }}>{p.desc}</p>
              </a>
            ))}
          </div>

          {/* Current status — concise summary */}
          <div id="status" style={{ scrollMarginTop: 72, margin: '0 0 22px', borderRadius: 16, border: '1px solid #F7DAD7', background: '#FFF7F6', padding: '16px 18px', maxWidth: 660 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: INK }}>Current status</span>
              <Badge tone="prep">Sandbox / Preview</Badge>
            </div>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
              {STATE_EN.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ fontSize: 13, fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{k}</dt>
                  <dd style={{ margin: 0, fontSize: 13, color: '#5a4a4e', fontWeight: 500 }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Full section grid */}
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 900, letterSpacing: '.05em', color: '#a89a9e' }}>ALL SECTIONS</p>
          <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '0 0 26px' }}>
            {AREAS_EN.filter((a) => a.slug).map((a) => (
              <a key={a.slug} href={areaHref('en', a.slug)} className="bz-doccard" style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 16, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: INK }}>{a.label}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8a7a7e', fontWeight: 600 }}>{a.desc}</p>
              </a>
            ))}
          </div>

          {/* Journeys by profile */}
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 900, letterSpacing: '.05em', color: '#a89a9e' }}>SUGGESTED JOURNEYS</p>
          <UL>
            {JOURNEYS_EN.map((j) => (
              <LI key={j.role}>
                <strong>{j.role}:</strong>{' '}
                {j.steps.map((s, i) => (
                  <span key={s.slug || 'home'}>
                    {i > 0 ? ' → ' : ''}
                    <a href={areaHref('en', s.slug)} style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>{s.label}</a>
                  </span>
                ))}
              </LI>
            ))}
          </UL>

          <Callout>
            Nothing in this documentation activates live rails, authorizes real money, or represents regulatory approval.
          </Callout>
        </section>
      )}
    </DocsShell>
  );
}
