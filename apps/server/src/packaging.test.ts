import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The image against the repo.
 *
 * The Dockerfile copies each workspace's manifest in before `npm ci`, so the
 * install has the whole set to read the lockfile against — its own comment
 * says a manifest missing there is not a smaller install but a failed one.
 *
 * What actually happens is worse than a failed install, and quieter. `npm ci`
 * succeeds, having linked only the packages it was shown; `COPY . .` then
 * brings the rest of the source in behind it, with no symlinks; and the build
 * dies much later on an import it cannot resolve, naming a package that is
 * plainly right there in the tree.
 *
 * Which had happened four times over by the time anyone ran it — slots, poker,
 * tips and roulette were all in the workspace and none of them in the image.
 * Adding a game is exactly when nobody is thinking about the Dockerfile, so
 * this is a test rather than a thing to remember.
 */

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

/** Every workspace the repo declares, with its globs expanded against disk. */
function workspaces(): string[] {
  const manifest = JSON.parse(read("package.json")) as { workspaces: string[] };
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  for (const pattern of manifest.workspaces) {
    if (!pattern.endsWith("/*")) {
      out.push(pattern);
      continue;
    }
    const parent = pattern.slice(0, -2);
    for (const entry of readdirSync(new URL(`${parent}/`, root), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        out.push(`${parent}/${entry.name}`);
      }
    }
  }
  return out.sort();
}

describe("the image and the repo", () => {
  it("copies every workspace's manifest, in both stages", () => {
    const docker = read("Dockerfile");
    /*
     * Counted per stage rather than merely found: the runtime stage installs
     * separately from the build stage, so a manifest present in one and absent
     * from the other still ships an image that cannot start.
     */
    const stages = docker.split(/^FROM /m).filter((part) => part.includes("npm ci"));
    expect(stages.length).toBeGreaterThanOrEqual(2);

    for (const workspace of workspaces()) {
      for (const [at, stage] of stages.entries()) {
        expect(stage, `${workspace} is missing from stage ${at + 1}`).toContain(
          `COPY ${workspace}/package.json ${workspace}/`,
        );
      }
    }
  });
});
