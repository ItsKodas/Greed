import { describe, expect, it } from "vitest";
import { color } from "../tokens.js";
import { SURFACES, card, felt, glass, plaster, surfaceStyle, vignette } from "./surfaces.js";

const surfaces = { plaster, felt, glass, card };

/**
 * Reference split of a background-image into top-level comma-separated
 * layers, tracking parenthesis depth so a gradient's own internal commas
 * are not mistaken for layer separators. Kept independent of the
 * implementation in surfaces.ts so the test actually exercises the claim.
 */
function splitTopLevelLayers(image: string): string[] {
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

describe("plaster", () => {
  it("defaults to the room's own darkness", () => {
    const value = plaster();
    expect(value).toContain(color.shadow);
    expect(value).toContain(color.slate);
  });

  it("has no direction and no motif — only grain over a gradient", () => {
    const value = plaster();
    expect(value).not.toContain("repeating-linear-gradient");
    // Two noise layers: tooth up close, unevenness across the wall.
    expect(value.match(/feTurbulence/g)).toHaveLength(2);
  });
});

describe("felt", () => {
  it("defaults to the felt palette", () => {
    expect(felt()).toContain(color.feltDeep);
  });
});

describe("glass", () => {
  it("burns white in the middle and blue through the glass", () => {
    const value = glass();
    expect(value).toContain(color.neonCore);
    expect(value).toContain(color.neon);
    expect(value).toContain(color.neonDeep);
  });

  it("falls off radially, because light does", () => {
    expect(glass()).toContain("radial-gradient");
  });
});

describe("card", () => {
  it("defaults to the printed-stock palette", () => {
    expect(card()).toContain(color.smoke);
  });
});

describe("surfaceStyle", () => {
  it.each(SURFACES)("%s: backgroundImage matches the plain surface function", (name) => {
    const { backgroundImage } = surfaceStyle(name);
    expect(backgroundImage).toBe(surfaces[name]());
  });

  it.each(SURFACES)(
    "%s: backgroundBlendMode has exactly one entry per top-level layer",
    (name) => {
      const { backgroundImage, backgroundBlendMode } = surfaceStyle(name);
      const layers = splitTopLevelLayers(backgroundImage);
      const modes = backgroundBlendMode.split(",").map((mode) => mode.trim());
      expect(modes.length).toBe(layers.length);
    },
  );

  it.each(SURFACES)("%s: the first blend mode is overlay", (name) => {
    const { backgroundBlendMode } = surfaceStyle(name);
    expect(backgroundBlendMode.split(",")[0]?.trim()).toBe("overlay");
  });

  it.each(SURFACES)("%s: every blend mode after the first is normal", (name) => {
    const { backgroundBlendMode } = surfaceStyle(name);
    const modes = backgroundBlendMode.split(",").map((mode) => mode.trim());
    expect(modes.slice(1)).toEqual(modes.slice(1).map(() => "normal"));
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
