'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Layers, FileText, Scale, RefreshCw, CreditCard, type LucideIcon } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type MerchantApplication } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/table';
import { ActivityFeed } from '@/components/layout/activity-feed';
import { formatDate, initials, withAt } from '@/lib/format';
import { overviewFigures } from '@/lib/overview';
import { PRODUCT_TZ_LABEL } from '@/lib/time';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

type Kpi = {
  key: string;
  label: string;
  value: string;
  chip: string;
  Icon: LucideIcon;
  bg: string;
  color: string;
};

// A figure whose source failed to load is unknown — shown as "—" with a
// "falhou ao carregar" chip, never as 0.
const UNKNOWN_CHIP = 'falhou ao carregar';
const UNKNOWN_STYLE = { bg: '#f1ebeb', color: '#7a6a6e' };

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [queue, setQueue] = useState<MerchantApplication[]>([]);
  const [queueFailed, setQueueFailed] = useState(false);
  const [activity, setActivity] = useState<{ text: string; time: string; dot: string }[]>([]);

  useEffect(() => {
    const api = getApi();
    if (!api) return;
    let alive = true;

    (async () => {
      const [apps, disputes, payouts, recon, settlements, audit] = await Promise.allSettled([
        api.listApplications(),
        api.listDisputes({ status: 'OPEN', limit: 100 }),
        api.listAllPayouts('PENDING'),
        api.listAcquiringReconciliationRuns(),
        api.listAllSettlements('SETTLED'),
        api.queryAuditLog({ limit: 6 }),
      ]);

      if (!alive) return;

      const appList = apps.status === 'fulfilled' ? apps.value.applications : null;
      const reconDiv = recon.status === 'fulfilled' ? recon.value.data.filter((r) => (r.total_discrepancy_minor ?? 0) > 0) : null;
      const f = overviewFigures({
        applications: appList,
        openDisputes: disputes.status === 'fulfilled' ? disputes.value.data.length : null,
        pendingPayouts: payouts.status === 'fulfilled' ? payouts.value.data : null,
        settled: settlements.status === 'fulfilled' ? settlements.value.data : null,
      });

      // Each KPI is either what its source said, or explicitly unknown.
      const kpi = (k: Omit<Kpi, 'value' | 'chip'>, known: { value: string; chip: string } | null): Kpi =>
        known ? { ...k, ...known } : { ...k, ...UNKNOWN_STYLE, value: '—', chip: UNKNOWN_CHIP };

      setKpis([
        kpi({ key: 'vol', label: `Volume liquidado hoje (${PRODUCT_TZ_LABEL})`, Icon: Layers, bg: '#eafaf0', color: '#1f9d57' },
          f.settledToday && { value: f.settledToday.volume, chip: `${f.settledToday.count} liquidações` }),
        kpi({ key: 'kyb', label: 'Candidaturas Business por rever (KYB)', Icon: Building2, bg: '#FBEFD8', color: '#b5790f' },
          f.applicationsToReview && { value: String(f.applicationsToReview.total), chip: `${f.applicationsToReview.underReview} em análise` }),
        kpi({ key: 'apps', label: 'Candidaturas Business novas', Icon: FileText, bg: '#FFF1F0', color: '#B5101F' },
          f.newApplications != null ? { value: String(f.newApplications), chip: 'por abrir' } : null),
        kpi({ key: 'disp', label: 'Disputas abertas', Icon: Scale, bg: '#fbe3e1', color: '#9A1B22' },
          f.openDisputes != null ? { value: String(f.openDisputes), chip: f.openDisputes ? 'a resolver' : 'sem abertas' } : null),
        kpi({ key: 'recon', label: 'Reconciliações c/ divergência', Icon: RefreshCw, bg: '#e9effb', color: '#3a5bd0' },
          reconDiv ? { value: String(reconDiv.length), chip: reconDiv[0] ? formatDate(reconDiv[0].reconciliation_date) : '—' } : null),
        kpi({ key: 'pay', label: 'Levantamentos pendentes', Icon: CreditCard, bg: '#FFF1F0', color: '#7a6a6e' },
          f.pendingPayouts && { value: String(f.pendingPayouts.count), chip: f.pendingPayouts.volume }),
      ]);

      setQueueFailed(appList === null);
      setQueue((appList ?? []).filter((a) => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW').slice(0, 5));

      if (audit.status === 'fulfilled') {
        setActivity(
          audit.value.data.map((e) => ({
            text: `${e.actor} · ${e.action} · ${e.subject}`,
            time: formatDate(e.created_at),
            dot: '#B5101F',
          })),
        );
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      {/* Dark banner */}
      <div className="relative mb-6 overflow-hidden rounded-[22px] bg-[#1a1416] px-8 py-[30px]">
        <div
          className="pointer-events-none absolute -right-10 -top-[60px] h-[260px] w-[260px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(181,16,31,.5), rgba(181,16,31,0) 68%)' }}
        />
        <p className="m-0 text-[12px] font-extrabold tracking-[0.16em] text-[#8a7a7e]">BANZADMIN OPERATIONS</p>
        <h2 className="m-0 mt-2 text-[30px] font-black tracking-[-0.02em] text-white">Painel Interno</h2>
        <p className="m-0 mt-[10px] max-w-[560px] text-[15px] font-semibold text-[#bcaeb0]">
          Acesso restrito a operadores autorizados. Todas as acções são auditadas e registadas em tempo real.
        </p>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-3 gap-4 max-[1040px]:grid-cols-2 max-[680px]:grid-cols-1">
        {(loading ? Array.from({ length: 6 }) : kpis).map((k, i) => {
          const kpi = k as Kpi | undefined;
          return (
            <div key={kpi?.key ?? i} className="rounded-[18px] border border-[#f1e3e3] bg-white p-[22px]">
              {loading || !kpi ? (
                <div className="adm-skel h-[88px] rounded-[12px]" />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[13px]" style={{ background: kpi.bg }}>
                      <kpi.Icon size={22} color={kpi.color} strokeWidth={1.7} />
                    </span>
                    <span className="rounded-[30px] px-[10px] py-1 text-[12px] font-extrabold" style={{ background: kpi.bg, color: kpi.color }}>
                      {kpi.chip}
                    </span>
                  </div>
                  <div className="mt-4 font-mono text-[28px] font-black tracking-[-0.02em]">{kpi.value}</div>
                  <div className="mt-[3px] text-[13.5px] font-bold text-[#9a8a8e]">{kpi.label}</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* KYC queue + activity */}
      <div className="grid grid-cols-[1.6fr_1fr] gap-4 max-[1040px]:grid-cols-1">
        <Card>
          <CardHeader
            title="Fila de candidaturas Business (KYB)"
            action={
              <Link href="/merchants" className="text-[13px] font-extrabold text-[#B5101F]">
                Ver todos →
              </Link>
            }
          />
          <div>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} className="adm-skel mx-[22px] my-[14px] h-[38px] rounded-[11px]" />)
            ) : queueFailed ? (
              <div className="px-[22px] py-10 text-center text-[13.5px] font-semibold text-[#B5101F]">Não foi possível carregar as candidaturas.</div>
            ) : queue.length === 0 ? (
              <div className="px-[22px] py-10 text-center text-[13.5px] font-semibold text-[#9a8a8e]">Nenhuma candidatura por rever.</div>
            ) : (
              queue.map((m) => (
                <div key={m.id} className="flex items-center gap-[14px] border-b border-[#f8f1f1] px-[22px] py-[14px]">
                  <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-[#FFF1F0] text-[14px] font-extrabold text-[#B5101F]">
                    {initials(m.business_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-extrabold">{m.business_name}</div>
                    <div className="font-mono text-[12.5px] font-semibold text-[#9a8a8e]">
                      {withAt(m.desired_handle)} · {formatDate(m.created_at)}
                    </div>
                  </div>
                  <Badge label={statusLabelPt(m.status)} />
                  <Link href={`/merchants/${m.id}`} className="rounded-[30px] bg-[#FFF1F0] px-[14px] py-2 text-[13px] font-extrabold text-[#B5101F]">
                    Rever
                  </Link>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Atividade recente" />
          <div className="px-[22px] pb-[14px] pt-1.5">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <div key={i} className="adm-skel my-[13px] h-[34px] rounded-[8px]" />)
            ) : activity.length === 0 ? (
              <div className="py-8 text-center text-[13.5px] font-semibold text-[#9a8a8e]">Sem atividade registada.</div>
            ) : (
              activity.map((a, i) => (
                <div key={i} className="flex gap-[13px] border-b border-[#f8f1f1] py-[13px]">
                  <span className="mt-[5px] h-[9px] w-[9px] flex-none rounded-full" style={{ background: a.dot }} />
                  <div>
                    <div className="text-[13.5px] font-bold leading-[1.4] text-[#3a2e32]">{a.text}</div>
                    <div className="mt-0.5 font-mono text-[12px] font-semibold text-[#b09498]">{a.time}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <ActivityFeed />
    </>
  );
}
