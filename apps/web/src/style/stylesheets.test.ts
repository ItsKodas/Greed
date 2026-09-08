import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "lightningcss";
import { describe, expect, it } from "vitest";

/**
 * Every stylesheet in the building, put through the thing that builds them.
 *
 * This exists because a stray closing brace sat in slots.css for a day and
 * nothing noticed. Typecheck does not read CSS, biome does not parse it, and
 * every test in the suite renders components whose styles are never applied —
 * so the whole of the machine's stylesheet could be malformed and 868 tests
 * would still be green. It surfaced as a Docker build failing on a line number
 * in a bundle, which is a long way from the file that was wrong.
 *
 * lightningcss rather than a brace count, because it is what `vite build`
 * actually runs: a check that agrees with the build by construction cannot
 * drift from it, and it catches every other way a stylesheet can be malformed
 * as well.
 */

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

/** Where stylesheets live. Anything under these, at any depth. */
const PLACES = ["apps/web/src", "packages/ui/src", "games"];

function stylesheets(from: string): string[] {
  const found: string[] = [];
  const walk = (at: string) => {
    let entries: string[];
    try {
      entries = readdirSync(at);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === "dist") {
        continue;
      }
      const path = join(at, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (entry.endsWith(".css")) {
        found.push(path);
      }
    }
  };
  walk(join(ROOT, from));
  return found;
}

const sheets = PLACES.flatMap(stylesheets);

describe("the stylesheets", () => {
  it("finds the ones it is meant to be checking", () => {
    // A walk that silently found nothing would make every test below pass.
    expect(sheets.length).toBeGreaterThanOrEqual(6);
    expect(sheets.some((path) => path.endsWith("slots.css"))).toBe(true);
  });

  for (const path of sheets) {
    const name = path.slice(ROOT.length).replace(/\\/g, "/");
    it(`parses and minifies ${name}`, () => {
      const code = readFileSync(path);
      /*
       * Minified as well as parsed. The brace that broke the build parsed
       * happily as a rule with no selector and only fell over in the minifier,
       * which is the step the build actually runs.
       */
      expect(() => transform({ filename: path, code, minify: true })).not.toThrow();
    });
  }

  it("leaves no rule without a selector", () => {
    /*
     * The specific shape of the bug: an unmatched closing brace reads as a
     * block nothing selects. Counted directly as well, because the message
     * lightningcss gives is a line number in whatever it was handed, and on a
     * bundle that is a long way from the file at fault.
     */
    for (const path of sheets) {
      const css = readFileSync(path, "utf8");
      let depth = 0;
      const stray: number[] = [];
      let line = 1;
      for (const character of css) {
        if (character === "\n") {
          line += 1;
        } else if (character === "{") {
          depth += 1;
        } else if (character === "}") {
          depth -= 1;
          if (depth < 0) {
            stray.push(line);
            depth = 0;
          }
        }
      }
      expect({ file: path, strayClosers: stray, unclosed: depth }).toEqual({
        file: path,
        strayClosers: [],
        unclosed: 0,
      });
    }
  });
});
