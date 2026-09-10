import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A link wearing a button has to look like one.
 *
 * `.btn` was written when every one of them was a `<button>`, which centres
 * its own label and never underlines it — so the class never had to say so.
 * The first `<Link className="btn">` in the building went out underlined and
 * ragged-left with the fill sitting behind it, on the profile page, in front
 * of everybody.
 *
 * Read out of the stylesheet rather than restated here: a copy of the rules
 * would agree with itself forever, and this fails if the rule is dropped.
 */
const css = readFileSync(
  [
    resolve(process.cwd(), "apps/web/src/game/game.css"),
    resolve(process.cwd(), "src/game/game.css"),
  ].find((path) => existsSync(path)) as string,
  "utf8",
);

/** The body of the first rule with this exact selector. */
function ruleBody(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) {
    throw new Error(`no rule for ${selector}`);
  }
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("an anchor wearing .btn", () => {
  it("has a rule of its own at all", () => {
    // The whole bug: there was no `a.btn`, so an <a> kept every one of its
    // own defaults and only the paint came from .btn.
    expect(css).toContain("a.btn {");
  });

  it("drops the underline an anchor brings with it", () => {
    expect(ruleBody("a.btn")).toMatch(/text-decoration:\s*none/);
  });

  it("centres its label, which a button does for free and an anchor does not", () => {
    const body = ruleBody("a.btn");
    expect(body).toMatch(/justify-content:\s*center/);
    expect(body).toMatch(/text-align:\s*center/);
  });

  it("lays itself out as a box rather than inline text", () => {
    // Inline is why the label wrapped mid-phrase inside the fill.
    expect(ruleBody("a.btn")).toMatch(/display:\s*inline-flex/);
  });
});
