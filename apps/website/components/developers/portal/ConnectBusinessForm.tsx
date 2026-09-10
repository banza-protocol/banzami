'use client';

import { useState } from 'react';
import { developerApi, ApiError, type OnboardingBusiness } from '@/lib/developer-api';
import { formatLinkCode, isCompleteLinkCode, normaliseLinkCode, refusalText } from '@/lib/financial-onboarding';
import { FIELD_ERROR, FIELD_HINT, FIELD_INPUT, FIELD_LABEL, SECONDARY_BUTTON, primaryButton } from './ui';

/**
 * Path B — connect a Banzami Business that already exists, with its consent.
 *
 * Naming a Business proves nothing about who is typing, so this form has no
 * field for a @banza, an id or an email. The Business opens its own app, asks
 * for a code, and hands it over; redeeming the code is the consent. Nothing is
 * re-verified or re-created: the Project starts receiving into that Business.
 */
export function ConnectBusinessForm({
  projectId,
  csrf,
  onCancel,
  onLinked,
}: {
  projectId: string;
  csrf: string;
  onCancel: () => void;
  onLinked: (business: OnboardingBusiness) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!isCompleteLinkCode(code)) {
      setError('O código tem 12 letras e números, por exemplo ABCD-EFGH-JKMN.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await developerApi.linkExistingBusiness(projectId, normaliseLinkCode(code), csrf);
      onLinked(r.business);
    } catch (err) {
      setError(refusalText(err instanceof ApiError ? err.code : 'UNAVAILABLE'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="fo-connect-heading" style={{ marginTop: 18 }}>
      <h3 id="fo-connect-heading" style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>
        Usar um negócio Banzami existente
      </h3>
      <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#6a5a5e', fontWeight: 600, lineHeight: 1.6 }}>
        O negócio autoriza a ligação com um código de uso único. Assim ninguém liga um negócio que não é seu.
      </p>
      <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13.5, color: '#2a2024', fontWeight: 600, lineHeight: 1.7 }}>
        <li>No telemóvel do negócio, abra a app Banzami Business.</li>
        <li>Vá a Perfil → «Ligar a um projeto».</li>
        <li>A app mostra um código no formato ABCD-EFGH-JKMN, válido durante 10 minutos e só uma vez.</li>
        <li>Introduza esse código aqui. O negócio não é verificado nem criado de novo — este projeto passa a receber nele.</li>
      </ol>

      <div style={{ marginTop: 16, maxWidth: 320 }}>
        <label htmlFor="fo-link-code" style={FIELD_LABEL}>Código do negócio</label>
        <input
          id="fo-link-code"
          name="code"
          value={code}
          onChange={(e) => { setCode(formatLinkCode(e.target.value)); setError(''); }}
          placeholder="ABCD-EFGH-JKMN"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'fo-link-code-hint fo-link-code-error' : 'fo-link-code-hint'}
          style={{ ...FIELD_INPUT, fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: '.08em', fontSize: 16 }}
        />
        <p id="fo-link-code-hint" style={FIELD_HINT}>Com ou sem hífenes, maiúsculas ou minúsculas.</p>
        {error && <p id="fo-link-code-error" role="alert" style={FIELD_ERROR}>{error}</p>}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="submit" disabled={busy} style={primaryButton(busy)}>
          {busy ? 'A ligar…' : 'Ligar negócio'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} style={SECONDARY_BUTTON}>
          Voltar
        </button>
      </div>
    </form>
  );
}
