/**
 * Typed mirror of tokens.css. The stylesheet is the source of truth; this
 * exists so the texture generators can tint from the palette in TypeScript.
 * A test asserts the two agree.
 */
export const color = Object.freeze({
  walnut: "#241811",
  walnutLit: "#3a281c",
  walnutDeep: "#170f0a",
  baize: "#16241c",
  baizeLit: "#1e3227",
  baizeDeep: "#101a14",
  brass: "#c08a2e",
  brassHi: "#e8c168",
  brassDim: "#7a5a21",
  bone: "#e8dcc4",
  boneLit: "#f3ead6",
  boneDim: "#a2957d",
  boneDeep: "#cfc1a4",
  oxblood: "#7e2b22",
  leather: "#4a3225",
  leatherLit: "#5b3e2c",
  leatherDeep: "#33221a",
});

export type ColorName = keyof typeof color;

export const font = Object.freeze({
  display: '"Bevan", Georgia, serif',
  ui: '"IBM Plex Sans", system-ui, sans-serif',
  data: '"IBM Plex Mono", ui-monospace, monospace',
});
