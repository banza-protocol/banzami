// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import {
  ApiError,
  MESSAGES,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhookEvent,
} from '@/lib/developer-api';
import { ToastProvider } from './Toast';
import { WebhooksManager } from './WebhooksManager';

/**
 * What the Webhooks screen must not get wrong.
 *
 * Three of these guard refusals rather than happy paths, because that is where
 * this screen was thin: a delete the server refuses, a project with no financial
 * binding, and a signing secret that must exist nowhere but React state.
 */

const api = vi.hoisted(() => ({
  listWebhookEndpoints: vi.fn(),
  listWebhookEvents: vi.fn(),
  listWebhookDeliveries: vi.fn(),
  createWebhookEndpoint: vi.fn(),
  rotateWebhookSecret: vi.fn(),
  setWebhookEndpointActive: vi.fn(),
  deleteWebhookEndpoint: vi.fn(),
  replayWebhookDelivery: vi.fn(),
}));

vi.mock('@/lib/developer-api', async (orig) => {
  const real = await orig<typeof import('@/lib/developer-api')>();
  return { ...real, developerApi: api };
});

// The Console's data context, stubbed down to what this screen reads. onApiError
// is reproduced rather than faked away: mapping a server code to its Portuguese
// sentence is exactly the behaviour two of these tests are about.
vi.mock('./DeveloperData', async () => {
  const { MESSAGES: MSG } = await import('@/lib/developer-api');
  return {
    useDeveloperData: () => ({
      activeProject: { id: 'prj_1' },
      csrf: 'csrf-token',
      onApiError: (e: unknown) => {
        const code = e instanceof Error && 'code' in e ? String((e as { code: unknown }).code) : 'UNAVAILABLE';
        return MSG[code] ?? MSG.UNAVAILABLE;
      },
    }),
  };
});

const endpoint: WebhookEndpoint = {
  id: 'ep_1',
  url: 'https://a-sua-app.ao/webhooks/banzami',
  events: ['payment_session.paid', 'refund.completed'],
  active: true,
  created_at: '2026-09-01T08:30:00Z',
};

const events: WebhookEvent[] = [
  { id: 'evt_aaa', event_type: 'payment_session.paid', created_at: '2026-09-10T10:00:00Z' },
  { id: 'evt_bbb', event_type: 'refund.completed', created_at: '2026-09-10T11:00:00Z' },
];

function mount() {
  return render(
    <ToastProvider>
      <WebhooksManager />
    </ToastProvider>,
  );
}

/** Open the endpoint's detail panel, where every endpoint action lives. */
async function openDetail() {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Detalhes' }));
}

const dialog = () => screen.getByRole('dialog');

/**
 * A Storage the test can actually read back.
 *
 * This jsdom build answers `window.localStorage` with undefined, so asserting
 * "storage is empty" against it would pass no matter what the component did —
 * the strongest possible test of nothing. A real backing map makes the
 * assertion mean what it says: anything written is visible here.
 */
function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
  } as Storage;
}

function installStorage() {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const store = makeStorage();
    Object.defineProperty(window, name, { configurable: true, writable: true, value: store });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: store });
  }
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.listWebhookEndpoints.mockResolvedValue({ endpoints: [endpoint] });
  api.listWebhookEvents.mockResolvedValue({ events });
  api.listWebhookDeliveries.mockResolvedValue({ deliveries: [] });
  api.deleteWebhookEndpoint.mockResolvedValue(undefined);
  api.setWebhookEndpointActive.mockResolvedValue(endpoint);
  api.replayWebhookDelivery.mockResolvedValue({ status: 'PENDING' });
  installStorage();
});
afterEach(cleanup);

describe('deleting an endpoint', () => {
  it('does not delete on the click that asks to delete', async () => {
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    // The endpoint is still there. What appeared is a question naming the URL,
    // because "Eliminar endpoint" alone cannot say which one.
    expect(api.deleteWebhookEndpoint).not.toHaveBeenCalled();
    expect(within(dialog()).getByText(endpoint.url)).toBeTruthy();
    expect(dialog().getAttribute('aria-modal')).toBe('true');
  });

  it('deletes the endpoint the dialog named, once confirmed', async () => {
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(api.deleteWebhookEndpoint).toHaveBeenCalledWith('prj_1', 'ep_1', 'csrf-token'));
  });

  it('turns the refusal into the action the reader actually wanted', async () => {
    // An endpoint that has delivered cannot be deleted: the deliveries reference
    // it, and that history is not the endpoint's to take with it. The refusal is
    // permanent, so it has to lead somewhere.
    api.deleteWebhookEndpoint.mockRejectedValue(
      new ApiError('ENDPOINT_HAS_DELIVERIES', 409, MESSAGES.ENDPOINT_HAS_DELIVERIES),
    );

    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Eliminar' }));

    // The refusal takes over the screen, and it is the refusal that offers the
    // way out — not the row underneath it.
    const refusal = await screen.findByRole('dialog', { name: 'Este endpoint não pode ser eliminado' });
    // The server's own Portuguese sentence, not "conflito" and not the English
    // the API answered with.
    expect(within(refusal).getByText(new RegExp(MESSAGES.ENDPOINT_HAS_DELIVERIES.slice(0, 40)))).toBeTruthy();

    fireEvent.click(within(refusal).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(api.setWebhookEndpointActive).toHaveBeenCalledWith('prj_1', 'ep_1', false, 'csrf-token'));
  });
});

