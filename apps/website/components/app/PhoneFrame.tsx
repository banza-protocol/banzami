import type { ReactNode } from 'react';

// Device bezel for the Banzami phone subsystem.
// Dimensions per dossier: 300×620 outer device, 40px inner screen radius.
// Purely presentational — no hooks. Screen content fills it via absolute inset-0.
export function PhoneFrame({
  children,
  float,
  className = '',
}: {
  children: ReactNode;
  float?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative ${float ? 'anim-floaty' : ''} ${className}`}
      style={{
        width: 300,
        height: 620,
        borderRadius: 48,
        background: '#160a0c',
        padding: 9,
        boxShadow:
          '0 40px 80px -30px rgba(122,16,22,.45),0 0 0 1px rgba(122,16,22,.08)',
      }}
    >
      {/* notch */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          top: 18,
          width: 98,
          height: 27,
          borderRadius: 15,
          background: '#160a0c',
          zIndex: 40,
        }}
      />
      {/* screen surface */}
      <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: 40 }}>
        {children}
      </div>
    </div>
  );
}
