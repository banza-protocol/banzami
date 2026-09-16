/**
 * Money parsing for the consumer UI. Banzami's canonical display format is
 * "10 000 Kz" — space-grouped thousands, unit last, no cents (see the money
 * format standard). These helpers read a displayed amount back to an integer
 * number of Kwanza (major units) for economic assertions.
 */

/** Extract the first "N NNN Kz" amount from accessible text -> integer AOA (major). */
export function parseKz(text) {
  if (!text) return null;
  // Match a run of digits and spaces followed by Kz (non-breaking or normal space).
  const m = String(text).replace(/ /g, ' ').match(/(\d[\d\s.]*)\s*Kz/);
  if (!m) return null;
  const digits = m[1].replace(/[\s.]/g, '');
  if (!digits) return null;
  return Number(digits);
}

/** All "N NNN Kz" amounts found in a blob of accessible text, in order. */
export function parseAllKz(text) {
  const out = [];
  const re = /(\d[\d\s.]*)\s*Kz/g;
  const norm = String(text || '').replace(/ /g, ' ');
  let m;
  while ((m = re.exec(norm))) {
    const digits = m[1].replace(/[\s.]/g, '');
    if (digits) out.push(Number(digits));
  }
  return out;
}
