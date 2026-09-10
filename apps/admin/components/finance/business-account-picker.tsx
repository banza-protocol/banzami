'use client';

import { useState } from 'react';
import type { Merchant } from '@/lib/admin-api';
import { accountTypeLabel } from '@/lib/format';

/**
 * Pick a Business Account by the @handle it owns.
 *
 * Both of the operator's commercial decisions about an account — its ADR-028
 * class and its pricing profile — used to be made from a list of 312 names.
 * Names repeat and mislead: three Sandbox accounts read like "DOA", and only one
 * of them owns @doa (the one named "Sandbox · Doa-Sandbox"; the account called
 * plainly "Doa" was retired by the consolidation and owns nothing). A decision
 * that lands on the wrong account does not show up anywhere until money follows
 * it. So the list shows each account's handle, offers only ACTIVE accounts,
 * puts the ones with a handle first, can be narrowed by handle, name or id, and
 * the chosen account is spelled out in full under the list.
 */

const input =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-[15px] font-semibold text-[#2a2024] outline-none transition focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';
const label = 'mb-1.5 block text-[12px] font-extrabold uppercase tracking-wide text-[#8a7a7e]';

export function pickerOptions(merchants: Merchant[], filter: string): Merchant[] {
  const q = filter.trim().toLowerCase().replace(/^@/, '');
  return merchants
    .filter((m) => m.status === 'ACTIVE')
    .filter((m) => !q || (m.handle ?? '').includes(q) || m.name.toLowerCase().includes(q) || m.id.startsWith(q))
    .sort((a, b) => Number(!a.handle) - Number(!b.handle) || (a.handle ?? a.name).localeCompare(b.handle ?? b.name));
}

export function BusinessAccountPicker({
  merchants,
  value,
  onChange,
  showClass = false,
}: {
  merchants: Merchant[];
  value: string;
  onChange: (id: string) => void;
  showClass?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const options = pickerOptions(merchants, filter);
  const chosen = merchants.find((m) => m.id === value);
  return (
    <div>
      <span className={label}>Business Account</span>
      <input
        className={`${input} mb-2`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Procurar por @handle, nome ou id"
        aria-label="Procurar Business Account por @handle, nome ou id"
      />
      <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione…</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.handle ? `@${m.handle}` : 'sem @handle'} · {m.name}
            {showClass ? ` · ${accountTypeLabel(m.business_account_type)}` : ''} · {m.id.slice(0, 8)}…
          </option>
        ))}
      </select>
      {chosen ? (
        <p data-testid="business-account-chosen" className="mt-2 text-[12.5px] font-semibold text-[#7a6a6e]">
          {chosen.handle ? <strong className="font-mono text-[#2a2024]">@{chosen.handle}</strong> : <strong>sem @handle</strong>}
          {' · '}
          {chosen.name}
          {' · '}
          <span className="font-mono">{chosen.id}</span>
        </p>
      ) : null}
    </div>
  );
}
