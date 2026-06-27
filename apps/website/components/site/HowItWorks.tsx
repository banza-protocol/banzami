import { Reveal } from '@/components/Reveal';
import { ScaledPhone } from '@/components/app/ScaledPhone';
import { type FrameName } from '@/components/app/AppScreen';

/* ---------- Como funciona steps ---------- */
const STEPS: {
  n: string;
  title: string;
  desc: string;
  chips: string[];
  frame: FrameName;
  valor?: string;
  para?: string;
  nota?: string;
}[] = [
  {
    n: '1',
    title: 'Scan',
    desc: 'Leia qualquer QR Banzami ou escolha diretamente um @banza.',
    chips: ['QR instantâneo', '@banza', 'Sem IBAN'],
    frame: 'scan',
  },
  {
    n: '2',
    title: 'Confirmar',
    desc: 'Valide a transação com PIN ou biometria antes do movimento do dinheiro.',
    chips: ['Face ID', 'PIN seguro', 'Controlo total'],
    frame: 'confpag',
  },
  {
    n: '3',
    title: 'Pago',
    desc: 'O valor é creditado em segundos e o comprovativo fica disponível imediatamente.',
    chips: ['Instantâneo', 'Comprovativo digital', 'Histórico'],
    frame: 'comprovativo',
    valor: '1 500',
    para: '@cantina-alex',
    nota: '1 Kg de Arroz',
  },
];

/**
 * "Como funciona" — the three-step scan → confirmar → pago section. Reused
 * section (moved from the Produto page) shown on the homepage right after the
 * metrics block.
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
          <p className="m-0 mb-3 text-[14px] font-black text-cherry">COMO FUNCIONA</p>
          <h2 className="m-0 text-[clamp(28px,4.2vw,48px)] font-black leading-[1.04] tracking-[-0.025em]">
            Um pagamento em menos de 10 segundos.
          </h2>
          <p className="m-0 mt-[18px] text-[17px] font-semibold leading-[1.55] text-ink-secondary">
            Uma experiência desenhada para desaparecer. Sem IBANs, sem terminais complexos, sem
            esperas — apenas três gestos naturais.
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
                <p className="m-0 mt-[10px] text-center text-[14px] font-semibold leading-[1.5] text-ink-secondary">
                  {s.desc}
                </p>
                <div className="mt-[13px] flex flex-wrap justify-center gap-[7px]">
                  {s.chips.map((c) => (
                    <span
                      key={c}
                      className="rounded-pill bg-cream-100 px-[10px] py-[5px] text-[11px] font-extrabold text-cherry-dark"
                    >
                      {c}
                    </span>
                  ))}
                </div>
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

        <div className="mt-[50px] flex flex-wrap items-center justify-center gap-[18px]">
          <span className="h-px w-[54px]" style={{ background: '#E8C8C6' }} />
          <p className="m-0 max-w-[520px] text-center text-[13px] font-semibold leading-[1.55] text-ink-muted">
            O dinheiro move-se entre carteiras Banzami, com registo seguro em ledger de dupla
            entrada.
          </p>
          <span className="h-px w-[54px]" style={{ background: '#E8C8C6' }} />
        </div>
      </div>
    </section>
  );
}
