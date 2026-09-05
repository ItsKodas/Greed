import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { color, font } from "./tokens.js";

const cssPath = fileURLToPath(new URL("./tokens.css", import.meta.url));
const css = readFileSync(cssPath, "utf8");

/** Turn `walnutLit` into `--gr-color-walnut-lit`. */
function cssName(key: string): string {
  return `--gr-color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

describe("color", () => {
  it("carries the approved palette entries", () => {
    expect(Object.keys(color).sort()).toEqual([
      "baize",
      "baizeDeep",
      "baizeLit",
      "bone",
      "boneDeep",
      "boneDim",
      "boneLit",
      "brass",
      "brassDim",
      "brassHi",
      "chalk",
      "emerald",
      "leather",
      "leatherDeep",
      "leatherLit",
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
        "--gr-color-baize",
        "--gr-color-baize-deep",
        "--gr-color-baize-lit",
        "--gr-color-bone",
        "--gr-color-bone-deep",
        "--gr-color-bone-dim",
        "--gr-color-bone-lit",
        "--gr-color-brass",
        "--gr-color-brass-dim",
        "--gr-color-brass-hi",
        "--gr-color-chalk",
        "--gr-color-emerald",
        "--gr-color-leather",
        "--gr-color-leather-deep",
        "--gr-color-leather-lit",
        "--gr-color-oxblood",
        "--gr-color-walnut",
        "--gr-color-walnut-deep",
        "--gr-color-walnut-lit",
        "--gr-font-data",
        "--gr-font-display",
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
