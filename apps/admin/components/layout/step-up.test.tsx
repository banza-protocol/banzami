// @vitest-environment jsdom
//
// A5-08. A high-risk action answered STEP_UP_REQUIRED opens the code dialog;
// the code the operator types is proven at /auth/step-up and the action runs
// again — or, on cancel, stays refused.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StepUpProvider } from './step-up';
import { AdminApi, AdminApiError } from '@/lib/admin-api';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stub(stepUpAnswers: Response[]) {
  const urls: string[] = [];
  const bodies: unknown[] = [];
  let stepped = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    urls.push(url.replace(/^.*\/admin\/v1/, ''));
    if (url.endsWith('/auth/step-up')) {
      bodies.push(JSON.parse(String(init.body)));
      const r = stepUpAnswers.shift()!;
      if (r.ok) stepped = true;
      return r;
    }
    return stepped ? json(200, { ok: true }) : json(403, { error: { code: 'STEP_UP_REQUIRED', message: 'confirm' } });
  }));
  return { urls, bodies };
}

describe('the step-up dialog', () => {
  it('asks for the code, proves it, and lets the action through', async () => {
    const { urls, bodies } = stub([json(200, { stepped_up_until: 'x', expires_at: 'y' })]);
    render(<StepUpProvider><div /></StepUpProvider>);
    let result: unknown;
    act(() => { void new AdminApi().createOperator('new@banzami.test', 'New', 'SUPER_ADMIN').then((r) => { result = r; }); });

    const input = await screen.findByLabelText('Código do autenticador');
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(result).toEqual({ ok: true }));
    expect(bodies).toEqual([{ code: '123456' }]);
    expect(urls).toEqual(['/operators', '/auth/step-up', '/operators']);
    expect(screen.queryByLabelText('Código do autenticador')).toBeNull();
  });

  it('says so when the code is refused, and asks again', async () => {
    stub([json(403, { error: { code: 'MFA_CODE_REJECTED', message: 'no' } }), json(200, {})]);
    render(<StepUpProvider><div /></StepUpProvider>);
    let result: unknown;
    act(() => { void new AdminApi().processPayout('p-1').then((r) => { result = r; }); });

    fireEvent.change(await screen.findByLabelText('Código do autenticador'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/não confere/);

    const again = screen.getByLabelText('Código do autenticador') as HTMLInputElement;
    expect(again.value).toBe(''); // a fresh field, not the refused code
    fireEvent.change(again, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(result).toEqual({ ok: true }));
  });

  it('cancel leaves the action refused', async () => {
    const { urls } = stub([]);
    render(<StepUpProvider><div /></StepUpProvider>);
    let error: unknown;
    act(() => { void new AdminApi().freezeAccount('MERCHANT', 'm-1', 'fraude').catch((e) => { error = e; }); });

    await screen.findByLabelText('Código do autenticador');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(error).toBeInstanceOf(AdminApiError));
    expect((error as AdminApiError).code).toBe('STEP_UP_REQUIRED');
    expect(urls).toEqual(['/risk/freeze']);
  });
});
