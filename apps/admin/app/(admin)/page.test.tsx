// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const fail = async () => { throw new Error('502'); };

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/layout/activity-feed', () => ({ ActivityFeed: () => null }));
vi.mock('@/lib/session', () => ({ getSession: () => ({ token: 't' }) }));
vi.mock('@/lib/admin-api', () => ({
  AdminApi: class {
    listApplications = fail;
    listDisputes = fail;
    listAllPayouts = fail;
    listAcquiringReconciliationRuns = fail;
    listAllSettlements = fail;
    queryAuditLog = fail;
  },
}));

import OverviewPage from './page';

afterEach(() => cleanup());

describe('Visão geral — a failed source is unknown, not zero', () => {
  it('shows "—" and "falhou ao carregar" on every KPI, and no "0"', async () => {
    render(<OverviewPage />);
    await screen.findByText('Disputas abertas');
    expect(screen.getAllByText('falhou ao carregar')).toHaveLength(6);
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('0 Kz')).toBeNull();
    expect(screen.getByText('Não foi possível carregar as candidaturas.')).toBeTruthy();
    expect(screen.queryByText(/KYC pendentes/)).toBeNull();
    expect(screen.getByText('Volume liquidado hoje (WAT)')).toBeTruthy();
  });
});
