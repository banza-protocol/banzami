import type { ReactNode } from 'react';

const R = ({ children }: { children: ReactNode }) => (
  <span className="text-banzami">{children}</span>
);
const D = ({ children }: { children: ReactNode }) => (
  <span className="text-banzami-deep">{children}</span>
);
const S = ({ children }: { children: ReactNode }) => (
  <span className="text-code-green">{children}</span>
);
const C = ({ children }: { children: ReactNode }) => (
  <span className="text-ink-ghost">{children}</span>
);

// Illustrative SDK snippet (sandbox). Uses only the official @banzami/sdk and
// the BANZA wire-contract header — no internal endpoints, no secrets.
export function CodePanel({ withWebhook = false }: { withWebhook?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-border-soft bg-white shadow-[0_30px_70px_-34px_rgba(181,16,31,.35)]">
      <div className="flex items-center gap-2 border-b border-border-soft bg-pink-50 px-[18px] py-[14px]">
        <span className="h-[11px] w-[11px] rounded-full bg-banzami-coral" />
        <span className="h-[11px] w-[11px] rounded-full bg-pink-200" />
        <span className="h-[11px] w-[11px] rounded-full bg-[#e8d4d2]" />
        <span className="bz-mono ml-2 text-[12px] font-semibold text-ink-faint">
          pagamento.ts · sandbox
        </span>
      </div>
      <pre className="bz-mono m-0 overflow-x-auto p-[22px] text-[12.5px] leading-[1.7] text-[#3a2a2e]">
        <R>import</R> {'{ BanzamiClient }'} <R>from</R> <S>&quot;@banzami/sdk&quot;</S>;{'\n\n'}
        <R>const</R> banzami = <R>new</R> <D>BanzamiClient</D>({'{'}
        {'\n'}
        {'  '}env: <S>&quot;sandbox&quot;</S>,{'\n'}
        {'  '}apiKey: process.env.<D>BANZA_API_KEY</D>,{'\n'}
        {'}'});{'\n\n'}
        <C>// criar um pagamento (sandbox)</C>
        {'\n'}
        <R>const</R> pagamento = <R>await</R> banzami.payments.<D>create</D>({'\n'}
        {'  '}{'{ to: '}
        <S>&quot;@maria&quot;</S>, amount: <D>2500</D>, currency: <S>&quot;AOA&quot;</S>{' }'},{'\n'}
        {'  '}{'{ idempotencyKey: order.id }'}
        {'\n'});
        {withWebhook && (
          <>
            {'\n\n'}
            <C>// verificar a assinatura de um webhook</C>
            {'\n'}
            banzami.webhooks.<D>verify</D>(payload, headers[<S>&quot;banza-signature&quot;</S>]);
          </>
        )}
      </pre>
    </div>
  );
}
