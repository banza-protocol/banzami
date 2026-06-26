'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type RiskFlag, type AuditEntry } from '@/lib/admin-api';
import { Card, CardHeader, EmptyMsg } from '@/components/ui/table';
import { formatDate, initials } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.apiUrl, s.adminKey) : null;
}

const TAG_STYLE: Record<string, { bg: string; color: string; stroke: string; tagBg: string }> = {
  AML:    { bg: '#fbe3e1', stroke: '#9A1B22', tagBg: '#fbe3e1', color: '#9A1B22' },
  FRAUD:  { bg: '#FFF1F0', stroke: '#B5101F', tagBg: '#FFF1F0', color: '#B5101F' },
  KYC:    { bg: '#FBEFD8', stroke: '#b5790f', tagBg: '#FBEFD8', color: '#b5790f' },
  DEFAULT:{ bg: '#f1ebeb', stroke: '#7a6a6e', tagBg: '#f1ebeb', color: '#7a6a6e' },
};

function tagFor(flagType: string) {
  const t = flagType.toUpperCase();
  if (t.includes('AML')) return { ...TAG_STYLE.AML, label: 'AML' };
  if (t.includes('FRAUD')) return { ...TAG_STYLE.FRAUD, label: 'Fraude' };
  if (t.includes('KYC')) return { ...TAG_STYLE.KYC, label: 'KYC' };
  return { ...TAG_STYLE.DEFAULT, label: flagType };
}

export default function RiskPage() {
  const [flags, setFlags] = useState<RiskFlag[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    const api = getApi();
    if (!api) return;
    api.listRiskFlags(false).then((r) => setFlags(r.data)).catch(() => setFlags([]));
    api.queryAuditLog({ limit: 12 }).then((r) => setAudit(r.data)).catch(() => setAudit([]));
  }, []);

  return (
    <div className="grid grid-cols-[1.1fr_1fr] gap-4 max-[1040px]:grid-cols-1">
      <Card>
        <CardHeader title="Sinalizações de risco" />
        {flags === null ? (
          <div className="adm-skel m-6 h-[160px] rounded-[14px]" />
        ) : flags.length === 0 ? (
          <EmptyMsg title="Sem sinalizações de risco." />
        ) : (
          <div>
            {flags.map((f) => {
              const t = tagFor(f.flag_type);
              return (
                <div key={f.id} className="flex items-center gap-[13px] border-b border-[#f8f1f1] px-[22px] py-[15px]">
                  <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px]" style={{ background: t.bg }}>
                    <AlertTriangle size={19} color={t.stroke} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[14px] font-extrabold text-[#2a2024]">{f.entity_id.slice(0, 14)}</div>
                    <div className="text-[12.5px] font-semibold text-[#9a8a8e]">{f.description || f.flag_type} · {formatDate(f.created_at)}</div>
                  </div>
                  <span className="rounded-[30px] px-[10px] py-1 text-[11px] font-extrabold" style={{ background: t.tagBg, color: t.color }}>
                    {t.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Registo de auditoria" />
        <div className="px-[22px] pb-3 pt-1.5">
          {audit === null ? (
            <div className="adm-skel my-3 h-[160px] rounded-[14px]" />
          ) : audit.length === 0 ? (
            <EmptyMsg title="Sem registos de auditoria." />
          ) : (
            audit.map((l) => (
              <div key={l.id} className="flex gap-[13px] border-b border-[#f8f1f1] py-[13px]">
                <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-[#1a1416] text-[10px] font-extrabold text-white">
                  {initials(l.actor)}
                </span>
                <div className="flex-1">
                  <div className="text-[13.5px] font-bold leading-[1.4] text-[#3a2e32]">{l.action} · {l.subject}</div>
                  <div className="mt-0.5 font-mono text-[12px] font-semibold text-[#b09498]">{l.actor} · {formatDate(l.created_at)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
