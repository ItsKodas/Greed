import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * How big the felt actually comes out, at the screens people have.
 *
 * Everything on this table — the cards, the names, the chips — is measured in
 * `cqw`, hundredths of the felt's own width. So the felt's width is not one
 * layout number among many: it is the scale of the entire drawing, and a felt
 * that comes out half the size of the room it is in is a table nobody can read
 * the cards on.
 *
 * The bug this exists for: the cap was written as a height budget alone, so on
 * a 1080p window the felt came out 768px wide inside 1556px of page — the
 * screen had the width and the table would not take it, because it was holding
 * 16:10 whatever that cost. It looked right on a 1440p monitor, where the
 * height budget is generous enough that 16:10 fills the page anyway, which is
 * exactly why it survived.
 *
 * Read out of the stylesheet and worked through rather than restated here.
 * A copy of the numbers would agree with itself forever; this fails when the
 * rules change.
 */

const css = readFileSync(
  [
    resolve(process.cwd(), "apps/web/src/poker/poker.css"),
    resolve(process.cwd(), "src/poker/poker.css"),
  ].find((path) => existsSync(path)) as string,
  "utf8",
);

/**
 * The value of one declaration, wherever in the sheet it is written.
 *
 * A selector appears more than once — the base rule, then again inside the
 * query that caps it — so every block of that name is looked through and the
 * one that sets the property wins. Crude on purpose: for these two properties
 * there is exactly one such block.
 */
function declared(selector: string, property: string): string {
  let at = css.indexOf(`${selector} {`);
  if (at === -1) {
    throw new Error(`no rule for ${selector}`);
  }
  while (at !== -1) {
    const body = css.slice(at, css.indexOf("}", at));
    const found = body.match(new RegExp(`\\n\\s*${property}:\\s*([^;]+);`));
    if (found) {
      return found[1].replace(/\s+/g, " ").trim();
    }
    at = css.indexOf(`${selector} {`, at + 1);
  }
  throw new Error(`${selector} declares no ${property}`);
}

/**
 * A CSS length worked out in pixels, for a window of a given height.
 *
 * Only the grammar these rules use: `max()`, `min()`, `calc()`, `var()`, the
 * four operators, `px`, `dvh` and bare numbers. Anything else is a mistake in
 * the test rather than something to guess at, so it throws.
 */
function pixels(expression: string, dvh: number, vars: Record<string, string>): number {
  let at = 0;
  const text = expression;

  const skip = () => {
    while (at < text.length && text[at] === " ") {
      at += 1;
    }
  };

  const primary = (): number => {
    skip();
    if (text.startsWith("var(", at)) {
      at += 4;
      const close = text.indexOf(")", at);
      const name = text.slice(at, close).trim();
      at = close + 1;
      if (!(name in vars)) {
        throw new Error(`no value for ${name}`);
      }
      return pixels(vars[name], dvh, vars);
    }
    for (const fn of ["max", "min", "calc"]) {
      if (text.startsWith(`${fn}(`, at)) {
        at += fn.length + 1;
        const args: number[] = [];
        for (;;) {
          args.push(sum());
          skip();
          if (text[at] === ",") {
            at += 1;
            continue;
          }
          break;
        }
        if (text[at] !== ")") {
          throw new Error(`unclosed ${fn}( in ${text}`);
        }
        at += 1;
        return fn === "max" ? Math.max(...args) : fn === "min" ? Math.min(...args) : args[0];
      }
    }
    if (text[at] === "(") {
      at += 1;
      const inner = sum();
      at += 1;
      return inner;
    }
    const number = text.slice(at).match(/^-?[\d.]+(px|dvh|vh|%)?/);
    if (!number) {
      throw new Error(`cannot read a length at "${text.slice(at)}"`);
    }
    at += number[0].length;
    const size = Number.parseFloat(number[0]);
    if (number[1] === "dvh" || number[1] === "vh") {
      return (size / 100) * dvh;
    }
    if (number[1] === "%") {
      throw new Error("percentages are not something this test can resolve");
    }
    return size;
  };

  const product = (): number => {
    let value = primary();
    for (;;) {
      skip();
      if (text[at] === "*") {
        at += 1;
        value *= primary();
      } else if (text[at] === "/") {
        at += 1;
        value /= primary();
      } else {
        return value;
      }
    }
  };

  const sum = (): number => {
    let value = product();
    for (;;) {
      skip();
      if (text[at] === "+" && text[at + 1] === " ") {
        at += 1;
        value += product();
      } else if (text[at] === "-" && text[at + 1] === " ") {
        at += 1;
        value -= product();
      } else {
        return value;
      }
    }
  };

  const result = sum();
  skip();
  if (at !== text.length) {
    throw new Error(`left over after "${text.slice(0, at)}": "${text.slice(at)}"`);
  }
  return result;
}

