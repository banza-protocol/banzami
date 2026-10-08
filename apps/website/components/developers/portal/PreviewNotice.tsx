// Environment notice for the Developer portal auth surfaces (login / OTP /
// onboarding). Compact and visually secondary to the access card: it states the
// one thing a developer needs to know before they build — everything here is
// SANDBOX and the money is not real. The deeper detail (keys/payments/webhooks
// are real and functional) lives in the Sandbox documentation, not on the access
// surface. No emoji. Copy only — no behaviour: no session, OTP, CSRF or API-key
// material is touched here.

export function PreviewNotice() {
  return (
    <div
      role="status"
      style={{
        margin: '0 0 16px',
        padding: '10px 14px',
        borderRadius: 10,
        border: '1px solid #DCE8F5',
        background: '#F4F8FD',
        color: '#30506E',
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '.04em', textTransform: 'uppercase', color: '#2C4A68' }}>
        Sandbox
      </div>
      <p style={{ margin: '3px 0 0', fontSize: 12.5, fontWeight: 600, lineHeight: 1.5 }}>
        Ambiente de integração e testes com dinheiro fictício. As operações com dinheiro real estão indisponíveis.
      </p>
    </div>
  );
}
