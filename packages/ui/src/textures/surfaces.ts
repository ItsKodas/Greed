import { color } from "../tokens.js";
import { turbulence } from "./svg.js";

export interface SurfaceOptions {
  /** Integer seed. The same seed always yields the same surface. */
  seed?: number;
  /** Base colour. Defaults to the palette entry for this surface. */
  tint?: string;
  /** Lighter colour the gradient runs from. */
  highlight?: string;
}

/*
 * The materials the room is actually made of.
 *
 * Wood, leather and brass went with the tavern. What is left is a plastered
 * wall, the felt on a table, and the card stock a rule is printed on — and
 * glass, which is new, because there is a sign now.
 */
export const SURFACES = ["plaster", "felt", "glass", "card"] as const;

export type SurfaceName = (typeof SURFACES)[number];

export interface SurfaceStyle {
  backgroundImage: string;
  backgroundBlendMode: string;
}

/**
 * A plastered wall. Fine grain over a slow gradient and nothing else: no
 * grain direction, no joints, no motif. A drawn pattern back here reads as
 * ruling on paper and competes with everything in front of it.
 */
export function plaster(options: SurfaceOptions = {}): string {
  const { seed = 1, tint = color.shadow, highlight = color.slate } = options;
  return [
    turbulence({ seed, baseFrequency: "0.9", octaves: 2, opacity: 0.05, size: 180 }),
    turbulence({ seed: seed + 7, baseFrequency: "0.006", octaves: 3, opacity: 0.1, size: 700 }),
    `linear-gradient(178deg, ${highlight}, ${tint})`,
  ].join(", ");
}

/** Worn baize. Fine, dense, isotropic — the surface a game is dealt on. */
export function felt(options: SurfaceOptions = {}): string {
  const { seed = 1, tint = color.feltDeep, highlight = color.feltLit } = options;
  return [
    turbulence({ seed, baseFrequency: "1.6", octaves: 3, opacity: 0.3, size: 120 }),
    `linear-gradient(150deg, ${highlight}, ${tint})`,
  ].join(", ");
}

/**
 * Lit glass tubing, for anything that is meant to look switched on.
 *
 * Almost no noise: gas in a tube is the one thing in the room with no texture
 * at all, and the light falls off in bands rather than mottling.
 */
export function glass(options: SurfaceOptions = {}): string {
  const { seed = 1, tint = color.neon, highlight = color.neonCore } = options;
  return [
    turbulence({ seed, baseFrequency: "1.2", octaves: 1, opacity: 0.05, size: 90 }),
    `radial-gradient(60% 120% at 50% 50%, ${highlight} 0%, ${tint} 34%, ${color.neonDeep} 78%, transparent 100%)`,
  ].join(", ");
}

/** Card stock, for anything printed — a rules card, a chip label. */
export function card(options: SurfaceOptions = {}): string {
  const { seed = 1, tint = color.smoke, highlight = color.smokeLit } = options;
  return [
    turbulence({ seed, baseFrequency: "2.4", octaves: 2, opacity: 0.14, size: 100 }),
    `linear-gradient(155deg, ${highlight}, ${tint})`,
  ].join(", ");
}

/**
 * Corner darkening, to sit over any other surface. No noise — this is an
 * optical effect, not a material.
 */
export function vignette(options: { strength?: number } = {}): string {
  const { strength = 0.55 } = options;
  return `radial-gradient(120% 90% at 50% 40%, transparent 40%, rgb(0 0 0 / ${strength}) 100%)`;
}

const surfaceMakers: Record<SurfaceName, (options?: SurfaceOptions) => string> = {
  plaster,
  felt,
  glass,
  card,
};

/**
 * Split a CSS `background-image` value into its top-level comma-separated
 * layers. A plain `String.split(",")` would also split on the commas inside
 * a gradient's own argument list, so this tracks parenthesis depth instead.
 */
function splitLayers(image: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < image.length; i++) {
    const char = image[i];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      layers.push(image.slice(start, i));
      start = i + 1;
    }
  }
  layers.push(image.slice(start));
  return layers;
}

/**
 * The mockup composites its grain layer with `mix-blend-mode: overlay`
 * everywhere it appears — without it the noise only darkens instead of both
 * lightening and darkening, reading flatter than the sign-off. Every surface
 * puts its noise layer first, so the blend mode is `overlay` for that layer
 * and `normal` for every layer after it. The layer count is derived from the
 * actual image rather than hardcoded per surface, so it stays correct if a
 * surface's layer count ever changes.
 */
export function surfaceStyle(name: SurfaceName, options?: SurfaceOptions): SurfaceStyle {
  const backgroundImage = surfaceMakers[name](options);
  const layerCount = splitLayers(backgroundImage).length;
  const backgroundBlendMode = ["overlay", ...Array(layerCount - 1).fill("normal")].join(", ");
  return { backgroundImage, backgroundBlendMode };
}
