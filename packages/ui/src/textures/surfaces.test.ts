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
    expect(felt()).toContain(color.baizeDeep);
  });
});

describe("leather", () => {
  it("defaults to the leather palette and mottles radially", () => {
    const value = leather();
    expect(value).toContain(color.leatherDeep);
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
    expect(paper()).toContain(color.boneDeep);
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
