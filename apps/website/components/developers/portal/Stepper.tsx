import { IconCheck } from './icons';

// Onboarding stepper (Perfil → Organização → País → Projeto). Faithful to the
// dossier: active = red circle + number (with shadow); done = red circle + ✓;
// future = blush circle. A connector is red only when the node to its right is
// already completed.

export type StepState = 'done' | 'active' | 'future';
export type Step = { label: string; state: StepState };

function Node({ step, index }: { step: Step; index: number }) {
  const base = {
    width: 34,
    height: 34,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    fontSize: 14,
  } as const;

  let circle: React.ReactNode;
  if (step.state === 'done') {
    circle = (
      <span style={{ ...base, background: '#B5101F', color: '#fff' }}>
        <IconCheck size={16} strokeWidth={2.6} />
      </span>
    );
  } else if (step.state === 'active') {
    circle = (
      <span style={{ ...base, background: '#B5101F', color: '#fff', boxShadow: '0 8px 18px -7px rgba(181,16,31,.55)' }}>
        {index + 1}
      </span>
    );
  } else {
    circle = <span style={{ ...base, background: '#FBE6E4', color: '#C29597' }}>{index + 1}</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 74 }}>
      {circle}
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 800,
          color: step.state === 'future' ? '#b8a4a6' : '#B5101F',
        }}
      >
        {step.label}
      </span>
    </div>
  );
}

export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', maxWidth: 440, margin: '0 auto 22px' }}>
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: 'contents' }}>
          <Node step={s} index={i} />
          {i < steps.length - 1 ? (
            <div
              style={{
                flex: 1,
                height: 2,
                marginTop: 16,
                background: steps[i + 1].state === 'done' ? '#B5101F' : '#F0DAD8',
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
