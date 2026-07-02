import Link from 'next/link';
import { IconDocLines } from './icons';

// "Em preparação" stub — dossier ecrã 12. Keeps the sidebar item active and
// points back to the dashboard. Replace with the real page when it exists.

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

export function StubContent({ label }: { label: string }) {
  return (
    <div
      className="bz-view"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '70px 20px' }}
    >
      <div style={{ width: 64, height: 64, borderRadius: 18, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, color: '#B5101F' }}>
        <IconDocLines size={30} />
      </div>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>{label}</h1>
      <p style={{ margin: '10px 0 20px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600, maxWidth: 400 }}>
        Esta secção está a ser preparada. Enquanto isso, explore a Visão geral do seu projeto Sandbox.
      </p>
      <Link
        href="/developers/dashboard"
        className="bz-cta"
        style={{ padding: '11px 20px', border: 'none', borderRadius: 12, background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', textDecoration: 'none', boxShadow: '0 12px 24px -12px rgba(181,16,31,.5)' }}
      >
        Voltar à Visão geral
      </Link>
    </div>
  );
}
