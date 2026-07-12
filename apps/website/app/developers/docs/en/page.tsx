'use client';

// EN documentation home (P3A) — clean landing/index page mirroring the PT home.

import { DocsShell, AREAS_EN, areaHref } from '../shell';
import { Badge, Callout, INK, LI, MUT, P, UL } from '../ui';

export default function DocsHomeEn() {
  return (
    <DocsShell lang="en" active="">
      {() => (
        <section id="home" style={{ scrollMarginTop: 72, marginBottom: 46 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>Banzami Developers Documentation</h1>
          <P style={{ fontSize: 15.5, color: MUT, fontWeight: 600 }}>
            Integrate Banzami payments with an <strong>SDK-first</strong> model: Banzami SDKs are the recommended path;
            the HTTP API and OpenAPI exist as the technical protocol reference layer. Everything in this documentation
            uses the <strong>Sandbox</strong> environment by default.
          </P>

          <div id="status" style={{ scrollMarginTop: 72, margin: '0 0 18px', borderRadius: 16, border: '1px solid #F7DAD7', background: '#FFF7F6', padding: '16px 18px', maxWidth: 660 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: INK }}>Current status</span>
              <Badge tone="prep">Sandbox / Preview</Badge>
            </div>
            <UL>
              <LI><strong>Production and real-money rails are not available.</strong> Public pay/checkout, live rails and external providers are not available.</LI>
              <LI>SDKs are in <strong>controlled preview</strong> — not publicly published yet; no public install commands.</LI>
              <LI>The Console&rsquo;s visual pages (dashboard, webhooks, logs) are <strong>demo, not operational</strong>, unless explicitly stated.</LI>
              <LI>Available in controlled Sandbox: key identity, payment sessions, payment links and QR; refunds/transfers are <strong>Pending E2E</strong> for developer keys; outbound webhook delivery is <strong>simulated</strong>.</LI>
            </UL>
          </div>

          <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '18px 0 26px' }}>
            {AREAS_EN.filter((a) => a.slug).map((a) => (
              <a key={a.slug} href={areaHref('en', a.slug)} className="bz-doccard" style={{ position: 'relative', display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 18, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: INK }}>{a.label}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600 }}>{a.desc}</p>
              </a>
            ))}
          </div>

          <Callout>
            Start with <a href="/docs/en/get-started" style={{ color: '#9A1B22', fontWeight: 800, textDecoration: 'none' }}>Get started</a>,
            browse the <a href="/docs/en/artifacts" style={{ color: '#9A1B22', fontWeight: 800, textDecoration: 'none' }}>technical artifacts</a> and
            the <a href="/docs/en/trust" style={{ color: '#9A1B22', fontWeight: 800, textDecoration: 'none' }}>trust and readiness package</a>.
            Nothing in this documentation activates live rails, authorizes real money, or represents regulatory approval.
          </Callout>
        </section>
      )}
    </DocsShell>
  );
}
