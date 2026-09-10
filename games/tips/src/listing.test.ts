import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TIPS } from "./listing.js";

describe("how the jar lists itself", () => {
  it("is a bar game, not a machine", () => {
    // A machine is played alone against the house and pays from a bank. This
    // has neither, and the catalogue's comment about machines has to stay true.
    expect(TIPS.shape).toBe("bar");
  });

  it("seats one, because there is nobody to play against", () => {
    expect(TIPS.minSeats).toBe(1);
    expect(TIPS.maxSeats).toBe(1);
  });

  it("is open", () => {
    expect(TIPS.open).toBe(true);
  });

  it("paints its card in the same colours its stylesheet does", () => {
    // These live twice — the link cards are drawn server-side where there is
    // no stylesheet to read — so they have to agree.
    const css = readFileSync(
      [
        resolve(process.cwd(), "games/tips/src/theme.css"),
        resolve(process.cwd(), "src/theme.css"),
      ].find((path) => existsSync(path)) as string,
      "utf8",
    );
    expect(css).toContain(TIPS.theme.wall);
    expect(css).toContain(TIPS.theme.felt);
    expect(css).toContain(TIPS.theme.accent);
    expect(css).toContain(TIPS.theme.accentHi);
  });
});
