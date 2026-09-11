// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

let role = 'READ_ONLY';
const dismissNotification = vi.fn(async () => {});
const markNotificationRead = vi.fn(async () => {});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/session', () => ({ getSession: () => ({ token: 't', user: { id: 'u', email: 'e', full_name: 'n', role } }) }));
vi.mock('@/components/layout/attention-provider', () => ({
  useAttention: () => ({ summary: { unread_notifications: 1 }, environment: 'SANDBOX' }),
}));
vi.mock('@/lib/admin-api', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin-api')>()),
  AdminApi: class {
    listNotifications = async () => ({
      notifications: [{ id: 'n1', environment: 'SANDBOX', type: 'KYB_DOC_SUBMITTED', severity: 'info', title: 'Documento KYB submetido', status: 'UNREAD', created_at: '2026-09-11T10:00:00Z' }],
    });
    dismissNotification = dismissNotification;
    markNotificationRead = markNotificationRead;
  },
}));

import { NotificationBell, canTriageNotifications } from './notification-bell';
import { AdminApiError } from '@/lib/admin-api';

afterEach(() => { cleanup(); dismissNotification.mockReset(); markNotificationRead.mockReset(); });

async function openBell() {
  render(<NotificationBell />);
  fireEvent.click(screen.getByRole('button', { name: /Notificações/ }));
  await screen.findByText('Documento KYB submetido');
}

describe('Notificações — global, so only the desk may clear them', () => {
  it('mirrors the server: desk roles triage, observers do not', () => {
    expect(['SUPER_ADMIN', 'OPERATIONS', 'COMPLIANCE'].map(canTriageNotifications)).toEqual([true, true, true]);
    expect(['READ_ONLY', 'SUPPORT', '', undefined].map(canTriageNotifications)).toEqual([false, false, false, false]);
  });

  it('an observer sees the list without read/dismiss controls', async () => {
    role = 'SUPPORT';
    await openBell();
    expect(screen.queryByTitle('Dispensar')).toBeNull();
    expect(screen.queryByTitle('Marcar como lida')).toBeNull();
    expect(screen.queryByText(/Marcar todas como lidas/)).toBeNull();
  });

  it('a refused dismiss does not vanish on this screen alone', async () => {
    role = 'OPERATIONS';
    dismissNotification.mockRejectedValue(new AdminApiError(403, 'FORBIDDEN', 'forbidden'));
    await openBell();
    fireEvent.click(screen.getByTitle('Dispensar'));
    await act(async () => { await Promise.resolve(); });
    expect(dismissNotification).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Documento KYB submetido')).toBeTruthy();
  });
});
