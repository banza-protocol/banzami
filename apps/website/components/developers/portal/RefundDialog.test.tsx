// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { RefundDialog } from './RefundDialog';
import { ToastProvider } from './Toast';
import type { DeveloperTransaction } from '@/lib/developer-api';

// The dialog reads the active project and the CSRF token from the Console's
// data context. Stubbing it keeps the test about the dialog: the authority
// behind these values is proved against the deployed API by
// tools/e2e/console/refund-rbac.mjs, which is where it belongs.
vi.mock('./DeveloperData', () => ({
  useDeveloperData: () => ({ activeProject: { id: 'prj_1' }, csrf: 'csrf-token' }),
}));

const refundPayment = vi.fn();
vi.mock('@/lib/developer-api', async (orig) => {
  const real = await orig<typeof import('@/lib/developer-api')>();
  return { ...real, developerApi: { refundPayment: (...a: unknown[]) => refundPayment(...a) } };
});

const payment: DeveloperTransaction = {
  id: 'pay_1', type: 'payment', status: 'PAID',
  amount_minor: 300000, currency: 'AOA',
  wallet_account_id: 'wa_1', reference_type: 'DOA_DONATION', reference_id: 'ref-1',
  created_at: '2026-09-06T10:00:00Z',
};

function open(overrides: Partial<Parameters<typeof RefundDialog>[0]> = {}) {
  return render(
    <ToastProvider>
      <RefundDialog payment={payment} onClose={vi.fn()} onRefunded={vi.fn()} {...overrides} />
    </ToastProvider>,
  );
}

beforeEach(() => { refundPayment.mockReset(); refundPayment.mockResolvedValue({ id: 'rf_1', status: 'COMPLETED', amount_minor: 100000, currency: 'AOA' }); });
afterEach(cleanup);

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const submit = () => button('Reembolsar');

describe('RefundDialog', () => {
  it('defaults to the full amount, in kwanzas', () => {
    open();
    expect((screen.getByLabelText(/Montante a devolver/) as HTMLInputElement).value).toBe('3000');
    // The received amount is shown as the operator formats money everywhere:
    // space-grouped, unit last, no cents.
    expect(screen.getByText('3 000 Kz')).not.toBeNull();
  });

  it('will not send without a reason — a refund nobody can explain later', () => {
    open();
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'duplicado' } });
    expect(submit().disabled).toBe(false);
  });

  it('refuses an amount above what was received, and a zero', () => {
    open();
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'duplicado' } });
    for (const bad of ['4000', '0', '']) {
      fireEvent.change(screen.getByLabelText(/Montante a devolver/), { target: { value: bad } });
      expect(submit().disabled).toBe(true);
    }
    fireEvent.change(screen.getByLabelText(/Montante a devolver/), { target: { value: '1000' } });
    expect(submit().disabled).toBe(false);
  });

  it('sends minor units, not the kwanzas typed', async () => {
    open();
    fireEvent.change(screen.getByLabelText(/Montante a devolver/), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'duplicado' } });
    fireEvent.click(submit());
    await waitFor(() => expect(refundPayment).toHaveBeenCalled());
    const [projectID, paymentID, body, csrf] = refundPayment.mock.calls[0];
    expect(projectID).toBe('prj_1');
    expect(paymentID).toBe('pay_1');
    expect(body.amount_minor).toBe(100000);
    expect(body.reason).toBe('duplicado');
    expect(csrf).toBe('csrf-token');
  });

  // The point of the key living on the dialog rather than on the attempt: a
  // second press after a failure is a RETRY of one refund, not a second one.
  it('retries with the same idempotency key after a failure', async () => {
    refundPayment.mockRejectedValueOnce(new Error('network'));
    open();
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'duplicado' } });

    fireEvent.click(submit());
    await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull());
    fireEvent.click(submit());
    await waitFor(() => expect(refundPayment).toHaveBeenCalledTimes(2));

    const first = refundPayment.mock.calls[0][2].idempotency_key;
    const second = refundPayment.mock.calls[1][2].idempotency_key;
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  // ...and two separate, deliberate partial refunds are two different keys.
  it('a new dialog mints a new key', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'primeira' } });
    fireEvent.click(submit());
    await waitFor(() => expect(refundPayment).toHaveBeenCalledTimes(1));
    cleanup();

    open();
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'segunda' } });
    fireEvent.click(submit());
    await waitFor(() => expect(refundPayment).toHaveBeenCalledTimes(2));

    expect(refundPayment.mock.calls[1][2].idempotency_key)
      .not.toBe(refundPayment.mock.calls[0][2].idempotency_key);
  });

  // Core's refusals must reach the person as something they can act on. A
  // ceiling reached and a balance too low lead somewhere different, and one
  // generic message would leave someone re-pressing a button that cannot work.
  it('shows the reason a refund was refused', async () => {
    const { ApiError } = await import('@/lib/developer-api');
    // Core's refund codes are not in the Console's own ApiErrorCode union — they
    // come from the operator, not from this client — so the dialog reads
    // whatever code arrived. That is deliberate: a fixed union here would have
    // collapsed every refusal Core can invent into "something went wrong".
    const e = new ApiError('CONFLICT', 409, 'ceiling');
    (e as unknown as { code: string }).code = 'REFUND_CEILING_EXCEEDED';
    refundPayment.mockRejectedValue(e);
    open();
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'duplicado' } });
    fireEvent.click(submit());
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/ultrapassa o que ainda pode ser devolvido/);
    });
  });

  it('reports the refund it made, by id', async () => {
    const onRefunded = vi.fn();
    open({ onRefunded });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'duplicado' } });
    fireEvent.click(submit());
    await waitFor(() => expect(screen.getByText(/rf_1/)).not.toBeNull());
    // The confirmation is interpolated, so the text spans several nodes; match
    // on the element's own content rather than on a single text node.
    expect(screen.getAllByText((_t, el) => el?.textContent === 'Reembolso de 1 000 Kz registado.').length)
      .toBeGreaterThan(0);
    expect(onRefunded).toHaveBeenCalledTimes(1);
  });

  it('is a modal dialog with an accessible name', () => {
    open();
    const d = screen.getByRole('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe('Reembolsar pagamento');
  });
});
