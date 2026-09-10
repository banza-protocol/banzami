import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { documentsToSend, fetchApplicationStatus, isApplicationReference, STATUS_COPY, type ApplicationStatus } from './application-status';

vi.mock('./api', () => ({ platformTarget: async () => ({ base: 'https://gw.test', env: 'SANDBOX' }) }));

const base: ApplicationStatus = {
  application_id: '11111111-2222-4333-8444-555555555555',
  status: 'INFORMATION_REQUIRED',
  origin: 'STANDALONE_BUSINESS',
  requested_handle: 'loja',
  information_request: 'Envie o registo comercial actualizado.',
  created_at: '2026-09-10T10:00:00Z',
  requirements: {
    policy_version: 'ao-business-2026-09',
    currently_due: [{ code: 'REPRESENTATIVE_ID', kind: 'document', label: 'BI', reason: 'MISSING' }, { code: 'nif', kind: 'field', label: 'NIF', reason: 'MISSING' }],
    pending_verification: [],
    errors: [{ code: 'BUSINESS_REGISTRATION', kind: 'document', label: 'Registo', reason: 'REJECTED: ilegível' }, { code: 'information_request', kind: 'field', label: 'Pedido', reason: '…' }],
    accepted: [],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('the applicant status', () => {
  it('only a UUID reference is looked up', async () => {
    expect(isApplicationReference(base.application_id)).toBe(true);
    expect(isApplicationReference('BBCE4CEF')).toBe(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await fetchApplicationStatus('../../admin')).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('an unknown reference and an outage read differently', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    expect(await fetchApplicationStatus(base.application_id)).toEqual({ ok: false, reason: 'NOT_FOUND' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    expect(await fetchApplicationStatus(base.application_id)).toEqual({ ok: false, reason: 'UNAVAILABLE' });
  });

  it('offers exactly the documents that are due or refused, while the application is open', () => {
    expect(documentsToSend(base).map((i) => i.code)).toEqual(['REPRESENTATIVE_ID', 'BUSINESS_REGISTRATION']);
    expect(documentsToSend({ ...base, status: 'APPROVED' })).toEqual([]);
    expect(documentsToSend({ ...base, status: 'REJECTED' })).toEqual([]);
  });

  it('every status has words for the applicant', () => {
    for (const s of Object.keys(STATUS_COPY)) expect(STATUS_COPY[s as ApplicationStatus['status']].title).not.toBe('');
  });

  it('the confirmation screen links to the status page', () => {
    const form = readFileSync(join(__dirname, '../app/comerciantes/candidatura/CandidaturaForm.tsx'), 'utf8');
    expect(form).toMatch(/\/comerciantes\/candidatura\/estado\?ref=\$\{applicationId\}/);
  });
});
