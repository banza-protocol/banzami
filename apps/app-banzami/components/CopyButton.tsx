'use client';
import { useState } from 'react';

export function CopyButton({ text, label = 'Copiar', className = '' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch { /* clipboard blocked — no-op */ }
  }
  return (
    <button type="button" onClick={copy} className={className} aria-live="polite">
      {done ? 'Copiado ✓' : label}
    </button>
  );
}
