/**
 * How a figure is written.
 *
 * Two ways, and which one to use is a question about the reader rather than
 * the number. A figure somebody is *reading* — a balance on their own page, a
 * row of history, a stake they are about to put down — is written out in full,
 * because money that has been rounded is money somebody has to go and check.
 * A figure somebody is *glancing at* — the pill in the navbar, the jackpot on
 * the sign — is written short, because at seven digits the exact number is not
 * what the glance is for and the layout pays for it.
 *
 * Where a figure is shortened, the full one goes somewhere reachable: a title
 * on the element, and the accessible name. Shortening is a courtesy to the
 * eye, never the only copy of the number.
 */

/** Every digit, grouped. What a figure is when the number itself matters. */
export function exact(n: number): string {
  return n.toLocaleString("en-US");
}

/** The suffixes, smallest first, each a thousand times the last. */
const SCALES = [
  { at: 1_000_000_000_000, suffix: "T" },
  { at: 1_000_000_000, suffix: "B" },
  { at: 1_000_000, suffix: "M" },
  { at: 1_000, suffix: "K" },
] as const;

/**
 * Short enough to glance at: 9,999 — 10.4K — 440K — 5.67M.
 *
 * Below ten thousand nothing is shortened, because four digits already fit and
 * "9.99K" is the same width as "9,990" while saying less.
 *
 * Three significant figures throughout, so the length barely moves however
 * large the number gets — which is the whole point when it is sitting in a
 * fixed-width pill next to somebody's face.
 */
export function compact(n: number): string {
  if (!Number.isFinite(n)) {
    return exact(0);
  }
  const sign = n < 0 ? "-" : "";
  const size = Math.abs(n);
  if (size < 10_000) {
    return exact(n);
  }

  for (const { at, suffix } of SCALES) {
    if (size < at) {
      continue;
    }
    const scaled = size / at;
    /*
     * Three significant figures: 5.67M, 54.2K, 440K. Rounding can carry a
     * number over its own scale — 999,999 rounds to 1000K, which is both wrong
     * and wider than the thing it replaced — so a carry moves it up a scale
     * instead.
     */
    const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
    const rounded = Number(scaled.toFixed(digits));
    if (rounded >= 1000) {
      return `${sign}1.00${nextUp(suffix)}`;
    }
    // toFixed keeps trailing zeros, which is what holds the width steady.
    return `${sign}${rounded.toFixed(digits)}${suffix}`;
  }

  return exact(n);
}

/** The scale above this one, for a number that rounded its way out of its own. */
function nextUp(suffix: string): string {
  const index = SCALES.findIndex((scale) => scale.suffix === suffix);
  // Index 0 is the largest there is; nothing rounds past it at any real balance.
  return SCALES[index - 1]?.suffix ?? suffix;
}