/** The custom properties the felt's cap is written in terms of. */
const vars: Record<string, string> = Object.fromEntries(
  [...css.matchAll(/\n\s*(--[a-z-]+):\s*([^;]+);/g)]
    .map(([, name, value]) => [name, value.replace(/\s+/g, " ").trim()])
    .filter(([, value]) => !value.includes("cqw")),
);

/**
 * The page's own width, which is what the felt is offered.
 *
 * The room is 1600px wide for poker and only poker, less the page's side
 * padding — 22px a side, which is `--gr-space-5`.
 */
function offered(vw: number): number {
  return Math.min(vw, 1600) - 44;
}

/**
 * The felt, as the browser would lay it out.
 *
 * Width is what the page offers, capped. Height comes from the width and the
 * felt's aspect, capped in turn — and a `max-height` on a box whose width is
 * already settled takes height away without taking width, which is the whole
 * of how a table flattens instead of shrinking.
 */
function felt(vw: number, vh: number): { width: number; height: number } {
  const width = Math.min(offered(vw), pixels(declared(".pk", "max-width"), vh, vars));
  const tall = width / (16 / 10);
  let height = tall;
  try {
    height = Math.min(tall, pixels(declared(".pk__table", "max-height"), vh, vars));
  } catch {
    // No cap on the height: the felt only ever holds its aspect.
  }
  return { width, height };
}

/*
 * A window's inside height, not its monitor's. A maximised browser keeps
 * something like 130px for its own chrome, so a 1080p screen is a 950px page —
 * which is the number the felt is actually laid out against.
 */
const SCREENS = [
  { name: "1080p", vw: 1920, vh: 950 },
  { name: "1440p", vw: 2560, vh: 1310 },
  { name: "a laptop", vw: 1600, vh: 770 },
];

describe("the felt", () => {
  it("fills a 1080p window rather than sitting in the middle of it", () => {
    const { width, height } = felt(1920, 950);
    /*
     * 768 before this was fixed, inside 1556px of page — a table drawn at half
     * the size of the screen it was on. It cannot reach the whole 1556 without
     * becoming a corridor, so what it does reach is the flattest a table is
     * allowed to be, which at this height is 960.
     */
    expect({ width: Math.round(width), height: Math.round(height) }).toEqual({
      width: 960,
      height: 480,
    });
  });

  it("gives up its shape before it gives up its size", () => {
    /*
     * The rule, said once: the only reason the felt is ever narrower than the
     * page is that it has run out of shape to give — it is already as flat as
     * a table is allowed to get. Narrower than the page while still holding a
     * comfortable 16:10 means the screen had room the table refused to take.
     */
    const held = SCREENS.filter(({ vw, vh }) => felt(vw, vh).width < offered(vw) - 1).map(
      ({ name, vw, vh }) => {
        const { width, height } = felt(vw, vh);
        return { screen: name, flatEnough: width / height > 1.9 };
      },
    );
    expect(held).toEqual(held.map(({ screen }) => ({ screen, flatEnough: true })));
  });

  it("is never flatter than a table", () => {
    for (const { name, vw, vh } of SCREENS) {
      const { width, height } = felt(vw, vh);
      const aspect = width / height;
      expect({ screen: name, tooFlat: aspect > 2.05, tooTall: aspect < 1.59 }).toEqual({
        screen: name,
        tooFlat: false,
        tooTall: false,
      });
    }
  });
});
