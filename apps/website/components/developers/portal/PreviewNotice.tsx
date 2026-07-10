// Non-availability notice for the Developer portal.
//
// The Developer Platform API/SDK flows are validated in the internal Sandbox, but a
// visual Developer Console is planned separately and is NOT part of the tested scope
// (Developer Console UI E2E remains BLOCKED — no tested frontend path). These portal
// routes are a demonstration/preview only, so every portal + auth screen renders this
// banner to avoid implying an available Console. Copy only — no behaviour, no session,
// OTP, CSRF or API-key material is touched here.

export function PreviewNotice() {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        margin: '0 0 14px',
        padding: '9px 13px',
        borderRadius: 10,
        border: '1px solid #F3D07A',
        background: '#FFF8E6',
        color: '#7a5b12',
        fontSize: 12.5,
        fontWeight: 700,
        lineHeight: 1.45,
      }}
    >
      <span aria-hidden="true">🔧</span>
      <span>
        Pré-visualização (demonstração). Os fluxos de API/SDK da Developer Platform foram
        validados no Sandbox interno; um Developer Console visual é planeado em separado e
        ainda não está disponível. Estas páginas não são um console operacional.
      </span>
    </div>
  );
}
