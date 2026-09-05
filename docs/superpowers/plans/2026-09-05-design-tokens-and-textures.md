# Design Tokens and Textures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `@greed/ui` design foundation — the token system and the procedural texture generators — plus a minimal web app that renders them at `/style`, so the visual direction is running code rather than a mockup.

**Architecture:** Colour, type and spacing live in one CSS file of custom properties, mirrored by a typed TS object that a test keeps in sync. Textures are **pure string functions** returning CSS `background-image` values built from SVG `feTurbulence` data-URIs layered over gradients — no canvas, no DOM, no runtime dependency, deterministic for a given seed. A small Vite + React app hosts the `/style` gallery, which later plans extend into the game client.

**Tech Stack:** TypeScript (strict), React 18, Vite, react-router-dom, Vitest with jsdom for component tests. `packages/ui` has **no runtime dependencies** in this plan; React arrives with the components in Plan B.

**Spec:** `docs/superpowers/specs/2026-09-05-greed-multiplayer-design.md` (section 11)

## Deviation from the spec, recorded

Spec §11.2 specifies textures "generated procedurally with seeded `simplex-noise`, rendered to canvas, cached as tileable data-URIs". This plan uses **SVG `feTurbulence`** instead. Reasons: the generators stay pure string functions testable in node (a canvas needs a DOM or the `canvas` native module), `packages/ui` keeps zero runtime dependencies for this phase, output is a few hundred bytes rather than a rasterised PNG, and the browser rasterises at device pixel ratio instead of us baking a fixed size. Determinism still holds — `feTurbulence` takes an integer `seed` attribute. The approved mockups already use this technique.

## Global Constraints

- **`tokens.css` is the single source of truth for colour.** `tokens.ts` mirrors it and a test fails if they disagree. Never add a colour to one without the other.
- Every custom property is prefixed `--gr-` to avoid collisions with anything the app later imports.
- Texture functions are **pure**: same arguments in, identical string out. No `Math.random`, no `Date`, no DOM access, no caching that changes behaviour.
- `packages/ui` has **no runtime dependencies** in this plan.
- TypeScript `strict: true`. No `any`. No non-null assertions (`!`).
- ESM throughout; relative imports carry a `.js` extension though the source is `.ts`.
- **Single dark theme, deliberately.** The game is a dim room. Do not add a light palette or `prefers-color-scheme` handling — that is an open product decision, not an oversight.
- Conventional-commit prefixes (`chore:`, `feat:`, `test:`, `fix:`, `docs:`).

## The approved palette

These exact values come from the mockups the client signed off. They are not suggestions.

| Token | Hex | Role |
|---|---|---|
| `walnut` | `#241811` | page ground |
| `walnut-lit` | `#3A281C` | raised wood surfaces |
| `walnut-deep` | `#170F0A` | recesses, shadow wells |
| `baize` | `#16241C` | worn felt, the table inset |
| `baize-lit` | `#1E3227` | felt highlight |
| `brass` | `#C08A2E` | the accent: rails, rivets, active states |
| `brass-hi` | `#E8C168` | brass highlight, numerals |
| `brass-dim` | `#7A5A21` | brass in shadow, borders |
| `bone` | `#E8DCC4` | dice faces, primary text |
| `bone-dim` | `#A2957D` | secondary text |
| `oxblood` | `#7E2B22` | farkle, bust, loss |
| `leather` | `#4A3225` | tray rail, seat backs |

Typefaces: **Bevan** (display), **IBM Plex Sans** (UI), **IBM Plex Mono** (codes, scores, odds).

## File Structure

```
packages/ui/
  package.json          no dependencies
  tsconfig.json
  src/
    tokens.css          custom properties — source of truth
    tokens.ts           typed mirror, used by the texture generators
    textures/
      svg.ts            encodeSvg, svgDataUri, turbulence
      surfaces.ts       wood, felt, leather, brass, paper, vignette
      index.ts
    index.ts
apps/web/
  package.json          react, react-dom, react-router-dom
  tsconfig.json
  vite.config.ts
  index.html            Google Fonts link lives here
  src/
    main.tsx
    App.tsx             router: / redirects to /style
    style/
      Gallery.tsx       the page
      Swatches.tsx      palette section
      TypeSpecimen.tsx  type section
      TextureTiles.tsx  texture section
```

---

