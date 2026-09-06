import { DEFAULT_RULESET, LETTER_RULESET } from "@greed/rules";
import type { Die, Ruleset } from "@greed/rules";
import { describe, expect, it } from "vitest";
import { decide, expectedGain } from "./bot.js";
import type { BotContext } from "./bot.js";
import { comboGateKeyFor } from "./gatekey.js";

function context(overrides: Partial<BotContext> & { dice: Die[] }): BotContext {
  const rules: Ruleset = overrides.rules ?? DEFAULT_RULESET;
  return {
    kept: 0,
    onBoard: true,
    mustBeat: null,
    skill: "normal",
    rules,
    gateKey: comboGateKeyFor(rules),
    ...overrides,
  };
}

describe("expectedGain", () => {
  const gains = expectedGain(DEFAULT_RULESET, comboGateKeyFor(DEFAULT_RULESET));

  it("gives a value for every dice count", () => {
    expect(gains).toHaveLength(6);
    for (const value of gains) {
      expect(value).toBeGreaterThan(0);
    }
  });

  it("expects more from more dice", () => {
    for (let index = 0; index < 5; index += 1) {
      expect(gains[index + 1] as number).toBeGreaterThan(gains[index] as number);
    }
  });

  it("puts a single die near its true mean", () => {
    // One die: 100 for a 1, 50 for a 5, nothing else. (100 + 50) / 6 = 25.
    expect(gains[0]).toBeCloseTo(25, 6);
  });

  it("is cached, so the table is computed once per ruleset", () => {
    expect(expectedGain(DEFAULT_RULESET, comboGateKeyFor(DEFAULT_RULESET))).toBe(gains);
  });
});

describe("what the bot keeps", () => {
  it("takes the scoring dice and leaves the dead ones", () => {
    const decision = decide(context({ dice: [1, 2, 3, 4, 6, 6] }));
    expect(decision?.keep).toEqual([0]);
  });

  it("takes a whole triple rather than one of its dice", () => {
    const decision = decide(context({ dice: [2, 2, 2, 3, 4, 6] }));
    expect(decision?.keep).toEqual([0, 1, 2]);
  });

  it("returns null when the roll scores nothing", () => {
    expect(decide(context({ dice: [2, 3, 4, 6, 6, 4] }))).toBeNull();
  });
});

describe("when the bot banks", () => {
  it("keeps rolling when it is not yet on the board", () => {
    // 100 is well under the 500 entry threshold, so banking is not an option.
    const decision = decide(context({ dice: [1, 2, 3, 4, 6, 6], onBoard: false }));
    expect(decision?.action).toBe("roll");
  });

  it("banks a large total rather than risking it on two dice", () => {
    // Three dice on the table; keeping the 1 leaves two, which bust 44% of the
    // time. Risking 1,150 on that is a bad trade and the bot should see it.
    const decision = decide(context({ dice: [1, 3, 4], kept: 1050 }));
    expect(decision?.action).toBe("bank");
  });

  it("rolls on when six fresh dice are cheap to try", () => {
    // Clearing all six is hot dice, and six dice bust only 2.3% of the time.
    const decision = decide(context({ dice: [1, 2, 3, 4, 5, 6], kept: 0 }));
    expect(decision?.action).toBe("roll");
  });

  it("easy banks on a small cushion where normal would press on", () => {
    const dice: Die[] = [1, 1, 2, 3, 4, 6];
    expect(decide(context({ dice, skill: "easy" }))?.action).toBe("roll");
    expect(decide(context({ dice: [1, 1, 1, 2, 3, 4], skill: "easy" }))?.action).toBe("bank");
  });
});

describe("the last turn", () => {
  it("refuses to bank a score that would still lose", () => {
    // 1,000 in hand but 4,000 behind: banking loses, so it has to keep going.
    const decision = decide(
      context({ dice: [1, 1, 1, 2, 3, 4], kept: 0, mustBeat: 4000 }),
    );
    expect(decision?.action).toBe("roll");
  });

  it("banks once it is genuinely ahead", () => {
    const decision = decide(
      context({ dice: [1, 1, 1, 2, 3, 4], kept: 2000, mustBeat: 2500 }),
    );
    expect(decision?.action).toBe("bank");
  });
});

describe("the letter edition", () => {
  it("reads the letter face table rather than the pip one", () => {
    // Faces are $ G R E E D. Three $ is a 600 triple; the two 4s are black E
    // and score nothing as a pair, so the bot should keep exactly the three $.
    const decision = decide(context({ dice: [1, 1, 1, 4, 4, 3], rules: LETTER_RULESET }));
    expect(decision?.keep).toEqual([0, 1, 2]);
  });

  it("knows D is worth keeping alone", () => {
    // D is face 6 and scores 100 by itself; R (face 3) scores nothing.
    const decision = decide(context({ dice: [6, 3, 3, 4, 4, 1], rules: LETTER_RULESET }));
    expect(decision?.keep).toContain(0);
  });
});
