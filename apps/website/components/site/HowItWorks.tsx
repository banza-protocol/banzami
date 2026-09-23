import { Reveal } from '@/components/Reveal';
import { ScaledPhone } from '@/components/app/ScaledPhone';
import { type FrameName } from '@/components/app/AppScreen';

/* ---------- Como funciona steps ---------- */
const STEPS: {
  n: string;
  title: string;
  desc: string;
  frame: FrameName;
  valor?: string;
  para?: string;
  nota?: string;
}[] = [
  {
    n: '1',
    title: 'Ler',
    desc: 'Leia um QR ou escolha um @banza.',
    frame: 'scan',
  },
  {
    n: '2',
    title: 'Confirmar',
    desc: 'Veja o valor e o destinatário antes de autorizar.',
    frame: 'confpag',
  },
  {
    n: '3',
    title: 'Pago',
    desc: 'O movimento fica registado e o comprovativo disponível.',
    frame: 'comprovativo',
    valor: '1 500',
    para: '@cantina-alex',
    nota: '1 Kg de Arroz',
  },
];

/**
 * "Como funciona" — Ler → Confirmar → Pago. Three steps, real App Banzami
 * screens, no technical detail (the ledger/architecture lives in Segurança and
 * Developers, not on the homepage).
 */
export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="px-6 py-[clamp(64px,9vw,104px)]"
      style={{ background: 'linear-gradient(180deg,rgba(181,16,31,.03),rgba(181,16,31,.01))' }}
    >
      <div className="mx-auto max-w-container">
        <Reveal className="mx-auto mb-[52px] max-w-[640px] text-center">
          <p className="m-0 mb-3 text-[13px] font-black tracking-[0.14em] text-cherry">COMO FUNCIONA</p>
          <h2 className="m-0 text-[clamp(28px,4.2vw,48px)] font-black leading-[1.04] tracking-[-0.025em]">
            Ler. Confirmar. Pago.
          </h2>
          <p className="m-0 mt-[18px] text-[17px] font-semibold leading-[1.55] text-ink-secondary">
            Do QR ou de um @banza ao comprovativo, em três passos.
          </p>
        </Reveal>

        <Reveal className="bz-howrow flex flex-col items-center justify-center gap-[18px] md:flex-row md:items-start">
          {STEPS.map((s, i) => (
            <div key={s.n} className="contents">
              <div className="flex w-[250px] flex-none flex-col items-center">
                <ScaledPhone frame={s.frame} width={250} valor={s.valor} para={s.para} nota={s.nota} />
                <div className="mt-5 flex items-center gap-[10px]">
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-cherry text-[15px] font-black text-white">
                    {s.n}
                  </span>
                  <span className="text-[21px] font-black text-ink">{s.title}</span>
                </div>
                <p className="m-0 mt-[10px] max-w-[240px] text-center text-[14.5px] font-semibold leading-[1.5] text-ink-secondary">
                  {s.desc}
                </p>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className="bz-conn relative hidden h-[3px] min-w-[50px] flex-1 self-start md:block"
                  style={{
                    marginTop: 235,
                    borderRadius: 3,
                    background: 'linear-gradient(90deg,#FBD2D0,#E8434B,#FBD2D0)',
                  }}
                >
                  <span
                    className="anim-coin absolute"
                    style={{
                      top: '50%',
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: '#B5101F',
                      boxShadow: '0 0 10px 2px rgba(232,67,75,.5)',
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </Reveal>

      </div>
    </section>
  );
}