describe('the signing secret', () => {
  // Assembled at runtime: a credential-shaped literal in a committed file is
  // exactly what the repo's push protection exists to stop, even a fake one.
  const SECRET = ['whsec', 'test', 'n0tar3alsecret'].join('_');

  it('lives in React state and nowhere a browser keeps things', async () => {
    api.rotateWebhookSecret.mockResolvedValue({ ...endpoint, secret: SECRET });

    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Rodar segredo' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Rodar segredo' }));

    // Shown once — so the storage assertions below are not vacuous.
    expect(await screen.findByText(SECRET)).toBeTruthy();

    for (const [name, store] of [
      ['localStorage', window.localStorage],
      ['sessionStorage', window.sessionStorage],
    ] as const) {
      // Walked by index, not by Object.keys: a Storage's entries are not own
      // enumerable properties, and reading it that way made this assertion pass
      // over a store that had the secret in it.
      const values = Array.from({ length: store.length }, (_, i) => store.getItem(store.key(i) ?? '') ?? '');
      expect(values.join('|'), `the secret reached ${name}`).not.toContain(SECRET);
      expect(store.length, `${name} gained an entry while a secret was on screen`).toBe(0);
    }
  });
});

describe('finding one event among the last 25', () => {
  it('narrows the list to what was typed, and says so when nothing matches', async () => {
    mount();
    expect(await screen.findByText('evt_aaa')).toBeTruthy();
    expect(screen.getByText('evt_bbb')).toBeTruthy();

    const filter = screen.getByLabelText('Filtrar eventos');
    fireEvent.change(filter, { target: { value: 'refund' } });
    expect(screen.queryByText('evt_aaa')).toBeNull();
    expect(screen.getByText('evt_bbb')).toBeTruthy();

    // An id is as good a handle as a type — it is what a developer pastes.
    fireEvent.change(filter, { target: { value: 'evt_aaa' } });
    expect(screen.getByText('evt_aaa')).toBeTruthy();
    expect(screen.queryByText('evt_bbb')).toBeNull();

    fireEvent.change(filter, { target: { value: 'payout' } });
    expect(screen.queryByText('evt_aaa')).toBeNull();
    expect(document.body.textContent).toMatch(/Nenhum dos 2 eventos mais recentes corresponde/);
  });
});

describe('a project with no financial binding', () => {
  it('explains itself instead of printing the refusal', async () => {
    api.listWebhookEndpoints.mockRejectedValue(new ApiError('NOT_FOUND', 404, MESSAGES.NOT_FOUND));

    mount();
    expect(await screen.findByText('Projecto ainda sem titular financeiro')).toBeTruthy();
    // Not "Não encontrado", which answers a question the developer did not ask.
    expect(document.body.textContent).not.toContain(MESSAGES.NOT_FOUND);
    expect(document.body.textContent).toMatch(/não há eventos para mostrar/);
  });

  // The code the API actually answers today. This screen had purpose-built copy
  // for the state and could not reach it: the branch still looked for NOT_FOUND,
  // which is what the API answered BEFORE the code existed, so every new project
  // — the ordinary case — was told "Serviço indisponível. Tente novamente."
  // That is false, and it is advice to repeat the one thing that cannot help.
  // Found by the 50-step browser journey (step 28).
  it('explains itself for the 409 the API answers now, not only the old 404', async () => {
    api.listWebhookEndpoints.mockRejectedValue(
      new ApiError('PROJECT_FINANCIAL_SETUP_REQUIRED', 409, 'this project has no Sandbox financial setup yet'),
    );

    mount();
    expect(await screen.findByText('Projecto ainda sem titular financeiro')).toBeTruthy();
    expect(document.body.textContent).not.toContain(MESSAGES.UNAVAILABLE);
    expect(document.body.textContent).not.toMatch(/Tente novamente/);
  });

  it('maps a failure that is not an ApiError instead of showing its own words', async () => {
    // A fetch that throws lands here with no `code` at all. Reading `.code` off
    // whatever was thrown used to miss it, and the fallback printed the
    // exception's message — an English string written for a stack trace.
    api.listWebhookEndpoints.mockRejectedValue(new TypeError('Failed to fetch'));

    mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(MESSAGES.UNAVAILABLE);
    expect(document.body.textContent).not.toContain('Failed to fetch');
  });
});

