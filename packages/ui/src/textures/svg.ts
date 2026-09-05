/**
 * Percent-encode SVG markup for use inside a CSS url("…").
 *
 * Order matters: the literal percent is escaped first, otherwise the escapes
 * introduced below would themselves be escaped again.
 */
export function encodeSvg(svg: string): string {
  return svg
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ +(?=<\/)/g, "")
    .replace(/%/g, "%25")
    .replace(/"/g, "'")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/#/g, "%23")
    .replace(/\{/g, "%7B")
    .replace(/\}/g, "%7D");
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeSvg(svg)}`;
}

export interface TurbulenceOptions {
  /** Integer seed. The same seed always yields the same tile. */
  seed?: number;
  /** SVG baseFrequency. A single number, or "x y" for a stretched grain. */
  baseFrequency?: string;
  octaves?: number;
  opacity?: number;
  /** Tile size in px. The tile repeats, so keep it modest. */
  size?: number;
  kind?: "fractalNoise" | "turbulence";
}

/**
 * A tileable noise tile as a CSS background-image layer.
 *
 * Rendered by the browser at device resolution rather than baked to a bitmap,
 * which is why this is a few hundred bytes instead of a PNG.
 */
export function turbulence(options: TurbulenceOptions = {}): string {
  const {
    seed = 1,
    baseFrequency = "0.8",
    octaves = 4,
    opacity = 0.3,
    size = 180,
    kind = "fractalNoise",
  } = options;

  const filterId = `n${seed}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <filter id="${filterId}">
      <feTurbulence type="${kind}" baseFrequency="${baseFrequency}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch"/>
    </filter>
    <rect width="${size}" height="${size}" filter="url(#${filterId})" opacity="${opacity}"/>
  </svg>`;

  return `url("${svgDataUri(svg)}")`;
}