### Task 1: The `@greed/ui` package and its tokens

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/tokens.ts`
- Create: `packages/ui/src/index.ts`
- Modify: `tsconfig.json` (add the new project reference)
- Test: `packages/ui/src/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `@greed/ui`:
  - `color` — a frozen record of the twelve palette entries, camelCase keys (`walnut`, `walnutLit`, `walnutDeep`, `baize`, `baizeLit`, `brass`, `brassHi`, `brassDim`, `bone`, `boneDim`, `oxblood`, `leather`), values lowercase hex strings.
  - `font` — `{ display, ui, data }`, each a full CSS font stack string.
  - `type ColorName = keyof typeof color`
  - `packages/ui/src/tokens.css` — importable stylesheet defining every `--gr-*` property.

- [ ] **Step 1: Create the package manifest**

`packages/ui/package.json`. No `dependencies` key — that is a constraint, not an omission.

```json
{
  "name": "@greed/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./tokens.css": "./src/tokens.css"
  }
}
```

`packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Register the project reference**

Replace the contents of the root `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./packages/rules" },
    { "path": "./packages/ui" }
  ]
}
```

- [ ] **Step 3: Install the workspace**

Run from the repo root:

```bash
npm install
```

This registers the new workspace in the lockfile. Skipping it leaves `npm ci` unable to link `@greed/ui` — the same defect that bit `@greed/rules` in the previous plan.

- [ ] **Step 4: Write the failing test**

`packages/ui/src/tokens.test.ts`. The third test is the important one: it reads the CSS file off disk and proves the two representations agree, so a colour can never be changed in one place only.

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { color, font } from "./tokens.js";

const cssPath = fileURLToPath(new URL("./tokens.css", import.meta.url));
const css = readFileSync(cssPath, "utf8");

/** Turn `walnutLit` into `--gr-color-walnut-lit`. */
function cssName(key: string): string {
  return "--gr-color-" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}

describe("color", () => {
  it("carries the twelve approved palette entries", () => {
    expect(Object.keys(color).sort()).toEqual([
      "baize",
      "baizeLit",
      "bone",
      "boneDim",
      "brass",
      "brassDim",
      "brassHi",
      "leather",
      "oxblood",
      "walnut",
      "walnutDeep",
      "walnutLit",
    ]);
  });

  it("uses the exact approved values", () => {
    expect(color.walnut).toBe("#241811");
    expect(color.baize).toBe("#16241c");
    expect(color.brass).toBe("#c08a2e");
    expect(color.bone).toBe("#e8dcc4");
    expect(color.oxblood).toBe("#7e2b22");
  });

  it("is written in lowercase hex throughout", () => {
    for (const value of Object.values(color)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(color)).toBe(true);
  });
});

describe("tokens.css", () => {
  it("defines a custom property for every colour, with the same value", () => {
    for (const [key, value] of Object.entries(color)) {
      const property = cssName(key);
      const match = css.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
      expect(match, `${property} missing from tokens.css`).not.toBeNull();
      expect(match?.[1]?.trim().toLowerCase()).toBe(value);
    }
  });

  it("defines no colour property that the token object does not know about", () => {
    const declared = [...css.matchAll(/--gr-color-([a-z-]+)\s*:/g)].map((m) => m[1]);
    const known = Object.keys(color).map((key) =>
      key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()),
    );
    for (const name of declared) {
      expect(known, `--gr-color-${name} has no entry in tokens.ts`).toContain(name);
    }
  });

  it("declares the three typefaces", () => {
    expect(css).toContain("--gr-font-display");
    expect(css).toContain("--gr-font-ui");
    expect(css).toContain("--gr-font-data");
  });
});

describe("font", () => {
  it("names the approved families with real fallbacks", () => {
    expect(font.display).toContain("Bevan");
    expect(font.display).toContain("serif");
    expect(font.ui).toContain("IBM Plex Sans");
    expect(font.data).toContain("IBM Plex Mono");
    expect(font.data).toContain("monospace");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -- tokens`
Expected: FAIL — cannot resolve `./tokens.js`.

- [ ] **Step 6: Write the token stylesheet**

`packages/ui/src/tokens.css`:

