'use client';

/**
 * The documentation's illustrations, as SVG.
 *
 * They were ASCII art inside code blocks — box-drawing characters in a
 * monospaced terminal frame, with a Copiar button offering to put a picture on
 * your clipboard. Three things were wrong with that. It is not an illustration,
 * it is a drawing pretending to be code; it breaks the moment the reader's font
 * or width changes, which on a phone is always; and a screen reader announces it
 * as a wall of pipes and dashes.
 *
 * README.md sets the standard for this operator: architecture illustrations are
 * SVG (docs/diagrams/*.svg), not terminal art. These follow the same palette and
 * the same shape language so the documentation and the repository look like one
 * product.
 *
 * Labels are props. The geometry is shared between Portuguese and English, so a
 * diagram cannot drift between the two languages — the thing PT/EN parity keeps
 * having to check elsewhere is structurally impossible here.
 *
 * Each one is `role="img"` with a real <title>, scales with its container, and
 * carries no text so small it disappears at 390px.
 */

const RED = '#B5101F';
const RED_DEEP = '#9A1B22';
const RED_SOFT = '#E8434B';
const BLUSH = '#FBD2D0';
const GROUND = '#FFF7F6';
const INK = '#2a2024';
const INK_SOFT = '#8a7a7e';
const MONO = "ui-monospace,'JetBrains Mono','Courier New',monospace";
const SANS = 'system-ui,-apple-system,sans-serif';

function Frame({
  title,
  viewBox,
  children,
}: {
  title: string;
  viewBox: string;
  children: React.ReactNode;
}) {
  return (
    <figure style={{ margin: '0 0 18px' }}>
      <svg
        viewBox={viewBox}
        role="img"
        aria-label={title}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 14, border: '1px solid #F2E2E0' }}
      >
        <title>{title}</title>
        {children}
      </svg>
    </figure>
  );
}

/** A rounded node with a label and an optional caption to its right. */
function Node({
  x, y, w, h, label, tone = 'plain', mono = false,
}: { x: number; y: number; w: number; h: number; label: string; tone?: 'plain' | 'strong' | 'soft'; mono?: boolean }) {
  const fill = tone === 'strong' ? RED : tone === 'soft' ? BLUSH : '#FFFFFF';
  const stroke = tone === 'strong' ? RED_DEEP : BLUSH;
  const text = tone === 'strong' ? '#FFFFFF' : INK;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text
        x={x + w / 2}
        y={y + h / 2 + 5}
        textAnchor="middle"
        fontFamily={mono ? MONO : SANS}
        fontSize={15}
        fontWeight={700}
        fill={text}
      >
        {label}
      </text>
    </g>
  );
}

/** The caption that says what a node is FOR — the "← quem tem acesso a quê" column. */
function Note({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text x={x} y={y} fontFamily={SANS} fontSize={13.5} fontWeight={600} fill={INK_SOFT}>
      {children}
    </text>
  );
}

/** An elbow from the bottom-left of a parent down and across to a child. */
function Elbow({ x, y1, y2, x2 }: { x: number; y1: number; y2: number; x2: number }) {
  return (
    <path
      d={`M${x} ${y1} V${y2 - 10} Q${x} ${y2} ${x + 10} ${y2} H${x2}`}
      fill="none"
      stroke={RED_SOFT}
      strokeWidth={1.8}
      strokeLinecap="round"
    />
  );
}

