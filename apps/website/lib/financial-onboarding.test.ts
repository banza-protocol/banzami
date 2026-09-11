import { describe, expect, it } from 'vitest';
import type { FinancialSetupState, OnboardingApplication } from './developer-api';
import {
  BLOCKER_TEXT,
  applicationReference,
  blockerText,
  canActOn,
  formatLinkCode,
  isCompleteLinkCode,
  normaliseLinkCode,
  onboardingHeading,
  onboardingViewOf,
  refusalText,
  requiredFrom,
  requirementReasonText,
  uploadableDocuments,
  documentProblem,
} from './financial-onboarding';

const base: FinancialSetupState = {
  state: 'UNCONFIGURED', environment: 'SANDBOX', can_configure: true, role: 'OWNER', sealed: false,
};

describe('onboardingViewOf', () => {
  it('is the server onboarding state when there is one', () => {
    for (const s of ['NOT_CONFIGURED', 'IN_REVIEW', 'INFORMATION_REQUIRED', 'APPROVED_PROVISIONING', 'REJECTED', 'READY', 'BLOCKED', 'READINESS_UNKNOWN'] as const) {
      expect(onboardingViewOf({ ...base, onboarding: { state: s, can_act: false, blockers: [] } })).toBe(s);
    }
  });

  it('a deployment that cannot onboard is UNAVAILABLE, whatever the onboarding says', () => {
    expect(onboardingViewOf({ ...base, state: 'UNAVAILABLE', onboarding: { state: 'NOT_CONFIGURED', can_act: true, blockers: [] } }))
      .toBe('UNAVAILABLE');
  });

  it('reads a server that predates onboarding from the setup state, never guessing', () => {
    expect(onboardingViewOf(base)).toBe('NOT_CONFIGURED');
    expect(onboardingViewOf({ ...base, state: 'READY' })).toBe('READY');
  });

  // A2-26 — a readiness read that failed is not "no blockers".
  it('a failed readiness read is never READY', () => {
    expect(onboardingViewOf({ ...base, state: 'READY', readiness: null, readiness_unavailable: true })).toBe('READINESS_UNKNOWN');
    expect(onboardingViewOf({ ...base, state: 'SEALED', readiness: null, readiness_unavailable: true })).toBe('READINESS_UNKNOWN');
    expect(onboardingViewOf({
      ...base, state: 'READY', readiness: null, readiness_unavailable: true,
      onboarding: { state: 'READY', can_act: false, blockers: [] },
    })).toBe('READINESS_UNKNOWN');
    expect(onboardingHeading('READINESS_UNKNOWN')).toBe('Configuração financeira — Estado por confirmar');
  });
});

describe('headings', () => {
  it('say where the Project stands', () => {
    expect(onboardingHeading('NOT_CONFIGURED')).toBe('Configuração financeira — Não configurado');
    expect(onboardingHeading('IN_REVIEW')).toBe('Configuração financeira — Em análise');
    expect(onboardingHeading('APPROVED_PROVISIONING')).toBe('Aprovado — a concluir a configuração');
  });
});

describe('canActOn', () => {
  it('follows the server, and nobody acts where nothing can be done', () => {
    expect(canActOn({ ...base, onboarding: { state: 'NOT_CONFIGURED', can_act: true, blockers: [] } })).toBe(true);
    expect(canActOn({ ...base, role: 'DEVELOPER', onboarding: { state: 'NOT_CONFIGURED', can_act: false, blockers: [] } })).toBe(false);
    expect(canActOn({ ...base, state: 'UNAVAILABLE' })).toBe(false);
  });
});

