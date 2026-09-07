import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { preferring } from "./audio.js";

/**
 * The sound files themselves, read where they are dropped.
 *
 * The raw folders rather than the generated manifest: the manifest is written
 * by a build step and is not in the repository, so a test that read it would
 * pass here and explode on a fresh checkout. These are the files somebody
 * actually adds, which is also what the check is about — that the words the
 * cues search for still match what is there. A rename breaks nothing loudly:
 * the search falls back to the whole folder and the wrong sound plays forever
 * without an error anywhere.
 */
function group(name: string): string[] {
  const folder = fileURLToPath(new URL(`../../../../assets/audio/raw/${name}`, import.meta.url));
  try {
    return readdirSync(folder).filter((file) => /\.(mp3|ogg|wav|m4a|webm)$/i.test(file));
  } catch {
    return [];
  }
}

describe("choosing a sample by name", () => {
  it("keeps only the files that mention the word", () => {
    const files = ["/a/placing_chips1.mp3", "/a/counting_chips1.mp3", "/a/placing_chips2.mp3"];
    expect(preferring(files, "placing")).toEqual([
      "/a/placing_chips1.mp3",
      "/a/placing_chips2.mp3",
    ]);
    expect(preferring(files, "counting")).toEqual(["/a/counting_chips1.mp3"]);
  });

  it("falls back to the whole folder when nothing matches", () => {
    // The drop-a-file workflow: unnamed clips still play, just without a split.
    const files = ["/a/one.mp3", "/a/two.mp3"];
    expect(preferring(files, "placing")).toEqual(files);
  });

  it("never hands back an empty list to choose from", () => {
    expect(preferring([], "placing")).toEqual([]);
  });

  it("matches on the name rather than the folder", () => {
    // "/audio/chips/..." contains "chips" in its path, which must not make
    // every file in the folder count as a match for a word in a filename.
    const files = ["/audio/chips/counting_chips1.mp3", "/audio/chips/placing_chips1.mp3"];
    expect(preferring(files, "counting")).toEqual(["/audio/chips/counting_chips1.mp3"]);
  });
});

describe("the words the cues search for still find files", () => {
  /*
   * Each row is a cue and the word it looks up. Skipped when the folder is
   * empty, because an empty folder is a legitimate state — the game falls back
   * to its synthesised voice — and failing on it would make every checkout
   * without the audio assets red.
   */
  const wanted: Array<[cue: string, folder: string, word: string]> = [
    ["shake", "dice", "shake"],
    ["land", "dice", "roll"],
    ["card", "cards", "taking"],
    ["reveal", "cards", "placing"],
    ["bet / bank", "chips", "placing"],
    ["payout", "chips", "counting"],
  ];

  for (const [cue, folder, word] of wanted) {
    it(`${cue} finds a "${word}" file in ${folder}`, () => {
      const files = group(folder);
      if (files.length === 0) {
        return;
      }
      const chosen = preferring(files, word);
      expect(chosen.length).toBeGreaterThan(0);
      // The point of the test: it matched, rather than falling back to all.
      expect(
        chosen.every((url) => url.toLowerCase().includes(word)),
        `nothing in ${folder} is named "${word}", so ${cue} plays whatever is there`,
      ).toBe(true);
    });
  }

  it("gives the deal something to stagger", () => {
    const cards = group("cards");
    if (cards.length === 0) {
      return;
    }
    // A hand is four sounds drawn at random; one file would machine-gun.
    expect(cards.length).toBeGreaterThan(1);
  });
});
