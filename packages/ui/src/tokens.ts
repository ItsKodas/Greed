/**
 * Typed mirror of tokens.css. The stylesheet is the source of truth; this
 * exists so the texture generators can tint from the palette in TypeScript.
 * A test asserts the two agree.
 */
export const color = Object.freeze({
  night: "#0f141c",
  slate: "#171f2a",
  shadow: "#070a0f",
  smoke: "#222c39",
  smokeLit: "#2c3846",
  felt: "#12241f",
  feltLit: "#18302a",
  feltDeep: "#0c1815",
  neonCore: "#ffffff",
  neonHi: "#7ba9ff",
  neon: "#2e7bff",
  neonDim: "#1b4a91",
  neonDeep: "#0b3fd4",
  chip: "#e0b048",
  chipHi: "#f5d68a",
  chipDim: "#8a6b28",
  ink: "#dfe7f2",
  inkLit: "#f2f6fb",
  inkDim: "#8b97a8",
  inkFaint: "#5d6878",
  good: "#3fbf7a",
  bad: "#c2543f",
});

export type ColorName = keyof typeof color;

export const font = Object.freeze({
  sign: '"Dancing Script", cursive',
  display: '"Bevan", Georgia, serif',
  ui: '"IBM Plex Sans", system-ui, sans-serif',
  data: '"IBM Plex Mono", ui-monospace, monospace',
});
