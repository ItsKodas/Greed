import { describe, expect, it } from "vitest";
import { bundle, signed } from "./history.js";
import type { PlayedGame } from "./history.js";

const ME = "u1";

/** A finished record, with only the parts a test cares about spelled out. */
function record(over: Partial<PlayedGame> & { net?: number }): PlayedGame {
  const { net, ...rest } = over;
  return {
    code: "AAAAA",
    rulesetName: "Blackjack",
    buyIn: 0,
    pot: 0,
    players: [
      { userId: ME, name: "Ada", score: 0, isBot: false, ...(net === undefined ? {} : { net }) },
      { userId: "u2", name: "Bram", score: 0, isBot: false },
    ],
    winnerIds: [],
    endedAt: 1,
    ...rest,
  };
}

describe("bundling a history into sessions", () => {
  it("collapses a run of hands at one table into a single line", () => {
    // Newest first, the way the server hands them over.
    const sessions = bundle(
      [
        record({ code: "XH3R3", endedAt: 5, net: 0 }),
        record({ code: "XH3R3", endedAt: 4, net: -500 }),
        record({ code: "XH3R3", endedAt: 3, net: 750 }),
      ],
      ME,
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      code: "XH3R3",
      rounds: 3,
      net: 250,
      endedAt: 5,
      estimated: false,
    });
  });

  it("keeps separate tables separate", () => {
    const sessions = bundle(
      [
        record({ code: "AAAAA", net: 100 }),
        record({ code: "BBBBB", net: 200 }),
        record({ code: "AAAAA", net: 300 }),
      ],
      ME,
    );
    // Three lines, not two: going back to a table later is a second visit, and
    // the game played in between is what says so.
    expect(sessions.map((s) => s.code)).toEqual(["AAAAA", "BBBBB", "AAAAA"]);
    expect(sessions.map((s) => s.net)).toEqual([100, 200, 300]);
  });

  it("will not merge two games that happen to share a code", () => {
    const sessions = bundle(
      [
        record({ code: "AAAAA", rulesetName: "Blackjack", net: 100 }),
        record({ code: "AAAAA", rulesetName: "Classic", net: 100 }),
      ],
      ME,
    );
    expect(sessions).toHaveLength(2);
  });

  it("counts the fullest the table ever got", () => {
    const sessions = bundle(
      [
        record({ net: 0 }),
        record({
          net: 0,
          players: [
            { userId: ME, name: "Ada", score: 0, isBot: false, net: 0 },
            { userId: "u2", name: "Bram", score: 0, isBot: false },
            { userId: "u3", name: "Cleo", score: 0, isBot: false },
          ],
        }),
      ],
      ME,
    );
    expect(sessions[0]?.players).toBe(3);
  });

  it("ignores what other people won", () => {
    const sessions = bundle(
      [
        record({
          players: [
            { userId: ME, name: "Ada", score: 0, isBot: false, net: -500 },
            { userId: "u2", name: "Bram", score: 0, isBot: false, net: 9000 },
          ],
        }),
      ],
      ME,
    );
    expect(sessions[0]?.net).toBe(-500);
  });

  it("falls back for records written before chips were recorded per player", () => {
    /*
     * The old derivation, and it is only ever right for Greed: it assumes one
     * pot won outright. The row is marked so the page can say the figure is a
     * reconstruction rather than a fact.
     */
    const won = bundle([record({ buyIn: 500, pot: 1000, winnerIds: [ME] })], ME);
    expect(won[0]).toMatchObject({ net: 500, estimated: true });

    const lost = bundle([record({ buyIn: 500, pot: 1000, winnerIds: ["u2"] })], ME);
    expect(lost[0]).toMatchObject({ net: -500, estimated: true });
  });

  it("marks a session estimated when any hand in it was", () => {
    const sessions = bundle(
      [record({ code: "XH3R3", net: 100 }), record({ code: "XH3R3", buyIn: 0, pot: 0 })],
      ME,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.estimated).toBe(true);
  });

  it("has nothing to say about an empty history", () => {
    expect(bundle([], ME)).toEqual([]);
  });
});

describe("writing a change in chips", () => {
  it("signs a gain and leaves a loss its own minus", () => {
    expect(signed(750)).toBe("+750");
    expect(signed(-500)).toBe("-500");
    expect(signed(12500)).toBe("+12,500");
  });

  it("writes nothing-at-all as nothing-at-all", () => {
    /*
     * The bug this exists for: negative zero is a real number in JavaScript,
     * it satisfies `>= 0`, and it formats as "-0" — so the obvious sign test
     * printed a plus in front of a minus and every broken-even hand in the
     * history read "+-0".
     */
    expect(signed(0)).toBe("0");
    expect(signed(-0)).toBe("0");
    expect(signed(0)).not.toContain("+");
  });
});