function ArrowDown({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  return (
    <g>
      <path d={`M${x} ${y1} V${y2 - 7}`} fill="none" stroke={RED_SOFT} strokeWidth={1.8} strokeLinecap="round" />
      <path d={`M${x - 4.5} ${y2 - 9} L${x} ${y2 - 2} L${x + 4.5} ${y2 - 9}`} fill="none" stroke={RED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

// ── the concept model ────────────────────────────────────────────────────────

export type ConceptModelLabels = {
  title: string;
  person: string; workspace: string; project: string;
  financialSetup: string; business: string; wallet: string; accounts: string;
  apiKeys: string; webhooks: string;
  noteWorkspace: string; noteProject: string; noteBusiness: string;
  noteKeys: string; noteWebhooks: string;
};

export function ConceptModelDiagram({ l }: { l: ConceptModelLabels }) {
  return (
    <Frame title={l.title} viewBox="0 0 900 430">
      <rect width="900" height="430" fill={GROUND} rx={14} />

      <Node x={40} y={26} w={230} h={46} label={l.person} />
      <Elbow x={60} y1={72} y2={112} x2={120} />
      <Node x={120} y={90} w={200} h={46} label={l.workspace} tone="strong" />
      <Note x={340} y={120}>{l.noteWorkspace}</Note>

      <Elbow x={140} y1={136} y2={176} x2={200} />
      <Node x={200} y={154} w={190} h={46} label={l.project} tone="strong" />
      <Note x={410} y={184}>{l.noteProject}</Note>

      {/* three things a project holds */}
      <Elbow x={220} y1={200} y2={244} x2={280} />
      <Node x={280} y={222} w={250} h={44} label={l.financialSetup} tone="soft" />
      <path d={`M530 244 H568`} stroke={RED_SOFT} strokeWidth={1.8} strokeLinecap="round" />
      <path d={`M562 239 L570 244 L562 249`} fill="none" stroke={RED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Node x={572} y={222} w={150} h={44} label={l.business} />
      <Note x={738} y={248}>{l.noteBusiness}</Note>

      <Elbow x={600} y1={266} y2={302} x2={640} />
      <Node x={640} y={282} w={120} h={38} label={l.wallet} mono />
      <path d={`M760 301 H790`} stroke={RED_SOFT} strokeWidth={1.8} strokeLinecap="round" />
      <path d={`M784 296 L792 301 L784 306`} fill="none" stroke={RED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Node x={794} y={282} w={86} h={38} label={l.accounts} mono />

      <Elbow x={220} y1={266} y2={346} x2={280} />
      <Node x={280} y={324} w={250} h={44} label={l.apiKeys} />
      <Note x={548} y={350}>{l.noteKeys}</Note>

      <Elbow x={220} y1={368} y2={404} x2={280} />
      <Node x={280} y={382} w={250} h={44} label={l.webhooks} />
      <Note x={548} y={408}>{l.noteWebhooks}</Note>
    </Frame>
  );
}

// ── segregated accounts under one financial owner ────────────────────────────

export type SegregatedLabels = {
  title: string; project: string; owner: string; ownerNote: string;
  accounts: string[]; accountNote: string;
};

export function SegregatedAccountsDiagram({ l }: { l: SegregatedLabels }) {
  const top = 130;
  return (
    <Frame title={l.title} viewBox="0 0 900 300">
      <rect width="900" height="300" fill={GROUND} rx={14} />

      <Node x={40} y={26} w={260} h={46} label={l.project} tone="strong" />
      <Elbow x={60} y1={72} y2={100} x2={110} />
      <Node x={110} y={78} w={330} h={44} label={l.owner} tone="soft" />
      <Note x={456} y={105}>{l.ownerNote}</Note>

      {l.accounts.map((a, i) => (
        <g key={a}>
          <Elbow x={130} y1={122} y2={top + i * 56 + 22} x2={190} />
          <Node x={190} y={top + i * 56} w={260} h={44} label={a} />
        </g>
      ))}
      <Note x={466} y={top + 28}>{l.accountNote}</Note>
    </Frame>
  );
}

// ── the DOA donor journey ────────────────────────────────────────────────────

export type FlowStep = { actor: string; what: string; how?: string };

export function DonationFlowDiagram({ title, steps }: { title: string; steps: FlowStep[] }) {
  const H = 44;
  const GAP = 26;
  const height = steps.length * (H + GAP) + 24;
  return (
    <Frame title={title} viewBox={`0 0 900 ${height}`}>
      <rect width="900" height={height} fill={GROUND} rx={14} />
      {steps.map((s, i) => {
        const y = 20 + i * (H + GAP);
        return (
          <g key={s.actor + s.what}>
            <rect x={36} y={y} width={170} height={H} rx={10} fill={i % 2 === 0 ? RED : '#FFFFFF'} stroke={i % 2 === 0 ? RED_DEEP : BLUSH} strokeWidth={1.5} />
            <text x={121} y={y + H / 2 + 5} textAnchor="middle" fontFamily={SANS} fontSize={14.5} fontWeight={800} fill={i % 2 === 0 ? '#FFFFFF' : INK}>
              {s.actor}
            </text>
            <text x={228} y={y + (s.how ? H / 2 - 2 : H / 2 + 5)} fontFamily={SANS} fontSize={14} fontWeight={600} fill={INK}>
              {s.what}
            </text>
            {s.how ? (
              <text x={228} y={y + H / 2 + 16} fontFamily={MONO} fontSize={12.5} fontWeight={600} fill={INK_SOFT}>
                {s.how}
              </text>
            ) : null}
            {i < steps.length - 1 ? <ArrowDown x={121} y1={y + H} y2={y + H + GAP} /> : null}
          </g>
        );
      })}
    </Frame>
  );
}
