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

export const SURFACES = ["wood", "felt", "leather", "brass", "paper"] as const;

export type SurfaceName = (typeof SURFACES)[number];

export interface SurfaceStyle {
  backgroundImage: string;
  backgroundBlendMode: string;
}

/**
 * Aged walnut. The stretched baseFrequency pulls the noise into a direction so
 * it reads as grain; the repeating gradient supplies the harder growth lines.
 */
export function wood(options: SurfaceOptions = {}): string {
  const { seed = 1, tint = color.walnut, highlight = color.walnutLit } = options;
  return [
    turbulence({ seed, baseFrequency: "0.012 0.7", octaves: 3, opacity: 0.22, size: 240 }),
    "repeating-linear-gradient(96deg, rgb(0 0 0 / 0.28) 0 2px, transparent 2px 8px, rgb(0 0 0 / 0.15) 8px 9px, transparent 9px 20px)",
    `linear-gradient(160deg, ${highlight}, ${tint})`,
  ].join(", ");
}

/** Worn baize. Fine, dense, isotropic — the opposite of wood. */
export function felt(options: SurfaceOptions = {}): string {
  const { seed = 1, tint = color.baizeDeep, highlight = color.baizeLit } = options;
  return [
    turbulence({ seed, baseFrequency: "1.6", octaves: 3, opacity: 0.3, size: 120 }),
    `linear-gradient(150deg, ${highlight}, ${tint})`,
  ].join(", ");
}

/** Worn leather. Coarse cellular noise over a radial mottle. */
export function leather(options: SurfaceOptions = {}): string {
  const { seed = 1, tint = color.leatherDeep, highlight = color.leatherLit } = options;
  return [
    turbulence({ seed, baseFrequency: "0.35", octaves: 4, opacity: 0.26, size: 200, kind: "turbulence" }),
    `radial-gradient(90% 70% at 30% 20%, ${highlight}, ${tint})`,
  ].join(", ");
}

/** Brushed brass. Anisotropic streaks over a multi-stop metal ramp. */
export function brass(options: SurfaceOptions = {}): string {
  const { seed = 1, tint = color.brass, highlight = color.brassHi } = options;
  return [
    turbulence({ seed, baseFrequency: "0.02 1.4", octaves: 2, opacity: 0.18, size: 160 }),
    `linear-gradient(150deg, ${color.brassDim} 0%, ${highlight} 34%, ${tint} 52%, ${highlight} 68%, ${color.brassDim} 100%)`,
  ].join(", ");
}

/** Bone / paper stock. Very fine grain, barely there. */
export function paper(options: SurfaceOptions = {}): string {
  const { seed = 1, tint = color.boneDeep, highlight = color.boneLit } = options;
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
  wood,
  felt,
  leather,
  brass,
  paper,
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
