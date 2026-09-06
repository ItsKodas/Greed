import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { color, font } from "./tokens.js";

const cssPath = fileURLToPath(new URL("./tokens.css", import.meta.url));
const css = readFileSync(cssPath, "utf8");

/** Turn `neonHi` into `--gr-color-neon-hi`. */
function cssName(key: string): string {
  return `--gr-color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

describe("color", () => {
  it("carries the approved palette entries", () => {
    expect(Object.keys(color).sort()).toEqual([
      "bad",
      "chip",
      "chipDim",
      "chipHi",
      "felt",
      "feltDeep",
      "feltLit",
      "good",
      "ink",
      "inkDim",
      "inkFaint",
      "inkLit",
      "neon",
      "neonCore",
      "neonDeep",
      "neonDim",
      "neonHi",
      "night",
      "shadow",
      "slate",
      "smoke",
      "smokeLit",
    ]);
  });

  it("uses the exact approved values", () => {
    expect(color.night).toBe("#0f141c");
    expect(color.neon).toBe("#2e7bff");
    expect(color.chip).toBe("#e0b048");
    expect(color.ink).toBe("#dfe7f2");
    expect(color.felt).toBe("#12241f");
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
      expect(match?.[1]?.trim()).toBe(value);
    }
  });

  it("defines no colour property that the token object does not know about", () => {
    const declared = [...css.matchAll(/--gr-color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    const known = Object.keys(color).map((key) =>
      key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
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

  it("defines a custom property for every font, with the same value", () => {
    const fontProperties: Record<keyof typeof font, string> = {
      display: "--gr-font-display",
      ui: "--gr-font-ui",
      data: "--gr-font-data",
    };
    for (const [key, property] of Object.entries(fontProperties)) {
      const match = css.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
      expect(match, `${property} missing from tokens.css`).not.toBeNull();
      expect(match?.[1]?.trim()).toBe(font[key as keyof typeof font]);
    }
  });

  it("declares exactly the approved set of tokens", () => {
    // Matches a declaration ("--gr-foo: value;") but not a var(--gr-foo)
    // reference, because a reference is never followed directly by a colon.
    const declared = [...css.matchAll(/(--gr-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual(
      [
        "--gr-color-bad",
        "--gr-color-chip",
        "--gr-color-chip-dim",
        "--gr-color-chip-hi",
        "--gr-color-felt",
        "--gr-color-felt-deep",
        "--gr-color-felt-lit",
        "--gr-color-good",
        "--gr-color-ink",
        "--gr-color-ink-dim",
        "--gr-color-ink-faint",
        "--gr-color-ink-lit",
        "--gr-color-neon",
        "--gr-color-neon-core",
        "--gr-color-neon-deep",
        "--gr-color-neon-dim",
        "--gr-color-neon-hi",
        "--gr-color-night",
        "--gr-color-shadow",
        "--gr-color-slate",
        "--gr-color-smoke",
        "--gr-color-smoke-lit",
        "--gr-font-data",
        "--gr-font-display",
        "--gr-font-sign",
        "--gr-font-ui",
        "--gr-text-xs",
        "--gr-text-sm",
        "--gr-text-base",
        "--gr-text-lg",
        "--gr-text-xl",
        "--gr-text-2xl",
        "--gr-text-3xl",
        "--gr-space-1",
        "--gr-space-2",
        "--gr-space-3",
        "--gr-space-4",
        "--gr-space-5",
        "--gr-space-6",
        "--gr-space-7",
        "--gr-space-8",
        "--gr-radius-sm",
        "--gr-radius-md",
        "--gr-radius-die",
        "--gr-edge-hair",
        "--gr-edge-soft",
        "--gr-edge-hard",
        "--gr-lift-low",
        "--gr-lift-high",
        "--gr-well",
      ].sort(),
    );
  });

  it("anchors the scale endpoints to the approved values", () => {
    expect(css).toMatch(/--gr-space-1:\s*4px;/);
    expect(css).toMatch(/--gr-space-8:\s*64px;/);
    expect(css).toMatch(/--gr-text-xs:\s*0\.74rem;/);
    expect(css).toMatch(/--gr-text-3xl:\s*2\.7rem;/);
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

describe("references", () => {
  it("never mentions a token it does not declare", () => {
    /*
     * A var() pointing at a name that no longer exists does not fail loudly —
     * the declaration is simply dropped, and a border quietly becomes
     * currentColor. Renaming the palette left two of these behind, so it is
     * checked now rather than noticed later.
     */
    const declared = new Set([...css.matchAll(/(--gr-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const referenced = [...css.matchAll(/var\((--gr-[a-z0-9-]+)/g)].map((m) => m[1]);
    for (const name of referenced) {
      expect(declared, `tokens.css uses ${name} without declaring it`).toContain(name);
    }
  });
});