```css
/*
 * The single source of truth for colour. tokens.ts mirrors this file and a
 * test fails if the two disagree — never change one without the other.
 *
 * Deliberately one theme. The game is a dim back room; there is no light
 * palette by design, not by omission.
 */
:root {
  --gr-color-walnut: #241811;
  --gr-color-walnut-lit: #3a281c;
  --gr-color-walnut-deep: #170f0a;
  --gr-color-baize: #16241c;
  --gr-color-baize-lit: #1e3227;
  --gr-color-brass: #c08a2e;
  --gr-color-brass-hi: #e8c168;
  --gr-color-brass-dim: #7a5a21;
  --gr-color-bone: #e8dcc4;
  --gr-color-bone-dim: #a2957d;
  --gr-color-oxblood: #7e2b22;
  --gr-color-leather: #4a3225;

  --gr-font-display: "Bevan", Georgia, serif;
  --gr-font-ui: "IBM Plex Sans", system-ui, sans-serif;
  --gr-font-data: "IBM Plex Mono", ui-monospace, monospace;

  --gr-text-xs: 0.74rem;
  --gr-text-sm: 0.86rem;
  --gr-text-base: 0.95rem;
  --gr-text-lg: 1.14rem;
  --gr-text-xl: 1.5rem;
  --gr-text-2xl: 1.9rem;
  --gr-text-3xl: 2.7rem;

  --gr-space-1: 4px;
  --gr-space-2: 8px;
  --gr-space-3: 12px;
  --gr-space-4: 16px;
  --gr-space-5: 22px;
  --gr-space-6: 30px;
  --gr-space-7: 44px;
  --gr-space-8: 64px;

  --gr-radius-sm: 2px;
  --gr-radius-md: 4px;
  --gr-radius-die: 9px;

  --gr-edge-hair: 1px solid rgb(192 138 46 / 0.28);
  --gr-edge-soft: 1px solid rgb(232 220 196 / 0.14);

  --gr-lift-low: 0 2px 6px rgb(0 0 0 / 0.5);
  --gr-lift-high: 0 24px 60px -18px rgb(0 0 0 / 0.85);
  --gr-well: inset 0 3px 18px rgb(0 0 0 / 0.7);
}
```

- [ ] **Step 7: Write the token module**

`packages/ui/src/tokens.ts`:

```ts
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
  brass: "#c08a2e",
  brassHi: "#e8c168",
  brassDim: "#7a5a21",
  bone: "#e8dcc4",
  boneDim: "#a2957d",
  oxblood: "#7e2b22",
  leather: "#4a3225",
});

export type ColorName = keyof typeof color;

export const font = Object.freeze({
  display: '"Bevan", Georgia, serif',
  ui: '"IBM Plex Sans", system-ui, sans-serif',
  data: '"IBM Plex Mono", ui-monospace, monospace',
});
```

`packages/ui/src/index.ts`:

```ts
export { color, font, type ColorName } from "./tokens.js";
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- tokens`
Expected: PASS, 8 tests.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/ui tsconfig.json package-lock.json
git commit -m "feat: add the ui package and its design tokens"
```

---

### Task 2: SVG noise plumbing

The primitive every texture is built from. Pure string manipulation — no DOM, no canvas.

**Files:**
- Create: `packages/ui/src/textures/svg.ts`
- Test: `packages/ui/src/textures/svg.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `./textures/svg.js`:
  - `encodeSvg(svg: string): string` — collapses whitespace and percent-encodes so the result is safe inside a CSS `url("…")`.
  - `svgDataUri(svg: string): string` — returns `data:image/svg+xml,<encoded>`.
  - `interface TurbulenceOptions { seed?: number; baseFrequency?: string; octaves?: number; opacity?: number; size?: number; kind?: "fractalNoise" | "turbulence" }`
  - `turbulence(options?: TurbulenceOptions): string` — returns a complete CSS `url("data:image/svg+xml,…")` value. Defaults: `seed 1`, `baseFrequency "0.8"`, `octaves 4`, `opacity 0.3`, `size 180`, `kind "fractalNoise"`.

- [ ] **Step 1: Write the failing test**

