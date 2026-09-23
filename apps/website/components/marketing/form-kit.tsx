'use client';

import type { ReactNode } from 'react';
import { Icon, IconBox, ArrowIcon, type IconName } from './kit';

/* Form primitives (handoff site-kit field/check/optBtns/stepper/…), presentational.
   The parent page owns state (values, errors, step) and passes value/error/onChange. */

const inSt: React.CSSProperties = {
  width: '100%', padding: '13px 15px', borderRadius: '14px', border: '1px solid #EFDCDA', background: '#fff',
  fontFamily: 'inherit', fontSize: '15px', fontWeight: 600, color: '#141014', outline: 'none',
  transition: 'border-color .2s, box-shadow .2s',
};

function ErrP({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p role="alert" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: '#C8101F' }}>
      <Icon name="info" color="#C8101F" size={13} />{msg}
    </p>
  );
}

export function Field({ name, label, type = 'text', placeholder = '', required = true, options, selectPlaceholder = 'Selecione…', span2, hint, mono, autoComplete, value, error, onChange }: {
  name: string; label: string; type?: string; placeholder?: string; required?: boolean; options?: string[]; selectPlaceholder?: string; span2?: boolean;
  hint?: string; mono?: boolean; autoComplete?: string; value: string; error?: string;
  onChange: (v: string) => void;
}) {
  const id = 'f_' + name;
  const focus = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = '#D8121F'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(216,18,31,.12)'; };
  const blur = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = '#EFDCDA'; e.currentTarget.style.boxShadow = 'none'; };
  let ctl: ReactNode;
  if (options) {
    ctl = (
      <div style={{ position: 'relative' }}>
        <select id={id} name={name} value={value} aria-required={required} onChange={(e) => onChange(e.target.value)} onFocus={focus} onBlur={blur} style={{ ...inSt, appearance: 'none', WebkitAppearance: 'none', paddingRight: '40px', cursor: 'pointer' }}>
          <option value="">{selectPlaceholder}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><path d="M6 9l6 6 6-6" /></svg>
      </div>
    );
  } else if (type === 'textarea') {
    ctl = <textarea id={id} name={name} value={value} rows={5} placeholder={placeholder} aria-required={required} onChange={(e) => onChange(e.target.value)} onFocus={focus} onBlur={blur} style={{ ...inSt, resize: 'vertical', minHeight: '130px', lineHeight: 1.5 }} />;
  } else {
    ctl = <input id={id} name={name} type={type} value={value} placeholder={placeholder} aria-required={required} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} onFocus={focus} onBlur={blur} style={{ ...inSt, ...(mono ? { fontFamily: "'JetBrains Mono',monospace", letterSpacing: '.04em' } : {}) }} />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', minWidth: 0, ...(span2 ? { gridColumn: '1 / -1' } : {}) }}>
      <label htmlFor={id} style={{ fontSize: '13px', fontWeight: 800, color: '#2a2024' }}>{label}{required && <span aria-hidden="true" style={{ color: '#B5101F' }}> *</span>}</label>
      {ctl}
      {hint && <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#9a8487' }}>{hint}</p>}
      <ErrP msg={error} />
    </div>
  );
}

export function Check({ name, label, checked, error, onChange, span2 = true }: { name: string; label: ReactNode; checked: boolean; error?: string; onChange: (v: boolean) => void; span2?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', ...(span2 ? { gridColumn: '1 / -1' } : {}) }}>
      <label style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px', borderRadius: '14px', background: '#FFF8F7', border: '1px solid #F3E3E1', cursor: 'pointer' }}>
        <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ flex: 'none', width: '18px', height: '18px', margin: '1px 0 0', accentColor: '#B5101F' }} />
        <span style={{ fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#4a3a3e' }}>{label}</span>
      </label>
      <ErrP msg={error} />
    </div>
  );
}

export function OptBtns({ name, label, options, value, onChange }: { name: string; label: string; options: { value: string; desc?: string; icon?: IconName }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: '7px', gridColumn: '1 / -1' }}>
      <span style={{ fontSize: '13px', fontWeight: 800, color: '#2a2024' }}>{label}</span>
      <div className="bz-g2s" style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length},minmax(0,1fr))`, gap: '10px' }}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)} style={{ display: 'flex', gap: '12px', alignItems: 'center', textAlign: 'left', padding: '14px', borderRadius: '16px', cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? '#D8121F' : '#EFDCDA'}`, background: on ? '#FFF6F5' : '#fff', transition: 'border-color .2s, background .2s' }}>
              {o.icon && <IconBox name={o.icon} s={36} />}
              <span><span style={{ display: 'block', fontSize: '14px', fontWeight: 900, color: '#141014' }}>{o.value}</span>{o.desc && <span style={{ display: 'block', marginTop: '2px', fontSize: '12px', fontWeight: 600, color: '#8a7a7e' }}>{o.desc}</span>}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FGrid({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return <div className="bz-fgrid" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: '16px 18px' }}>{children}</div>;
}

export function Stepper({ steps, current, done }: { steps: string[]; current: number; done?: boolean }) {
  const pct = (done ? 100 : Math.round(((current - 1) / Math.max(1, steps.length - 1)) * 100)) + '%';
  return (
    <div className="bz-stepper" style={{ marginBottom: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        {steps.map((s, i) => {
          const n = i + 1;
          const active = n <= current || done;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ flex: 'none', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, background: (n < current || done) ? '#1a1416' : n === current ? 'linear-gradient(150deg,#D8121F,#8E1620)' : '#fff', color: active ? '#fff' : '#9a8487', border: `1px solid ${active ? 'transparent' : '#EFDCDA'}` }}>{n}</span>
              <span className="bz-stl" style={{ fontSize: '13px', fontWeight: 800, color: active ? '#141014' : '#9a8487' }}>{s}</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: '12px', height: '4px', borderRadius: '3px', background: '#F3E3E1', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct, background: 'linear-gradient(90deg,#D8121F,#9A1B22)', transition: 'width .35s ease' }} />
      </div>
    </div>
  );
}

export function SubmitBtn({ children, onClick, type = 'submit', kind = 'red' }: { children: ReactNode; onClick?: () => void; type?: 'submit' | 'button'; kind?: 'red' | 'dark' }) {
  return (
    <button type={type} onClick={onClick} className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '14px 26px', border: 'none', cursor: 'pointer', borderRadius: '40px', background: kind === 'dark' ? 'linear-gradient(160deg,#2a2124,#120e0f)' : 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', whiteSpace: 'nowrap', boxShadow: '0 14px 28px -14px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)' }}>
      {children}<ArrowIcon color="#fff" size={16} />
    </button>
  );
}

export function BackBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '13px 20px', borderRadius: '40px', border: '1px solid #F3E3E1', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', color: '#141014' }}>
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#141014" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>{children}
    </button>
  );
}

export function SuccessMark() {
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: '84px', height: '84px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px dashed rgba(181,16,31,.45)', animation: 'bzspin 9s linear infinite' }} />
      <div style={{ width: '62px', height: '62px', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#E0303A,#9A1B22)', boxShadow: '0 14px 30px -10px rgba(181,16,31,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check" color="#fff" size={28} width={3} />
      </div>
    </div>
  );
}
