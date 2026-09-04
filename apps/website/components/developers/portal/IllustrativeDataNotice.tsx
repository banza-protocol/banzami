// Marks a Console page whose contents are illustrative rather than live.
//
// The dashboard, webhooks and logs screens render hard-coded constants and make
// no API call at all. The rest of the Console is real — sign-in, workspaces,
// projects and the key lifecycle all operate on live data — and the docs say so.
// Without this notice, a developer reading a delivery history or a request log
// here would reasonably believe they were looking at their own traffic, and
// would debug against numbers that describe nothing.
//
// The docs claim "pages that show illustrative rather than live data are
// labelled as such on the page itself". This is that label; the claim is only
// true while it is present.
//
// Copy only — no behaviour, no data, no credentials.

export function IllustrativeDataNotice({ what }: { what: string }) {
  return (
    <div
      role="note"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        margin: '0 0 16px',
        padding: '10px 13px',
        borderRadius: 10,
        border: '1px solid #F3D07A',
        background: '#FFF8E6',
        color: '#7a5b12',
        fontSize: 12.5,
        fontWeight: 700,
        lineHeight: 1.45,
      }}
    >
      <span aria-hidden="true">📊</span>
      <span>
        <strong>Dados ilustrativos.</strong> {what} apresentados aqui são um exemplo
        de interface, não a sua actividade real. Para dados reais do seu projecto,
        use a API — esta página ainda não está ligada.
      </span>
    </div>
  );
}