`packages/ui/src/textures/svg.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { encodeSvg, svgDataUri, turbulence } from "./svg.js";

describe("encodeSvg", () => {
  it("percent-encodes the characters that would break a CSS url()", () => {
    const encoded = encodeSvg("<svg id='a#b'></svg>");
    expect(encoded).not.toContain("<");
    expect(encoded).not.toContain(">");
    expect(encoded).not.toContain("#");
    expect(encoded).toContain("%3C");
    expect(encoded).toContain("%3E");
    expect(encoded).toContain("%23");
  });

  it("encodes a literal percent before introducing its own", () => {
    // If % were escaped after <, the %3C would itself become %253C.
    const encoded = encodeSvg("<a>100%</a>");
    expect(encoded).toContain("100%25");
    expect(encoded).toContain("%3Ca%3E");
    expect(encoded).not.toContain("%253C");
  });

  it("turns double quotes into single quotes so the value can sit in url(\"…\")", () => {
    expect(encodeSvg('<svg width="10"></svg>')).toContain("width='10'");
  });

  it("collapses whitespace and trims", () => {
    expect(encodeSvg("  <a>\n\n  <b/>\t</a>  ")).toBe("%3Ca%3E %3Cb/%3E%3C/a%3E");
  });

  it("encodes braces", () => {
    const encoded = encodeSvg("<style>a{b:c}</style>");
    expect(encoded).toContain("%7B");
    expect(encoded).toContain("%7D");
  });
});

describe("svgDataUri", () => {
  it("prefixes the encoded markup with the data URI scheme", () => {
    expect(svgDataUri("<svg/>")).toBe("data:image/svg+xml,%3Csvg/%3E");
  });
});

describe("turbulence", () => {
  it("returns a css url() value", () => {
    const value = turbulence();
    expect(value.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(value.endsWith('")')).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    expect(turbulence({ seed: 7 })).toBe(turbulence({ seed: 7 }));
  });

  it("produces different output for different seeds", () => {
    expect(turbulence({ seed: 1 })).not.toBe(turbulence({ seed: 2 }));
  });

  it("carries every option into the markup", () => {
    const value = turbulence({
      seed: 9,
      baseFrequency: "0.05 0.6",
      octaves: 2,
      opacity: 0.42,
      size: 240,
      kind: "turbulence",
    });
    expect(value).toContain("seed='9'");
    expect(value).toContain("baseFrequency='0.05 0.6'");
    expect(value).toContain("numOctaves='2'");
    expect(value).toContain("opacity='0.42'");
    expect(value).toContain("width='240'");
    expect(value).toContain("type='turbulence'");
  });

  it("references its own filter with an encoded fragment", () => {
    // url(#n) inside the SVG must survive as url(%23n) or the filter silently
    // fails to apply and the tile renders as a flat black rectangle.
    expect(turbulence()).toContain("filter='url(%23");
  });

  it("tiles seamlessly", () => {
    expect(turbulence()).toContain("stitchTiles='stitch'");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- svg`
Expected: FAIL — cannot resolve `./svg.js`.

- [ ] **Step 3: Write the implementation**

`packages/ui/src/textures/svg.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- svg`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/textures/svg.ts packages/ui/src/textures/svg.test.ts
git commit -m "feat: add svg noise plumbing for procedural textures"
```

---

### Task 3: The six surfaces

**Files:**
- Create: `packages/ui/src/textures/surfaces.ts`
- Create: `packages/ui/src/textures/index.ts`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/src/textures/surfaces.test.ts`

**Interfaces:**
- Consumes: `turbulence` from `./svg.js`; `color` from `../tokens.js`.
- Produces, from `@greed/ui`:
  - `interface SurfaceOptions { seed?: number; tint?: string; highlight?: string }`
  - `wood(options?: SurfaceOptions): string`
  - `felt(options?: SurfaceOptions): string`
  - `leather(options?: SurfaceOptions): string`
  - `brass(options?: SurfaceOptions): string`
  - `paper(options?: SurfaceOptions): string`
  - `vignette(options?: { strength?: number }): string`
  - `const SURFACES: readonly ["wood", "felt", "leather", "brass", "paper"]`

  Every surface function returns a complete CSS `background-image` value: one or more comma-separated layers, noise first (so it sits on top), gradients beneath.

- [ ] **Step 1: Write the failing test**

