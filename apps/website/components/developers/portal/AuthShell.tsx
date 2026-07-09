import Link from 'next/link';
import { BrandTile } from './icons';
import { PreviewNotice } from './PreviewNotice';

// Auth background shell for login / OTP / onboarding. Faithful port of the
// dossier auth shell: blush radial background, two soft decorative blobs, and a
// brand bar (logo + "Documentação →"). Screens render as the centred child.

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background:
          'radial-gradient(1100px 620px at 50% -8%,#FEE9E7 0%,#FFF6F5 46%,#FFFBFA 100%)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -160,
          right: -120,
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(232,67,75,.14),rgba(232,67,75,0) 68%)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: -180,
          left: -140,
          width: 480,
          height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(251,210,208,.55),rgba(251,210,208,0) 70%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          padding: '26px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: 1120,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* Top-left: secondary "back to the public site" control above the brand.
            A real absolute anchor (works from a bookmark / fresh session — no
            history.back), secondary to the login action, keyboard-focusable with
            a visible focus ring via .bz-toplink. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <a
            href="https://banzami.com"
            aria-label="Voltar ao Banzami"
            className="bz-toplink"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 700,
              color: '#7a6a6e',
              textDecoration: 'none',
              padding: '3px 9px 3px 6px',
              borderRadius: 8,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>←</span>
            Voltar ao Banzami
          </a>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none' }}>
            <BrandTile size={34} radius={11} />
            <span style={{ fontWeight: 900, fontSize: 19, letterSpacing: '-.02em', color: '#2a2024' }}>
              Banzami <span style={{ color: '#B5101F' }}>Developers</span>
            </span>
          </Link>
        </div>
        <Link
          href="/docs"
          style={{ fontSize: 14, fontWeight: 800, color: '#7a6a6e', textDecoration: 'none' }}
        >
          Documentação →
        </Link>
      </div>

      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 22px 60px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 420 }}>
          <PreviewNotice />
          {children}
        </div>
      </div>
    </div>
  );
}
