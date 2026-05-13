'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  title:       string;
  description: string;
  confirmLabel?: string;
  danger?:     boolean;
  withNotes?:  boolean;
  onConfirm:   (notes: string) => Promise<void>;
  onClose:     () => void;
}

export function ConfirmDialog({
  title, description, confirmLabel = 'Confirmar', danger = false, withNotes = false,
  onConfirm, onClose,
}: Props) {
  const [notes, setNotes]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleConfirm() {
    setLoading(true); setError('');
    try {
      await onConfirm(notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-xl">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-xl flex flex-col gap-lg">
        <div className="flex items-start justify-between gap-md">
          <div className="flex items-start gap-md">
            <div className={`p-sm rounded-lg ${danger ? 'bg-error-bg' : 'bg-warning-bg'}`}>
              <AlertTriangle size={18} className={danger ? 'text-error' : 'text-warning'} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
              <p className="text-xs text-gray-400 mt-micro">{description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 shrink-0">
            <X size={16} />
          </button>
        </div>

        {withNotes && (
          <div className="flex flex-col gap-xs">
            <label className="text-xs font-medium text-gray-700">Notas (obrigatório)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-gray-100 rounded-md p-md text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20 focus:bg-white transition-colors resize-none"
              placeholder="Motivo ou observações…"
            />
          </div>
        )}

        {error && <p className="text-sm text-error bg-error-bg rounded-md px-md py-sm">{error}</p>}

        <div className="flex gap-md">
          <button onClick={onClose}
            className="flex-1 h-9 border border-gray-100 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || (withNotes && !notes.trim())}
            className={`flex-1 h-9 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-60 ${
              danger ? 'bg-error hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-700'
            }`}>
            {loading ? 'A processar…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
