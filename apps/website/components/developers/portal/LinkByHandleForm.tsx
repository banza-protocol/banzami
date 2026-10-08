'use client';

import { useState } from 'react';
import { developerApi, ApiError, type OnboardingBusiness } from '@/lib/developer-api';
import { ConnectBusinessForm } from './ConnectBusinessForm';
import { OtpBoxes } from './OtpBoxes';
import { FIELD_ERROR, FIELD_INPUT, FIELD_LABEL, SECONDARY_BUTTON, primaryButton } from './ui';

/**
 * Path B (ADR-060): link a Business you already control by its @banza. Banzami
 * resolves the Business and sends a confirmation code to the verified contact
 * already associated with it — never to an address you type. A business with no
 * verified contact is offered enrolment (only here, where you already manage it);
 * a @banza this workspace does not manage is a neutral "not found". The consent
 * link-code route (Path C) stays available as an alternative.
 */

function refusalText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : '';
  switch (code) {
    case 'NOT_FOUND': return 'Não encontrámos esse @banza nos seus negócios. Verifique o nome ou use um código de ligação.';
    case 'INVALID_CODE': return 'O código é inválido ou expirou. Peça um novo.';
    case 'TOO_MANY_ATTEMPTS': return 'Demasiadas tentativas. Aguarde um pouco antes de tentar de novo.';
    case 'LINK_GRANT_EXPIRED': return 'A confirmação expirou. Comece de novo.';
    case 'NO_VERIFIED_CONTACT': return 'Este negócio ainda não tem um contacto confirmado.';
    case 'PROJECT_ALREADY_RECEIVING': return 'Este projeto já recebe num negócio.';
    case 'FORBIDDEN': return 'Só um Owner ou Admin do workspace pode fazer isto.';
    default: return 'Não foi possível concluir agora. Tente novamente.';
  }
}

type Phase = 'handle' | 'enrol' | 'enrolVerify' | 'linkVerify';

