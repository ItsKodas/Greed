import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Two promises the building makes that a component test cannot see: that the
 * sheet is actually loaded, and that everything it animates has an off switch.
 * There have been orphan stylesheets in this repo, and rules added to one are
 * silently dead.
 */

const find = (...candidates: string[]) =>
  readFileSync(candidates.find((path) => existsSync(path)) as string, "utf8");

const css = find(
  resolve(process.cwd(), "apps/web/src/leaderboard/leaderboard.css"),
  resolve(process.cwd(), "src/leaderboard/leaderboard.css"),
);
const main = find(resolve(process.cwd(), "apps/web/src/main.tsx"), resolve(process.cwd(), "src/main.tsx"));

describe("the board's stylesheet", () => {
  it("is actually loaded", () => {
    expect(main).toContain("leaderboard/leaderboard.css");
  });

  it("has an off switch for its motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    const off = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(off).toContain(".board__row");
    expect(off).toMatch(/transition:\s*none/);
  });

  it("lets a wide row reflow rather than pushing the page sideways", () => {
    // The row is a grid at width and a wrapped card below the breakpoint; what
    // must never appear is a fixed width or a horizontal scroller on the page.
    expect(css).toContain("@media (max-width:");
    expect(css).not.toMatch(/\.board\s*\{[^}]*overflow-x:\s*scroll/);
  });
});
