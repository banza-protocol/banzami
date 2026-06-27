import { PhoneFrame } from '@/components/app/PhoneFrame';
import { AppScreen, type FrameName } from '@/components/app/AppScreen';

/* ============================================================
   Scaled phone — renders the 300×620 PhoneFrame at a target
   width, keeping a clipped rounded device. Mirrors the
   dc-import scale wrappers in Produto.dc.html.
   ============================================================ */
export function ScaledPhone({
  frame,
  width,
  valor,
  para,
  nota,
}: {
  frame: FrameName;
  width: number;
  valor?: string;
  para?: string;
  nota?: string;
}) {
  const scale = width / 300;
  const height = 620 * scale;
  return (
    <div style={{ width, height, overflow: 'hidden' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 300, height: 620 }}>
        <PhoneFrame>
          <AppScreen frame={frame} valor={valor} para={para} nota={nota} />
        </PhoneFrame>
      </div>
    </div>
  );
}
