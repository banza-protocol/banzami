import { readSession } from '@/lib/session';
import { banzamiQrSvgDataUri } from '@/lib/banzami-qr';
import { handleQrPayload, isSandboxEnv } from '@/lib/qr-scheme';
import { CopyButton } from '@/components/CopyButton';
import { SandboxBadge } from '@/components/SandboxBadge';

export const dynamic = 'force-dynamic';

// Receive — the @banza and its canonical Banzami QR. The QR payload is
// byte-identical to the native app's (banzami-sandbox:@handle), so an iPhone or
// Android Banzami app scans this Web QR and resolves the same recipient.
export default async function Receber() {
  const s = (await readSession())!;
  const payload = handleQrPayload(s.handle, isSandboxEnv());
  const qr = banzamiQrSvgDataUri(payload, { size: 240 });
  const payUrl = `https://pay.banzami.com/u/${s.handle}`;
  return (
    <div className="px-5 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-black text-ink">Receber</h1>
        <SandboxBadge />
      </div>
      <p className="mt-1 text-[14px] font-medium text-ink-soft">Peça para digitalizar com a app Banzami, ou partilhe o seu @banza.</p>

      <div className="mt-5 flex flex-col items-center rounded-3xl bg-white p-6 shadow-[0_16px_40px_-28px_rgba(0,0,0,.4)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR do @${s.handle}`} width={240} height={240} className="rounded-xl" />
        <div className="mt-4 text-[22px] font-black text-cherry">@{s.handle}</div>
        {s.displayName && <div className="text-[13px] font-medium text-ink-muted">{s.displayName}</div>}
        <div className="mt-4 flex w-full gap-2">
          <CopyButton text={`@${s.handle}`} label="Copiar @banza" className="flex-1 rounded-xl border border-[#EBE3E3] bg-white py-2.5 text-[13.5px] font-bold text-cherry-dark" />
          <CopyButton text={payUrl} label="Copiar link" className="flex-1 rounded-xl border border-[#EBE3E3] bg-white py-2.5 text-[13.5px] font-bold text-cherry-dark" />
        </div>
      </div>
      <p className="mt-4 text-center text-[12px] font-medium text-ink-muted">Dinheiro fictício — ambiente de testes.</p>
    </div>
  );
}
