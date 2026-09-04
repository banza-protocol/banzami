// Environment notice for the Developer portal.
//
// This banner used to say the Console was a demonstration and "not an
// operational console". That was written when there was no tested frontend
// path, and it is no longer true: the deployed Console is exercised end to end
// against the deployed Sandbox — real email OTP login, __Host- session cookie
// (httpOnly/Secure/SameSite), CSRF enforcement, workspace and project creation,
// the full API-key lifecycle (create / reveal-once / rotate / revoke) and
// cross-tenant isolation on every one of those. Leaving the old copy up would
// have been the mirror image of overclaiming: telling developers that working
// software does not work.
//
// What IS still true, and what this banner now says, is the thing a developer
// actually needs to know before they build: everything here is SANDBOX. The
// money is not real. That distinction has to stay visible without implying the
// platform is unfinished.
//
// Copy only — no behaviour. No session, OTP, CSRF or API-key material is
// touched here.

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
        border: '1px solid #BFD8F3',
        background: '#EFF6FF',
        color: '#1B4A7A',
        fontSize: 12.5,
        fontWeight: 700,
        lineHeight: 1.45,
      }}
    >
      <span aria-hidden="true">🧪</span>
      <span>
        Ambiente <strong>Sandbox</strong>. As chaves, os pagamentos e os webhooks aqui são
        reais e funcionais para integração e teste, mas <strong>nenhum dinheiro real é
        movimentado</strong>. Os trilhos financeiros Live são um ambiente separado e não são
        activados por nada nesta consola.
      </span>
    </div>
  );
}
