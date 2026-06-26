'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, AdminApiError } from '@/lib/admin-api';
import { useToast } from '@/components/ui/toast';

const inputCls =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-[15px] font-semibold text-[#2a2024] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Portal target — the modal must escape the header's backdrop-filter
  // containing block (otherwise `position: fixed` anchors to the header).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 12) {
      setError('A nova palavra-passe deve ter pelo menos 12 caracteres.');
      return;
    }
    if (next !== confirm) {
      setError('As palavras-passe não coincidem.');
      return;
    }
    const session = getSession();
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      await new AdminApi(session.token).changePassword(current, next);
      toast('success', 'Palavra-passe alterada com sucesso.');
      setCurrent('');
      setNext('');
      setConfirm('');
      onClose();
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.code === 'INVALID_CURRENT_PASSWORD') setError('A palavra-passe atual está incorreta.');
        else if (err.code === 'WEAK_PASSWORD') setError('A nova palavra-passe deve ter pelo menos 12 caracteres.');
        else if (err.code === 'SAME_PASSWORD') setError('A nova palavra-passe deve ser diferente da atual.');
        else setError('Não foi possível alterar a palavra-passe.');
      } else {
        setError('Não foi possível alterar a palavra-passe.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-[20px] border border-[#f1e3e3] bg-white p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-[18px] font-black tracking-[-0.01em]">Alterar palavra-passe</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-[#9a8a8e] hover:text-[#2a2024]">
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-[13px] font-extrabold">Palavra-passe atual</label>
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-extrabold">Nova palavra-passe</label>
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-extrabold">Confirmar nova palavra-passe</label>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} required />
          </div>

          {error && (
            <div className="rounded-[12px] border border-[#f6d3d1] bg-[#FFF1F0] px-[14px] py-2.5 text-[13px] font-bold text-[#B5101F]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-[14px] bg-[#1a1416] py-3.5 text-[15px] font-extrabold text-white transition-[background,transform] duration-150 hover:bg-black disabled:opacity-60"
          >
            {loading ? 'A guardar…' : 'Guardar nova palavra-passe'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
