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
  const { seed = 1, tint = color.baize, highlight = color.baizeLit } = options;
  return [
    turbulence({ seed, baseFrequency: "1.6", octaves: 3, opacity: 0.3, size: 120 }),
    `linear-gradient(150deg, ${highlight}, ${tint})`,
  ].join(", ");
}

/** Worn leather. Coarse cellular noise over a radial mottle. */
export function leather(options: SurfaceOptions = {}): string {
  const { seed = 1, tint = color.leather, highlight = color.leatherLit } = options;
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
  const { seed = 1, tint = color.bone, highlight = color.boneLit } = options;
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