describe('reenviar uma entrega', () => {
  const failed: WebhookDelivery = {
    id: 'dlv_failed',
    event_id: 'evt_aaa',
    endpoint_id: 'ep_1',
    status: 'FAILED',
    status_code: 500,
    attempt_count: 5,
    delivered_at: null,
    created_at: '2026-09-10T10:00:05Z',
  };
  const succeeded: WebhookDelivery = {
    ...failed,
    id: 'dlv_ok',
    status: 'SUCCESS',
    status_code: 200,
    attempt_count: 1,
    delivered_at: '2026-09-10T10:00:02Z',
  };

  /** Open the first event's deliveries. */
  async function openDeliveries() {
    mount();
    fireEvent.click(await screen.findByText('evt_aaa'));
    await screen.findByRole('columnheader', { name: 'ESTADO' });
  }

  it('is not offered on a delivery the receiver accepted', async () => {
    // The integrator received that event and acted on it. Sending it again is a
    // second "payment received" for one payment, and the server refuses it —
    // so the Console does not ask.
    api.listWebhookDeliveries.mockResolvedValue({ deliveries: [succeeded] });

    await openDeliveries();
    expect(screen.getByText('Entregue · 200')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reenviar' })).toBeNull();
  });

  it('re-queues the delivery that failed, once confirmed, and re-reads the row', async () => {
    api.listWebhookDeliveries.mockResolvedValue({ deliveries: [failed] });

    await openDeliveries();
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar' }));

    // Nothing has been sent yet, and the question names the address the delivery
    // is going back to.
    expect(api.replayWebhookDelivery).not.toHaveBeenCalled();
    expect(within(dialog()).getByText(endpoint.url)).toBeTruthy();
    // The same delivery goes back in the queue; no second delivery is created,
    // and the copy must not say one is.
    expect(within(dialog()).getByText(/não é criada uma entrega nova/)).toBeTruthy();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reenviar' }));
    await waitFor(() =>
      expect(api.replayWebhookDelivery).toHaveBeenCalledWith('prj_1', 'dlv_failed', 'csrf-token'));

    // The row must show what the server now holds — PENDING — rather than the
    // FAILED it was rendered from.
    api.listWebhookDeliveries.mockResolvedValue({
      deliveries: [{ ...failed, status: 'PENDING', status_code: null }],
    });
    await waitFor(() => expect(api.listWebhookDeliveries).toHaveBeenCalledTimes(2));
  });

  it('says what the server said when the delivery succeeded in the meantime', async () => {
    // A delivery can succeed between the render and the click. The refusal is
    // about this delivery and is answered in Portuguese, not as a generic
    // failure — and the stale row is re-read.
    api.listWebhookDeliveries.mockResolvedValue({ deliveries: [failed] });
    api.replayWebhookDelivery.mockRejectedValue(
      new ApiError('DELIVERY_ALREADY_SUCCEEDED', 409, MESSAGES.DELIVERY_ALREADY_SUCCEEDED),
    );

    await openDeliveries();
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reenviar' }));

    const alert = await within(dialog()).findByRole('alert');
    expect(alert.textContent).toBe(MESSAGES.DELIVERY_ALREADY_SUCCEEDED);
    expect(alert.textContent).not.toBe(MESSAGES.CONFLICT);
    await waitFor(() => expect(api.listWebhookDeliveries).toHaveBeenCalledTimes(2));
  });
});

describe('the endpoint detail', () => {
  it('reads the subscriptions out instead of dumping the array', async () => {
    await openDetail();
    // The wire name is still there — it is what the developer greps for — but
    // beside what subscribing to it actually brings them.
    expect(screen.getAllByText('payment_session.paid').length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/É o evento em que a integração canónica assenta/);
    // The state is a word, not only a colour — in the row and in the detail.
    expect(screen.getAllByText('Ativo').length).toBe(2);
  });

  it('says the address cannot be edited, because no route changes it', async () => {
    // developer-api's PATCH decodes `{ active *bool }` and nothing else; there is
    // no update path at the store layer either. An edit form here would collect
    // changes the server discards.
    await openDetail();
    expect(document.body.textContent).toMatch(/não podem ser alterados depois de\s+registados/);
  });
});
