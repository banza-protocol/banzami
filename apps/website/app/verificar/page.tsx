'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Normalizes a pasted code or full URL to a bare proof reference.
function extractRef(input: string): string {
  let s = input.trim();
  const m = s.match(/\/r\/([A-Za-z0-9-]+)/);
  if (m) s = m[1];
  return s.toUpperCase().replace(/\s+/g, '');
}

export default function VerificarPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const ref = extractRef(code);
    if (!/^BZM-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(ref)) {
      setError('Código inválido. Use o formato BZM-XXXX-XXXX (ou cole o link completo).');
      return;
    }
    setError('');
    router.push(`/r/${ref}`);
  }

  return (
    <main style={{ minHeight: '100vh', background: '#FFF7F6', padding: '40px 20px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#2a2024', fontWeight: 900, fontSize: 20, marginBottom: 24 }}>
          <span style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 10, background: '#B5101F' }} />
          Banzami
        </Link>

        <div style={{ borderRadius: 20, border: '1px solid #f1e3e3', background: '#fff', padding: 28, boxShadow: '0 20px 60px -30px rgba(0,0,0,0.2)' }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#1a1a1a' }}>Verificar comprovativo</h1>
          <p style={{ margin: '10px 0 20px', fontSize: 14.5, fontWeight: 600, lineHeight: 1.55, color: '#6a5a5e' }}>
            Introduza o código de verificação do comprovativo (ou cole o link). Confirmamos o registo real no ledger imutável do Banzami — não confie apenas em screenshots ou PDFs.
          </p>
          <form onSubmit={submit}>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="BZM-XXXX-XXXX"
              style={{ width: '100%', boxSizing: 'border-box', borderRadius: 14, border: '1.5px solid #f1e3e3', background: '#FBF4F3', padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 700, color: '#2a2024', outline: 'none' }}
            />
            {error && <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700, color: '#B5101F' }}>{error}</p>}
            <button type="submit" style={{ marginTop: 16, width: '100%', borderRadius: 40, border: 'none', background: '#B5101F', color: '#fff', padding: '14px', fontSize: 15, fontWeight: 900, cursor: 'pointer' }}>
              Verificar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