describe('the consent code', () => {
  it('accepts it with or without dashes, in any case, with stray spaces', () => {
    expect(normaliseLinkCode('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
    expect(normaliseLinkCode(' ABCD EFGH JKMN ')).toBe('ABCDEFGHJKMN');
    expect(normaliseLinkCode('ABCDEFGHJKMN')).toBe('ABCDEFGHJKMN');
  });

  it('groups it the way the Business app shows it', () => {
    expect(formatLinkCode('abcdefghjkmn')).toBe('ABCD-EFGH-JKMN');
    expect(formatLinkCode('abcde')).toBe('ABCD-E');
    expect(formatLinkCode('')).toBe('');
  });

  it('is twelve characters of the code alphabet — no 0, O, 1, I or L', () => {
    expect(isCompleteLinkCode('ABCD-EFGH-JKMN')).toBe(true);
    expect(isCompleteLinkCode('abcd-efgh-jkmn')).toBe(true);
    expect(isCompleteLinkCode('ABCD-EFGH-JKM')).toBe(false);
    expect(isCompleteLinkCode('ABCD-EFGH-JKM0')).toBe(false);
    expect(isCompleteLinkCode('ABCD-EFGH-JKMI')).toBe(false);
  });
});

describe('blockers', () => {
  it('application-fee classification is the operator’s decision, not a KYB problem', () => {
    expect(blockerText('FEE_DESTINATION_TYPE_NOT_ALLOWED')).toBe(
      'Receber taxas de aplicação requer aprovação do operador Banzami (classificação da conta).',
    );
    expect(blockerText('FEE_DESTINATION_TYPE_NOT_ALLOWED')).not.toMatch(/KYB|verifica/i);
  });

  it('names every settlement readiness code, and shows an unknown one by its code', () => {
    for (const code of [
      'FINANCIAL_SETUP_NOT_CONFIGURED', 'WALLET_MISSING', 'PRICING_NOT_CONFIGURED', 'PRICING_CONFIGURATION_ERROR',
      'FEE_DESTINATION_NOT_FOUND', 'FEE_DESTINATION_NOT_OWNED', 'FEE_DESTINATION_NOT_BUSINESS_ACCOUNT',
      'FEE_DESTINATION_NOT_ACTIVE', 'FEE_DESTINATION_KYB_NOT_APPROVED', 'FEE_DESTINATION_WALLET_UNAVAILABLE',
      'FEE_DESTINATION_TYPE_NOT_ALLOWED', 'WEBHOOK_ENDPOINT_MISSING',
    ]) {
      expect(BLOCKER_TEXT[code], code).toBeTruthy();
      expect(blockerText(code)).not.toBe(code);
    }
    expect(blockerText('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});

describe('refusals', () => {
  it('a @ that belongs to a Business sends the developer to its code', () => {
    expect(refusalText('HANDLE_OWNED_BY_BUSINESS')).toMatch(/código/);
  });

  it('an unknown code is still a sentence, never raw English', () => {
    expect(refusalText('SOMETHING')).toBe('Não foi possível concluir agora. Tente novamente.');
    expect(refusalText(undefined)).toBe('Não foi possível concluir agora. Tente novamente.');
  });
});

describe('the application', () => {
  const app: OnboardingApplication = {
    application_id: '3f2a9c1e-0b7d-4e55-9a10-2c6f1b8e7d44',
    status: 'INFORMATION_REQUIRED',
    origin: 'DEVELOPER_CONSOLE',
    requested_handle: 'loja',
    business_name: 'Loja',
    created_at: '2026-09-01T10:00:00Z',
    requirements: {
      policy_version: 'ao-business-2026-09',
      currently_due: [{ code: 'REPRESENTATIVE_ID', kind: 'document', label: 'BI', reason: 'MISSING' }],
      pending_verification: [],
      errors: [
        { code: 'BUSINESS_REGISTRATION', kind: 'document', label: 'Registo', reason: 'REJECTED: ilegível' },
        { code: 'information_request', kind: 'field', label: 'Pedido', reason: 'Envie o registo legível.' },
      ],
      accepted: [],
    },
  };

  it('is quoted by the first 8 characters of its reference, upper case', () => {
    expect(applicationReference(app.application_id)).toBe('3F2A9C1E');
  });

  it('offers the missing and refused documents again, and the optional one', () => {
    expect(uploadableDocuments(app)).toEqual(['REPRESENTATIVE_ID', 'BUSINESS_REGISTRATION', 'OTHER']);
    const none = { ...app, requirements: { ...app.requirements, currently_due: [], errors: [] } };
    expect(uploadableDocuments(none)).toEqual(['OTHER']);
  });

  it('says each requirement’s standing in words', () => {
    expect(requirementReasonText('MISSING')).toBe('Em falta');
    expect(requirementReasonText('UPLOADED')).toMatch(/aguardar verificação/);
    expect(requirementReasonText('REJECTED: ilegível')).toBe('Recusado: ilegível');
    expect(requirementReasonText('Envie o registo legível.')).toBe('Envie o registo legível.');
  });

  it('requires what the policy requires, and falls back to a copy that still requires something', () => {
    const r = requiredFrom({ items: [{ code: 'business_name', kind: 'field' }, { code: 'REPRESENTATIVE_ID', kind: 'document' }] });
    expect([...r.fields]).toEqual(['business_name']);
    expect([...r.documents]).toEqual(['REPRESENTATIVE_ID']);
    const fb = requiredFrom(null);
    expect(fb.fields.has('nif')).toBe(true);
    expect(fb.documents.has('BUSINESS_REGISTRATION')).toBe(true);
  });

  it('takes PDF, JPEG or PNG up to 5 MB', () => {
    expect(documentProblem({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBeNull();
    expect(documentProblem({ name: 'a.exe', type: 'application/x-msdownload', size: 1000 })).toMatch(/Formato/);
    expect(documentProblem({ name: 'a.png', type: 'image/png', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });
});