`packages/ui/src/textures/surfaces.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { color } from "../tokens.js";
import { SURFACES, brass, felt, leather, paper, vignette, wood } from "./surfaces.js";

const surfaces = { wood, felt, leather, brass, paper };

describe("every surface", () => {
  it("is named in SURFACES", () => {
    expect([...SURFACES].sort()).toEqual(Object.keys(surfaces).sort());
  });

  it.each(Object.entries(surfaces))("%s returns a layered background-image", (_name, make) => {
    const value = make();
    expect(value.length).toBeGreaterThan(0);
    expect(value).toContain("gradient(");
  });

  it.each(Object.entries(surfaces))("%s is deterministic", (_name, make) => {
    expect(make({ seed: 3 })).toBe(make({ seed: 3 }));
  });

  it.each(Object.entries(surfaces))("%s varies with the seed", (_name, make) => {
    expect(make({ seed: 1 })).not.toBe(make({ seed: 2 }));
  });

  it.each(Object.entries(surfaces))("%s honours a tint override", (_name, make) => {
    expect(make({ tint: "#123456" })).toContain("#123456");
  });

  it.each(Object.entries(surfaces))("%s emits no raw angle brackets", (_name, make) => {
    // Unencoded markup in a background-image silently kills the whole rule.
    expect(make()).not.toContain("<");
    expect(make()).not.toContain(">");
  });
});

describe("wood", () => {
  it("defaults to the walnut palette", () => {
    const value = wood();
    expect(value).toContain(color.walnut);
    expect(value).toContain(color.walnutLit);
  });

  it("draws directional grain, not isotropic noise", () => {
    // A stretched baseFrequency is what makes it read as grain rather than sand.
    expect(wood()).toContain("repeating-linear-gradient");
  });
});

describe("felt", () => {
  it("defaults to the baize palette", () => {
    expect(felt()).toContain(color.baize);
  });
});

describe("leather", () => {
  it("defaults to the leather palette and mottles radially", () => {
    const value = leather();
    expect(value).toContain(color.leather);
    expect(value).toContain("radial-gradient");
  });
});

describe("brass", () => {
  it("uses several stops so it reads as metal rather than a flat fill", () => {
    const value = brass();
    expect(value).toContain(color.brassHi);
    expect(value).toContain(color.brassDim);
  });
});

describe("paper", () => {
  it("defaults to the bone palette", () => {
    expect(paper()).toContain(color.bone);
  });
});

describe("vignette", () => {
  it("is a single radial gradient with no noise", () => {
    const value = vignette();
    expect(value).toContain("radial-gradient");
    expect(value).not.toContain("data:image/svg+xml");
  });

  it("takes a strength", () => {
    expect(vignette({ strength: 0.8 })).toContain("0.8");
  });

  it("defaults to a strength that is visible but not heavy", () => {
    expect(vignette()).toContain("0.55");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- surfaces`
Expected: FAIL — cannot resolve `./surfaces.js`.

- [ ] **Step 3: Write the implementation**

`packages/ui/src/textures/surfaces.ts`:

```ts
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
  const { seed = 1, tint = color.leather, highlight = "#5b3e2c" } = options;
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
  const { seed = 1, tint = color.bone, highlight = "#f3ead6" } = options;
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
```

`packages/ui/src/textures/index.ts`:

```ts
export { encodeSvg, svgDataUri, turbulence, type TurbulenceOptions } from "./svg.js";
export {
  SURFACES,
  brass,
  felt,
  leather,
  paper,
  vignette,
  wood,
  type SurfaceName,
  type SurfaceOptions,
} from "./surfaces.js";
```

Replace `packages/ui/src/index.ts` with:

```ts
export { color, font, type ColorName } from "./tokens.js";
export {
  SURFACES,
  brass,
  encodeSvg,
  felt,
  leather,
  paper,
  svgDataUri,
  turbulence,
  vignette,
  wood,
  type SurfaceName,
  type SurfaceOptions,
  type TurbulenceOptions,
} from "./textures/index.js";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- surfaces`
Expected: PASS, 35 tests (one SURFACES check, five parametrised blocks over five surfaces = 25, plus nine per-surface cases).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src
git commit -m "feat: add wood, felt, leather, brass, paper and vignette surfaces"
```

---

### Task 4: The web app shell

A minimal Vite + React app whose only job for now is to host the gallery. Later plans build the game client into it.

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/style/Gallery.tsx`
- Modify: `package.json` (add the `dev` and `build` scripts)
- Modify: `vitest.config.ts` (include `.tsx`)
- Modify: `tsconfig.json` (add the project reference)
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `color`, `font` from `@greed/ui`.
- Produces: `App` (default export from `./App.js`) and `Gallery` (named export from `./style/Gallery.js`). The route `/style` renders the gallery; `/` redirects to it.

- [ ] **Step 1: Create the app manifest and install**

`apps/web/package.json`:

```json
{
  "name": "@greed/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@greed/ui": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  }
}
```

Then, from the repo root:

```bash
npm install
npm install -D vite @vitejs/plugin-react
npm install -D @testing-library/react jsdom @types/react @types/react-dom
```

`vite` and its React plugin go in the root dev dependencies so the workspace
shares one copy. Do not pin versions by hand — take what npm resolves.

- [ ] **Step 2: Configure the app**

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

