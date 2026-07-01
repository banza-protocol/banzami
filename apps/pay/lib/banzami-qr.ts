import QRCode from 'qrcode';

/**
 * Canonical Banzami QR renderer (TypeScript mirror of the Go engine in
 * services/common/documents/qrengine.go). ONE spec across the ecosystem — see
 * docs/architecture/qr-engine.md in the operator repo:
 *
 *   • Error correction: H (a centre logo occludes the matrix; never L/M)
 *   • Quiet zone: 4 modules
 *   • Data modules: #111111 · Finder eyes: Hero Red #B5101F · Background: #FFFFFF
 *   • Centre logo: the official Banzami mark on a white padded box (~0.22 side)
 *   • Output: SVG string (official format — infinite scale, perfect print/web)
 *
 * NOTE: this file is intentionally duplicated verbatim across the web surfaces
 * (Doa, apps/checkout, apps/pay) because those builds are isolated (no shared
 * package). Keep them byte-identical; the spec doc is the single source of truth.
 */

export const QR_COLOR_DATA = '#111111';
export const QR_COLOR_FINDER = '#B5101F';
export const QR_COLOR_BG = '#FFFFFF';
export const QR_QUIET_ZONE = 4;
const QR_LOGO_BOX_FRACTION = 0.22;

/** Canonical pixel-size presets. Apps pick one; SVG scales losslessly. */
export const QR_SIZE = { SM: 96, MD: 160, LG: 256, XL: 512, PRINT: 1024 } as const;

export interface BanzamiQrOptions {
  size?: number;      // rendered width/height in px (default LG=256)
  showLogo?: boolean; // centre Banzami mark (default true)
}

/** Render `payload` as the canonical branded Banzami QR (SVG string). */
export function banzamiQrSvg(payload: string, opts: BanzamiQrOptions = {}): string {
  const size = opts.size ?? QR_SIZE.LG;
  const showLogo = opts.showLogo ?? true;

  const qr = QRCode.create(payload, { errorCorrectionLevel: 'H' });
  const sym = qr.modules.size;
  const bits = qr.modules.data; // row-major, 1 = dark
  const total = sym + 2 * QR_QUIET_ZONE;

  const isFinder = (sx: number, sy: number): boolean =>
    (sx < 7 && sy < 7) || (sx >= sym - 7 && sy < 7) || (sx < 7 && sy >= sym - 7);

  let data = '';
  let finder = '';
  for (let sy = 0; sy < sym; sy++) {
    for (let sx = 0; sx < sym; sx++) {
      if (!bits[sy * sym + sx]) continue;
      const rect = `<rect x="${sx + QR_QUIET_ZONE}" y="${sy + QR_QUIET_ZONE}" width="1" height="1"/>`;
      if (isFinder(sx, sy)) finder += rect;
      else data += rect;
    }
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="Banzami QR">`;
  svg += `<rect width="${total}" height="${total}" fill="${QR_COLOR_BG}"/>`;
  svg += `<g fill="${QR_COLOR_DATA}">${data}</g>`;
  svg += `<g fill="${QR_COLOR_FINDER}">${finder}</g>`;
  if (showLogo) svg += logoGroup(sym, total);
  svg += `</svg>`;
  return svg;
}

/** Data-URI form for <img src> / PNG-less contexts. */
export function banzamiQrSvgDataUri(payload: string, opts?: BanzamiQrOptions): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(banzamiQrSvg(payload, opts))}`;
}

function logoGroup(sym: number, total: number): string {
  const box = sym * QR_LOGO_BOX_FRACTION;
  const c = total / 2;
  const x = c - box / 2;
  const y = c - box / 2;
  const rx = box * 0.2;
  const pad = box * 0.16;
  const scale = (box - 2 * pad) / 100;
  return (
    `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${box.toFixed(3)}" height="${box.toFixed(3)}" rx="${rx.toFixed(3)}" fill="${QR_COLOR_BG}" stroke="#F2E7E7" stroke-width="${(box * 0.02).toFixed(3)}"/>` +
    `<g transform="translate(${(x + pad).toFixed(3)},${(y + pad).toFixed(3)}) scale(${scale.toFixed(4)})" fill="${QR_COLOR_FINDER}">` +
    `<rect x="6" y="6" width="42" height="42" rx="13"/>` +
    `<rect x="56" y="10" width="32" height="32" rx="10"/>` +
    `<rect x="10" y="56" width="38" height="38" rx="11"/>` +
    `<rect x="58" y="60" width="28" height="28" rx="9"/>` +
    `</g>`
  );
}