export function LinkByHandleForm({
  projectId, csrf, onCancel, onLinked,
}: {
  projectId: string;
  csrf: string;
  onCancel: () => void;
  onLinked: (business: OnboardingBusiness) => void;
}) {
  const [useCode, setUseCode] = useState(false);
  const [phase, setPhase] = useState<Phase>('handle');
  const [handle, setHandle] = useState('');
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cleanHandle = handle.trim().replace(/^@/, '').toLowerCase();

  if (useCode) {
    return (
      <div>
        <ConnectBusinessForm projectId={projectId} csrf={csrf} onCancel={onCancel} onLinked={onLinked} />
        <button type="button" onClick={() => setUseCode(false)} style={{ ...SECONDARY_BUTTON, marginTop: 12 }}>
          Prefiro confirmar pelo @banza
        </button>
      </div>
    );
  }

  async function startByHandle() {
    if (!cleanHandle || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await developerApi.startBusinessLinkByHandle(projectId, cleanHandle, csrf);
      if (r.needs_contact) {
        setPhase('enrol');
      } else {
        setMasked(r.masked_email ?? '');
        setPhase('linkVerify');
      }
    } catch (e) {
      setError(refusalText(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendEnrolCode() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // No email is supplied: Banzami sends the code to the Business's own
      // server-side contact and returns only its masked form.
      const r = await developerApi.startBusinessContactEnrolment(projectId, cleanHandle, csrf);
      setMasked(r.masked_email);
      setPhase('enrolVerify');
    } catch (e) {
      setError(refusalText(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrol(c: string) {
    if (c.length !== 6 || busy) return;
    setBusy(true);
    setError('');
    try {
      await developerApi.confirmBusinessContactEnrolment(projectId, cleanHandle, c, csrf);
      // Contact verified; now send the project-link code to it.
      const r = await developerApi.startBusinessLinkByHandle(projectId, cleanHandle, csrf);
      setMasked(r.masked_email ?? '');
      setCode('');
      setPhase('linkVerify');
    } catch (e) {
      setError(refusalText(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmLink(c: string) {
    if (c.length !== 6 || busy) return;
    setBusy(true);
    setError('');
    try {
      const st = await developerApi.confirmBusinessLinkByHandle(projectId, cleanHandle, c, csrf);
      const b = st.onboarding?.business;
      onLinked(b ?? ({ name: `@${cleanHandle}`, handle: `@${cleanHandle}` } as OnboardingBusiness));
    } catch (e) {
      setError(refusalText(e));
    } finally {
      setBusy(false);
    }
  }

  const heading = (
    <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>Ligar um negócio existente</h3>
  );

  if (phase === 'linkVerify' || phase === 'enrolVerify') {
    const onComplete = phase === 'linkVerify' ? confirmLink : confirmEnrol;
    return (
      <div data-testid="link-by-handle-verify" style={{ marginTop: 18 }}>
        {heading}
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#6a5a5e', fontWeight: 600, lineHeight: 1.6 }}>
          Enviámos um código para o contacto verificado associado a <strong>@{cleanHandle}</strong>: <strong style={{ color: '#2a2024' }}>{masked}</strong>.
          Não lhe pedimos que indique um email — a confirmação vai para o contacto já associado ao negócio.
        </p>
        <OtpBoxes onChange={setCode} onComplete={(c) => void onComplete(c)} disabled={busy} />
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void onComplete(code)} disabled={code.length !== 6 || busy} style={primaryButton(code.length !== 6 || busy)}>
            {busy ? 'A confirmar…' : 'Confirmar'}
          </button>
          <button type="button" onClick={() => { setPhase('handle'); setCode(''); setError(''); }} disabled={busy} style={SECONDARY_BUTTON}>Voltar</button>
        </div>
        {error && <p role="alert" style={FIELD_ERROR}>{error}</p>}
      </div>
    );
  }

  if (phase === 'enrol') {
    return (
      <div data-testid="link-by-handle-enrol" style={{ marginTop: 18 }}>
        {heading}
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#6a5a5e', fontWeight: 600, lineHeight: 1.6 }}>
          O negócio <strong>@{cleanHandle}</strong> ainda não tem um contacto confirmado. Para o ligar, confirme o
          controlo do negócio: a Banzami envia um código para o contacto já associado a este negócio, nunca para um email
          indicado aqui.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" data-testid="link-enrol-send" onClick={() => void sendEnrolCode()} disabled={busy} style={primaryButton(busy)}>
            {busy ? 'A enviar…' : 'Enviar código de confirmação'}
          </button>
          <button type="button" onClick={() => { setPhase('handle'); setError(''); }} disabled={busy} style={SECONDARY_BUTTON}>Voltar</button>
        </div>
        {error && <p role="alert" style={FIELD_ERROR}>{error}</p>}
      </div>
    );
  }

  return (
    <div data-testid="link-by-handle" style={{ marginTop: 18 }}>
      {heading}
      <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#6a5a5e', fontWeight: 600, lineHeight: 1.6 }}>
        Introduza o @banza do negócio. A Banzami envia a confirmação para o contacto verificado já associado a esse
        negócio — nunca para um email indicado aqui. Assim ninguém liga um negócio que não controla.
      </p>
      <div style={{ marginTop: 14, maxWidth: 320 }}>
        <label htmlFor="link-handle" style={FIELD_LABEL}>@banza do negócio</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: '#8a7a7e' }}>@</span>
          <input id="link-handle" data-testid="link-handle-input" value={handle} onChange={(e) => { setHandle(e.target.value); setError(''); }}
                 disabled={busy} autoComplete="off" spellCheck={false} placeholder="doa" style={{ ...FIELD_INPUT, flex: 1 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" data-testid="link-by-handle-go" onClick={() => void startByHandle()} disabled={!cleanHandle || busy} style={primaryButton(!cleanHandle || busy)}>
          {busy ? 'A continuar…' : 'Continuar'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} style={SECONDARY_BUTTON}>Voltar</button>
      </div>
      <button type="button" onClick={() => setUseCode(true)} style={{ ...SECONDARY_BUTTON, marginTop: 12, fontSize: 13 }}>
        Tenho um código de ligação
      </button>
      {error && <p role="alert" style={FIELD_ERROR}>{error}</p>}
    </div>
  );
}