`apps/web/vite.config.ts`. The `optimizeDeps.exclude` matters: the workspace packages export TypeScript source, and Vite's dependency pre-bundler would otherwise try to treat them as pre-built CommonJS and fail.

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  optimizeDeps: { exclude: ["@greed/ui", "@greed/rules"] },
});
```

`apps/web/index.html`. The font link lives here rather than in CSS so the browser can start fetching before the stylesheet parses.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Greed</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Bevan&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Add the root scripts and widen the test glob**

In the root `package.json`, add to `scripts`:

```json
"dev": "npm run dev -w @greed/web",
"build": "npm run build -w @greed/web"
```

Replace `vitest.config.ts` at the repo root:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
  },
});
```

Component tests opt into a DOM per file with a `// @vitest-environment jsdom` comment, so the node-only texture tests keep running in node.

Add the project reference to the root `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./packages/rules" },
    { "path": "./packages/ui" },
    { "path": "./apps/web" }
  ]
}
```

- [ ] **Step 4: Write the failing test**

`apps/web/src/App.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App.js";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  it("renders the gallery at /style", () => {
    renderAt("/style");
    expect(screen.getByRole("heading", { name: /greed/i, level: 1 })).toBeDefined();
  });

  it("redirects the root path to the gallery", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: /greed/i, level: 1 })).toBeDefined();
  });

  it("shows a not-found message for an unknown path", () => {
    renderAt("/nowhere");
    expect(screen.getByText(/no such page/i)).toBeDefined();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -- App`
Expected: FAIL — cannot resolve `./App.js`.

- [ ] **Step 6: Write the app**

