'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check } from 'lucide-react';

// Themed BANZADMIN dialogs replacing native window.confirm / window.prompt.
// Imperative API via useDialog(): confirm() / prompt() / showLink(), each
// returning a promise resolved by the modal.

type ConfirmOpts = { title?: string; message: string; confirmLabel?: string; danger?: boolean };
type PromptOpts = { title: string; label?: string; placeholder?: string; defaultValue?: string; multiline?: boolean; confirmLabel?: string; required?: boolean };
type LinkOpts = { title: string; label?: string; url: string };

type State =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void }
  | { kind: 'link'; opts: LinkOpts; resolve: () => void }
  | null;

type DialogApi = {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
  showLink: (opts: LinkOpts) => Promise<void>;
};

const DialogCtx = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error('useDialog must be used within <DialogProvider>');
  return ctx;
}

const btnBase = 'rounded-[12px] px-5 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50';
const inputCls =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-[15px] font-semibold text-[#2a2024] outline-none transition focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const confirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ kind: 'confirm', opts, resolve })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOpts) => new Promise<string | null>((resolve) => setState({ kind: 'prompt', opts, resolve })),
    [],
  );
  const showLink = useCallback(
    (opts: LinkOpts) => new Promise<void>((resolve) => setState({ kind: 'link', opts, resolve })),
    [],
  );

  return (
    <DialogCtx.Provider value={{ confirm, prompt, showLink }}>
      {children}
      {mounted && state && <DialogModal state={state} onClose={() => setState(null)} />}
    </DialogCtx.Provider>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[440px] rounded-[20px] border border-[#f1e3e3] bg-white p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-[18px] font-black tracking-[-0.01em]">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-[#9a8a8e] hover:text-[#2a2024]">
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function DialogModal({ state, onClose }: { state: NonNullable<State>; onClose: () => void }) {
  if (state.kind === 'confirm') {
    const o = state.opts;
    return (
      <Shell title={o.title ?? 'Confirmar'} onClose={() => { state.resolve(false); onClose(); }}>
        <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-[#5a4a4e]">{o.message}</p>
        <div className="mt-6 flex justify-end gap-2.5">
          <button onClick={() => { state.resolve(false); onClose(); }} className={`${btnBase} border-[1.5px] border-[#f1e3e3] bg-white text-[#5a4a4e] hover:bg-[#FFF7F6]`}>
            Cancelar
          </button>
          <button
            onClick={() => { state.resolve(true); onClose(); }}
            className={`${btnBase} text-white ${o.danger ? 'bg-[#B5101F] hover:bg-[#9A1B22]' : 'bg-[#1a1416] hover:bg-black'}`}
          >
            {o.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </Shell>
    );
  }

  if (state.kind === 'prompt') return <PromptModal state={state} onClose={onClose} />;

  // link
  const o = state.opts;
  return <LinkModal title={o.title} label={o.label} url={o.url} onClose={() => { state.resolve(); onClose(); }} />;
}

function PromptModal({ state, onClose }: { state: Extract<NonNullable<State>, { kind: 'prompt' }>; onClose: () => void }) {
  const o = state.opts;
  const [value, setValue] = useState(o.defaultValue ?? '');
  const cancel = () => { state.resolve(null); onClose(); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (o.required && !value.trim()) return;
    state.resolve(value);
    onClose();
  };
  return (
    <Shell title={o.title} onClose={cancel}>
      <form onSubmit={submit}>
        {o.label && <label className="mb-1.5 block text-[13px] font-extrabold">{o.label}</label>}
        {o.multiline ? (
          <textarea autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={o.placeholder} rows={3} className={`${inputCls} resize-y`} />
        ) : (
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={o.placeholder} className={inputCls} />
        )}
        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" onClick={cancel} className={`${btnBase} border-[1.5px] border-[#f1e3e3] bg-white text-[#5a4a4e] hover:bg-[#FFF7F6]`}>Cancelar</button>
          <button type="submit" disabled={o.required && !value.trim()} className={`${btnBase} bg-[#1a1416] text-white hover:bg-black`}>{o.confirmLabel ?? 'Confirmar'}</button>
        </div>
      </form>
    </Shell>
  );
}

function LinkModal({ title, label, url, onClose }: { title: string; label?: string; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      ref.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <Shell title={title} onClose={onClose}>
      {label && <p className="m-0 mb-2 text-[13.5px] font-semibold text-[#5a4a4e]">{label}</p>}
      <div className="flex items-stretch gap-2">
        <input ref={ref} readOnly value={url} onFocus={(e) => e.target.select()} className={`${inputCls} font-mono text-[13px]`} />
        <button onClick={copy} className={`${btnBase} flex flex-none items-center gap-1.5 bg-[#1a1416] text-white hover:bg-black`}>
          {copied ? <Check size={16} strokeWidth={2.4} /> : <Copy size={16} strokeWidth={1.9} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <div className="mt-6 flex justify-end">
        <button onClick={onClose} className={`${btnBase} border-[1.5px] border-[#f1e3e3] bg-white text-[#5a4a4e] hover:bg-[#FFF7F6]`}>Fechar</button>
      </div>
    </Shell>
  );
}
