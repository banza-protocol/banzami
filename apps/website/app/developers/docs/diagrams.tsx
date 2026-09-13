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

import { useId } from 'react';

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
  desc,
  viewBox,
  children,
}: {
  title: string;
  desc?: string;
  viewBox: string;
  children: React.ReactNode;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <figure style={{ margin: '4px 0 20px', maxWidth: 760 }}>
      <svg
        viewBox={viewBox}
        role="img"
        aria-labelledby={desc ? `${id}-t ${id}-d` : `${id}-t`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12, border: '1px solid #EAE3E3' }}
      >
        <title id={`${id}-t`}>{title}</title>
        {desc ? <desc id={`${id}-d`}>{desc}</desc> : null}
        {children}
      </svg>
    </figure>
  );
}

/** Font size that keeps a label inside a box of the given inner width. */
export function fitFont(label: string, innerWidth: number, max: number, min = 13) {
  const estimate = label.length * 0.56; // average glyph width for the system sans, in ems
  return Math.max(min, Math.min(max, Math.floor(innerWidth / estimate)));
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


// ── the concept model ────────────────────────────────────────────────────────

export type ConceptModelLabels = {
  title: string;
  desc?: string;
  person: string; workspace: string; project: string;
  financialSetup: string; business: string; wallet: string; accounts: string;
  apiKeys: string; webhooks: string;
  noteWorkspace: string; noteProject: string; noteBusiness: string;
  noteKeys: string; noteWebhooks: string;
};

export function ConceptModelDiagram({ l }: { l: ConceptModelLabels }) {
  return (
    <Frame title={l.title} desc={l.desc} viewBox="0 0 900 430">
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
  title: string; desc?: string; project: string; owner: string; ownerNote: string;
  accounts: string[]; accountNote: string;
};

export function SegregatedAccountsDiagram({ l }: { l: SegregatedLabels }) {
  const top = 130;
  return (
    <Frame title={l.title} desc={l.desc} viewBox="0 0 900 300">
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

// ── a numbered path, legible on a phone ──────────────────────────────────────

/**
 * A short ordered path (the first payment, a Payment Session's life) in rows of
 * three. Wide boxes and large type: the viewBox is 900 wide and a 390px screen
 * shows it at under half size, so a 15px label would read as 6px.
 */
export function PathDiagram({ title, desc, steps, highlight = -1 }: { title: string; desc?: string; steps: string[]; highlight?: number }) {
  const W = 250;
  const H = 66;
  const GAPX = 50;
  const GAPY = 44;
  const perRow = 3;
  const rows = Math.ceil(steps.length / perRow);
  const height = 28 + rows * H + (rows - 1) * GAPY + 28;
  const pos = (i: number) => {
    const row = Math.floor(i / perRow);
    // Boustrophedon: the second row runs right to left, so every arrow is short.
    const col = row % 2 === 0 ? i % perRow : perRow - 1 - (i % perRow);
    return { x: 25 + col * (W + GAPX), y: 28 + row * (H + GAPY) };
  };
  return (
    <Frame title={title} desc={desc} viewBox={`0 0 900 ${height}`}>
      <defs>
        <marker id="bz-path-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={RED} />
        </marker>
      </defs>
      <rect width="900" height={height} fill={GROUND} rx={14} />
      {steps.map((s, i) => {
        const { x, y } = pos(i);
        const next = i < steps.length - 1 ? pos(i + 1) : null;
        const strong = i === highlight;
        return (
          <g key={s}>
            <rect x={x} y={y} width={W} height={H} rx={12} fill={strong ? RED : '#FFFFFF'} stroke={strong ? RED_DEEP : BLUSH} strokeWidth={2} />
            <circle cx={x + 30} cy={y + H / 2} r={15} fill={strong ? '#FFFFFF' : BLUSH} />
            <text x={x + 30} y={y + H / 2 + 6} textAnchor="middle" fontFamily={SANS} fontSize={16} fontWeight={700} fill={RED_DEEP}>{i + 1}</text>
            <text x={x + 56} y={y + H / 2 + 7} fontFamily={SANS} fontSize={fitFont(s, W - 70, 20)} fontWeight={700} fill={strong ? '#FFFFFF' : INK}>{s}</text>
            {next && next.y === y ? (
              next.x > x
                ? <line x1={x + W + 4} y1={y + H / 2} x2={next.x - 4} y2={y + H / 2} stroke={RED} strokeWidth={2.4} markerEnd="url(#bz-path-arrow)" />
                : <line x1={x - 4} y1={y + H / 2} x2={next.x + W + 4} y2={y + H / 2} stroke={RED} strokeWidth={2.4} markerEnd="url(#bz-path-arrow)" />
            ) : null}
            {next && next.y !== y ? (
              <line x1={x + W / 2} y1={y + H + 4} x2={x + W / 2} y2={next.y - 4} stroke={RED} strokeWidth={2.4} markerEnd="url(#bz-path-arrow)" />
            ) : null}
          </g>
        );
      })}
    </Frame>
  );
}

// ── financial setup: two ways in, one way out ────────────────────────────────

export type FinancialSetupLabels = {
  title: string;
  desc?: string;
  project: string;
  newBusiness: string; newNote: string;
  existing: string; existingNote: string;
  ready: string; readyNote: string;
};

export function FinancialSetupDiagram({ l }: { l: FinancialSetupLabels }) {
  return (
    <Frame title={l.title} desc={l.desc} viewBox="0 0 900 400">
      <defs>
        <marker id="bz-fs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={RED} />
        </marker>
      </defs>
      <rect width="900" height="400" fill={GROUND} rx={14} />
      <rect x={300} y={24} width={300} height={62} rx={12} fill={RED} stroke={RED_DEEP} strokeWidth={2} />
      <text x={450} y={63} textAnchor="middle" fontFamily={SANS} fontSize={22} fontWeight={700} fill="#FFFFFF">{l.project}</text>

      <path d="M450 86 V112 H225 V140" fill="none" stroke={RED} strokeWidth={2.4} markerEnd="url(#bz-fs-arrow)" />
      <path d="M450 112 H675 V140" fill="none" stroke={RED} strokeWidth={2.4} markerEnd="url(#bz-fs-arrow)" />

      {[{ x: 40, label: l.newBusiness, note: l.newNote }, { x: 490, label: l.existing, note: l.existingNote }].map((b) => (
        <g key={b.label}>
          <rect x={b.x} y={144} width={370} height={96} rx={12} fill="#FFFFFF" stroke={BLUSH} strokeWidth={2} />
          <text x={b.x + 185} y={183} textAnchor="middle" fontFamily={SANS} fontSize={21} fontWeight={700} fill={INK}>{b.label}</text>
          <text x={b.x + 185} y={214} textAnchor="middle" fontFamily={SANS} fontSize={17} fontWeight={600} fill={INK_SOFT}>{b.note}</text>
        </g>
      ))}

      <path d="M225 240 V268 H450 V296" fill="none" stroke={RED} strokeWidth={2.4} markerEnd="url(#bz-fs-arrow)" />
      <path d="M675 240 V268 H450" fill="none" stroke={RED} strokeWidth={2.4} />

      <rect x={240} y={300} width={420} height={76} rx={12} fill={BLUSH} stroke={RED_SOFT} strokeWidth={2} />
      <text x={450} y={333} textAnchor="middle" fontFamily={SANS} fontSize={22} fontWeight={700} fill={RED_DEEP}>{l.ready}</text>
      <text x={450} y={360} textAnchor="middle" fontFamily={SANS} fontSize={17} fontWeight={600} fill={INK}>{l.readyNote}</text>
    </Frame>
  );
}

// ── who does what: your application and Banzami, side by side ────────────────

export type ResponsibilityStep = { side: 'app' | 'banzami'; text: string };

/**
 * Two lanes, one sequence. Each step sits in the lane of whoever does it, so the
 * boundary a tutorial keeps describing in prose is something the eye can follow:
 * the application never crosses into the money lane.
 */
export function ResponsibilityDiagram({ title, desc, appLabel, banzamiLabel, steps }: { title: string; desc?: string; appLabel: string; banzamiLabel: string; steps: ResponsibilityStep[] }) {
  const top = 86;
  const H = 54;
  const GAP = 22;
  const height = top + steps.length * (H + GAP) + 10;
  const laneX = { app: 30, banzami: 470 } as const;
  const W = 400;
  return (
    <Frame title={title} desc={desc} viewBox={`0 0 900 ${height}`}>
      <defs>
        <marker id="bz-resp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={RED} />
        </marker>
      </defs>
      <rect width="900" height={height} fill={GROUND} rx={14} />
      <rect x={20} y={16} width={420} height={height - 26} rx={12} fill="#FFFFFF" opacity={0.6} />
      <rect x={460} y={16} width={420} height={height - 26} rx={12} fill={BLUSH} opacity={0.35} />
      <text x={230} y={56} textAnchor="middle" fontFamily={SANS} fontSize={22} fontWeight={700} fill={INK}>{appLabel}</text>
      <text x={670} y={56} textAnchor="middle" fontFamily={SANS} fontSize={22} fontWeight={700} fill={RED_DEEP}>{banzamiLabel}</text>
      {steps.map((s, i) => {
        const y = top + i * (H + GAP);
        const x = laneX[s.side];
        const next = steps[i + 1];
        const strong = s.side === 'banzami';
        return (
          <g key={s.text}>
            <rect x={x} y={y} width={W} height={H} rx={10} fill={strong ? RED : '#FFFFFF'} stroke={strong ? RED_DEEP : BLUSH} strokeWidth={2} />
            <text x={x + W / 2} y={y + H / 2 + 7} textAnchor="middle" fontFamily={SANS} fontSize={fitFont(s.text, W - 24, 19)} fontWeight={700} fill={strong ? '#FFFFFF' : INK}>{s.text}</text>
            {next ? (
              next.side === s.side
                ? <line x1={x + W / 2} y1={y + H + 3} x2={x + W / 2} y2={y + H + GAP - 3} stroke={RED} strokeWidth={2.2} markerEnd="url(#bz-resp-arrow)" />
                : <path d={`M ${x + W / 2} ${y + H + 3} V ${y + H + GAP / 2} H ${laneX[next.side] + W / 2} V ${y + H + GAP - 3}`} fill="none" stroke={RED} strokeWidth={2.2} markerEnd="url(#bz-resp-arrow)" />
            ) : null}
          </g>
        );
      })}
    </Frame>
  );
}

// ── one settlement, three amounts ────────────────────────────────────────────

export type SettlementSplitLabels = {
  title: string;
  desc?: string;
  source: string; gross: string;
  beneficiary: string; net: string;
  fee: string; feeAmount: string;
  sum: string;
};

export function SettlementSplitDiagram({ l }: { l: SettlementSplitLabels }) {
  return (
    <Frame title={l.title} desc={l.desc} viewBox="0 0 900 340">
      <defs>
        <marker id="bz-split-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={RED} />
        </marker>
      </defs>
      <rect width="900" height="340" fill={GROUND} rx={14} />
      <rect x={40} y={100} width={300} height={100} rx={12} fill={RED} stroke={RED_DEEP} strokeWidth={2} />
      <text x={190} y={140} textAnchor="middle" fontFamily={SANS} fontSize={20} fontWeight={700} fill="#FFFFFF">{l.source}</text>
      <text x={190} y={176} textAnchor="middle" fontFamily={MONO} fontSize={24} fontWeight={700} fill="#FFFFFF">{l.gross}</text>

      <path d="M340 150 H420 V78 H500" fill="none" stroke={RED} strokeWidth={2.4} markerEnd="url(#bz-split-arrow)" />
      <path d="M420 150 V222 H500" fill="none" stroke={RED} strokeWidth={2.4} markerEnd="url(#bz-split-arrow)" />

      <rect x={504} y={30} width={356} height={96} rx={12} fill="#FFFFFF" stroke={BLUSH} strokeWidth={2} />
      <text x={682} y={68} textAnchor="middle" fontFamily={SANS} fontSize={20} fontWeight={700} fill={INK}>{l.beneficiary}</text>
      <text x={682} y={104} textAnchor="middle" fontFamily={MONO} fontSize={24} fontWeight={700} fill={INK}>{l.net}</text>

      <rect x={504} y={176} width={356} height={96} rx={12} fill={BLUSH} stroke={RED_SOFT} strokeWidth={2} />
      <text x={682} y={214} textAnchor="middle" fontFamily={SANS} fontSize={20} fontWeight={700} fill={RED_DEEP}>{l.fee}</text>
      <text x={682} y={250} textAnchor="middle" fontFamily={MONO} fontSize={24} fontWeight={700} fill={RED_DEEP}>{l.feeAmount}</text>

      <text x={450} y={318} textAnchor="middle" fontFamily={MONO} fontSize={21} fontWeight={700} fill={INK}>{l.sum}</text>
    </Frame>
  );
}
