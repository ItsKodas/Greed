import { describe, expect, it } from "vitest";
import { RHYTHM_KEEP, remember, tooEven } from "./rhythm.js";

/** A run of gaps as an autoclicker produces them: a metronome. */
function metronome(gap: number, count: number, jitter = 0): number[] {
  return Array.from({ length: count }, (_, i) => gap + (i % 2 === 0 ? jitter : -jitter));
}

/** A run of gaps from a person tapping quickly. Deliberately untidy. */
const HUMAN_FAST = [96, 143, 88, 210, 117, 74, 165, 132, 91, 188];
/** A person tapping slowly and steadily — the false positive to avoid. */
const HUMAN_SLOW = [812, 799, 806, 803, 810, 797, 808, 801, 805, 799];

describe("the rhythm test", () => {
  it("says nothing about a run too short to judge", () => {
    // Seven perfect gaps is not yet evidence; refusing on it would refuse the
    // first seconds of every honest session.
    expect(tooEven(metronome(100, 7))).toBe(false);
  });

  it("refuses a metronome", () => {
    expect(tooEven(metronome(100, 10))).toBe(true);
  });

  it("refuses a metronome with a millisecond of scheduler noise", () => {
    expect(tooEven(metronome(100, 10, 1))).toBe(true);
  });

  it("allows a person tapping fast", () => {
    expect(tooEven(HUMAN_FAST)).toBe(false);
  });

  it("allows a person tapping slowly and steadily", () => {
    // Even, but not fast. Both conditions are required precisely so that this
    // person — who exists, and is not cheating — is never refused.
    expect(tooEven(HUMAN_SLOW)).toBe(false);
  });

  it("allows an even run that is merely unhurried", () => {
    expect(tooEven(metronome(300, 12))).toBe(false);
  });
});

describe("remembering gaps", () => {
  it("keeps the newest and drops the oldest", () => {
    let gaps: number[] = [];
    for (let i = 0; i < RHYTHM_KEEP + 5; i++) {
      gaps = remember(gaps, i);
    }
    expect(gaps).toHaveLength(RHYTHM_KEEP);
    expect(gaps.at(-1)).toBe(RHYTHM_KEEP + 4);
    expect(gaps[0]).toBe(5);
  });
});