`apps/web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import "@greed/ui/tokens.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("index.html is missing #root");
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

`apps/web/src/App.tsx`:

```tsx
import { Navigate, Route, Routes } from "react-router-dom";
import { Gallery } from "./style/Gallery.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/style" replace />} />
      <Route path="/style" element={<Gallery />} />
      <Route path="*" element={<p style={{ padding: 32 }}>No such page.</p>} />
    </Routes>
  );
}
```

`apps/web/src/style/Gallery.tsx` — a stub for now; Task 5 fills it in.

```tsx
export function Gallery() {
  return (
    <main>
      <h1>Greed</h1>
    </main>
  );
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- App`
Expected: PASS, 3 tests.

- [ ] **Step 8: Confirm the dev server boots**

```bash
npm run dev
```

Expected: Vite prints a local URL and compiles without error. Open it, confirm the page shows the word "Greed" in the browser's default font (the gallery is still a stub), then stop the server with Ctrl-C.

- [ ] **Step 9: Commit**

```bash
git add apps/web package.json vitest.config.ts tsconfig.json package-lock.json
git commit -m "feat: add the web app shell hosting the style gallery"
```

---

### Task 5: The gallery

The page that makes the design system visible. Three sections: palette, type, textures.

**Files:**
- Create: `apps/web/src/style/gallery.css`
- Create: `apps/web/src/style/Swatches.tsx`
- Create: `apps/web/src/style/TypeSpecimen.tsx`
- Create: `apps/web/src/style/TextureTiles.tsx`
- Modify: `apps/web/src/style/Gallery.tsx` (replace the stub)
- Test: `apps/web/src/style/Gallery.test.tsx`

**Interfaces:**
- Consumes: `color`, `font`, `SURFACES`, `wood`, `felt`, `leather`, `brass`, `paper`, `vignette` from `@greed/ui`.
- Produces: `Swatches`, `TypeSpecimen`, `TextureTiles` (named exports), and the filled-in `Gallery`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/style/Gallery.test.tsx`:

```tsx
// @vitest-environment jsdom
import { color } from "@greed/ui";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Gallery } from "./Gallery.js";

describe("Gallery", () => {
  it("names every palette entry", () => {
    render(<Gallery />);
    const palette = screen.getByRole("region", { name: /palette/i });
    for (const name of Object.keys(color)) {
      expect(within(palette).getByText(name)).toBeDefined();
    }
  });

  it("prints the hex value beside each swatch", () => {
    render(<Gallery />);
    const palette = screen.getByRole("region", { name: /palette/i });
    expect(within(palette).getByText(color.brass)).toBeDefined();
    expect(within(palette).getByText(color.oxblood)).toBeDefined();
  });

  it("shows a specimen for each of the three typefaces", () => {
    render(<Gallery />);
    const type = screen.getByRole("region", { name: /type/i });
    expect(within(type).getByText(/bevan/i)).toBeDefined();
    expect(within(type).getByText(/plex sans/i)).toBeDefined();
    expect(within(type).getByText(/plex mono/i)).toBeDefined();
  });

  it("renders a tile for every surface plus the vignette", () => {
    render(<Gallery />);
    const textures = screen.getByRole("region", { name: /texture/i });
    for (const name of ["wood", "felt", "leather", "brass", "paper", "vignette"]) {
      // getAllByText, not getByText: wood appears twice, once per seed.
      expect(within(textures).getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it("gives each texture tile a real background-image", () => {
    render(<Gallery />);
    const tile = screen.getByTestId("texture-wood");
    expect(tile.style.backgroundImage).toContain("gradient(");
  });

  it("varies the seed across tiles of the same surface", () => {
    render(<Gallery />);
    const first = screen.getByTestId("texture-wood").style.backgroundImage;
    const second = screen.getByTestId("texture-wood-alt").style.backgroundImage;
    expect(first).not.toBe(second);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- Gallery`
Expected: FAIL — the stub Gallery has no palette region.

- [ ] **Step 3: Write the gallery stylesheet**

`apps/web/src/style/gallery.css`:

```css
body {
  margin: 0;
  background: var(--gr-color-walnut);
  color: var(--gr-color-bone);
  font-family: var(--gr-font-ui);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.gallery {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--gr-space-8) var(--gr-space-5);
}

.gallery__title {
  font-family: var(--gr-font-display);
  font-size: clamp(2.6rem, 8vw, 4.4rem);
  line-height: 0.9;
  margin: 0;
  font-weight: 400;
}

.gallery__title em {
  font-style: normal;
  color: var(--gr-color-brass);
}

.gallery__deck {
  color: var(--gr-color-bone-dim);
  max-width: 60ch;
  margin: var(--gr-space-4) 0 0;
}

.section {
  padding: var(--gr-space-8) 0 0;
}

.section__title {
  font-family: var(--gr-font-display);
  font-weight: 400;
  font-size: var(--gr-text-xl);
  color: var(--gr-color-brass);
  margin: 0 0 var(--gr-space-4);
}

.swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--gr-space-3);
}

.swatch__chip {
  height: 72px;
  border-radius: var(--gr-radius-sm);
  border: var(--gr-edge-soft);
}

.swatch__name {
  display: block;
  font-size: var(--gr-text-sm);
  margin-top: var(--gr-space-2);
}

.swatch__hex {
  display: block;
  font-family: var(--gr-font-data);
  font-size: var(--gr-text-xs);
  color: var(--gr-color-bone-dim);
}

.specimen {
  padding: var(--gr-space-4) 0;
  border-bottom: var(--gr-edge-soft);
}

.specimen:last-child {
  border-bottom: none;
}

.specimen__sample {
  margin: 0;
  color: var(--gr-color-bone);
}

.specimen__label {
  font-size: var(--gr-text-xs);
  color: var(--gr-color-bone-dim);
  margin: var(--gr-space-1) 0 0;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--gr-space-4);
}

.tile__surface {
  height: 130px;
  border-radius: var(--gr-radius-sm);
  border: 1px solid rgb(0 0 0 / 0.5);
  box-shadow: var(--gr-lift-low);
}

.tile__name {
  display: block;
  font-size: var(--gr-text-sm);
  margin-top: var(--gr-space-2);
}

.tile__note {
  display: block;
  font-size: var(--gr-text-xs);
  color: var(--gr-color-bone-dim);
}
```

- [ ] **Step 4: Write the palette section**

`apps/web/src/style/Swatches.tsx`:

```tsx
import { color } from "@greed/ui";

export function Swatches() {
  return (
    <section className="section" aria-label="Palette">
      <h2 className="section__title">Palette</h2>
      <div className="swatches">
        {Object.entries(color).map(([name, hex]) => (
          <div key={name}>
            <div className="swatch__chip" style={{ background: hex }} />
            <span className="swatch__name">{name}</span>
            <span className="swatch__hex">{hex}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Write the type section**

`apps/web/src/style/TypeSpecimen.tsx`. The sample sentences are drawn from the game itself rather than pangrams — the point is to see the type doing the job it will actually do.

```tsx
import { font } from "@greed/ui";

const specimens = [
  {
    family: font.display,
    size: "2.2rem",
    sample: "Hot dice",
    label: "Bevan — wordmark and screen titles",
  },
  {
    family: font.ui,
    size: "1.05rem",
    sample: "Bank 1,450 and pass the cup",
    label: "IBM Plex Sans — everything you read",
  },
  {
    family: font.data,
    size: "1.05rem",
    sample: "K7WQ3 · 2.31% · 10,000",
    label: "IBM Plex Mono — codes, scores, odds",
  },
];

export function TypeSpecimen() {
  return (
    <section className="section" aria-label="Type">
      <h2 className="section__title">Type</h2>
      {specimens.map((spec) => (
        <div className="specimen" key={spec.label}>
          <p
            className="specimen__sample"
            style={{ fontFamily: spec.family, fontSize: spec.size, lineHeight: 1.2 }}
          >
            {spec.sample}
          </p>
          <p className="specimen__label">{spec.label}</p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 6: Write the texture section**

`apps/web/src/style/TextureTiles.tsx`. Two seeds per surface, side by side, so it is obvious at a glance that the generator varies rather than repeating one baked image.

```tsx
import { brass, felt, leather, paper, vignette, wood } from "@greed/ui";

interface Tile {
  id: string;
  name: string;
  note: string;
  background: string;
}

const tiles: Tile[] = [
  { id: "wood", name: "wood", note: "seed 1", background: wood({ seed: 1 }) },
  { id: "wood-alt", name: "wood", note: "seed 2", background: wood({ seed: 2 }) },
  { id: "felt", name: "felt", note: "seed 1", background: felt({ seed: 1 }) },
  { id: "leather", name: "leather", note: "seed 1", background: leather({ seed: 1 }) },
  { id: "brass", name: "brass", note: "seed 1", background: brass({ seed: 1 }) },
  { id: "paper", name: "paper", note: "seed 1", background: paper({ seed: 1 }) },
  { id: "vignette", name: "vignette", note: "over wood", background: `${vignette()}, ${wood({ seed: 4 })}` },
];

export function TextureTiles() {
  return (
    <section className="section" aria-label="Textures">
      <h2 className="section__title">Textures</h2>
      <div className="tiles">
        {tiles.map((tile) => (
          <div key={tile.id}>
            <div
              className="tile__surface"
              data-testid={`texture-${tile.id}`}
              style={{ backgroundImage: tile.background }}
            />
            <span className="tile__name">{tile.name}</span>
            <span className="tile__note">{tile.note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Assemble the gallery**

Replace `apps/web/src/style/Gallery.tsx`:

```tsx
import { Swatches } from "./Swatches.js";
import { TextureTiles } from "./TextureTiles.js";
import { TypeSpecimen } from "./TypeSpecimen.js";
import "./gallery.css";

export function Gallery() {
  return (
    <main className="gallery">
      <h1 className="gallery__title">
        GRE<em>E</em>D
      </h1>
      <p className="gallery__deck">
        The design system, as running code. Every colour, typeface and surface below is what the
        game is built from — change a token and this page changes with it.
      </p>
      <Swatches />
      <TypeSpecimen />
      <TextureTiles />
    </main>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- Gallery`
Expected: PASS, 6 tests.

- [ ] **Step 9: Run the whole suite and typecheck**

```bash
npm test
```

Expected: PASS, 175 tests across 12 files (111 rules engine, 8 tokens, 12 svg, 35 surfaces, 3 App, 6 Gallery). Report the real number if it differs.

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 10: Look at it**

```bash
npm run dev
```

Open the printed URL. Confirm by eye:
- The three typefaces actually loaded — Bevan is a heavy slab, not a fallback serif. If the display face looks like Georgia, the Google Fonts link is wrong.
- Wood reads as directional grain, felt as fine even tooth, brass as a metal ramp with highlights.
- The two wood tiles are visibly different from each other.
- Nothing scrolls sideways.

Then stop the server.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src
git commit -m "feat: render the palette, type and textures in the style gallery"
```

---

## Done when

- `npm test` passes, including the test that keeps `tokens.css` and `tokens.ts` in agreement.
- `npm run typecheck` exits 0.
- `npm run dev` serves a gallery at `/style` showing twelve swatches, three type specimens and seven texture tiles.
- `packages/ui/package.json` still has no `dependencies` key.

## Next plan

The component library: Radix-skinned primitives (Button, TextField, Select, Toggle, Checkbox, Slider, Modal, Tooltip, Toast, Tabs) and the game pieces (Die, DiceTray, Chip, PlayerSeat, ScoreCard, TurnBanner, PotDisplay, RulesSummary), each added to this gallery as it lands. That plan introduces React as a dependency of `packages/ui`.
