import { describe, expect, it } from "vitest";
import { REFUSALS, buy, emptyJar, rollNight, tap, type Outcome } from "./tap.js";
import { NIGHT_MS, levelAt, type Jar } from "./jar.js";
import { BASE, FAVOUR_PER_CHIPS, MAX, numbersFor } from "./ladder.js";
import { RHYTHM_MIN_SAMPLES } from "./rhythm.js";

/** Deterministic tokens, so a test can say which one it means. */
function minter() {
  let n = 0;
  return () => `t${++n}`;
}

function full(over: Partial<Jar> = {}): Jar {
  return { ...emptyJar(0, "t0"), level: BASE.brim, levelAt: 0, ...over };
}

describe("a tap", () => {
  it("pays a scoop out of a full jar", () => {
    const out = tap(full(), 0, "t0", minter());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.paid).toBe(BASE.scoop);
    expect(out.jar.level).toBe(BASE.brim - BASE.scoop);
  });

  it("mints a fresh token, so the same message cannot be replayed", () => {
    const out = tap(full(), 0, "t0", minter());
    expect(out.ok && out.jar.token).toBe("t1");
    // The replay: the same token again, against the jar the first tap made.
    const replay = out.ok ? tap(out.jar, 200, "t0", minter()) : null;
    expect(replay?.ok).toBe(false);
    expect(replay?.ok === false && replay.error).toBe(REFUSALS.stale);
  });

  it("refuses a stale token without touching the jar", () => {
    const before = full({ level: 900 });
    const out = tap(before, 0, "wrong", minter());
    expect(out.ok).toBe(false);
    expect(out.jar.level).toBe(900);
    expect(out.jar.paidThisNight).toBe(0);
  });

  it("rotates the token even on a refusal, so a client is never wedged", () => {
    const out = tap(full(), 0, "wrong", minter());
    expect(out.jar.token).toBe("t1");
  });

  it("refuses a tap faster than a hand", () => {
    const jar = full({ token: "t0" });
    const first = tap(jar, 1_000, "t0", minter());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const tooSoon = tap(first.jar, 1_020, first.jar.token, minter());
    expect(tooSoon.ok).toBe(false);
    expect(tooSoon.ok === false && tooSoon.error).toBe(REFUSALS.fast);
  });

  it("still enforces the floor on the tap right after one that rolled the night", () => {
    // Finding 1: a jar left idle past NIGHT_MS has levelAt === nightStartedAt
    // and an empty rhythm before the tap, and again right after it (both get
    // set to `now`). Those two fields coinciding is not evidence a tap just
    // happened — lastTapAt is what tracks that, and this is the case that
    // catches a lastGap built from the wrong fields.
    const jar = full();
    const first = tap(jar, NIGHT_MS + 1, jar.token, minter());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const tooSoon = tap(first.jar, NIGHT_MS + 2, first.jar.token, minter());
    expect(tooSoon.ok).toBe(false);
    expect(tooSoon.ok === false && tooSoon.error).toBe(REFUSALS.fast);
  });

  it("refuses a metronome once there is enough of it to judge", () => {
    let jar = full({ level: MAX.brim });
    const mint = minter();
    let at = 0;
    let refused: string | null = null;
    for (let i = 0; i < 12; i++) {
      at += 100;
      const out = tap(jar, at, jar.token, mint);
      jar = out.jar;
      if (!out.ok) {
        refused = out.error;
        break;
      }
    }
    expect(refused).toBe(REFUSALS.even);
  });

  it("keeps the gap that tripped a rhythm refusal, instead of throwing it away", () => {
    // Finding 3: a refusal used to hand back `rolled` — the jar exactly as it
    // stood before this attempt — so the gap that tripped tooEven was
    // computed only to be thrown away. The refused jar's rhythm should hold
    // all eight recorded gaps, ending in the one that tripped it, not the
    // seven that came before: the layer that judges a hand's evenness must
    // itself remember every gap it judged, or a later check is reasoning
    // about a rhythm that never actually happened.
    let jar = full({ level: MAX.brim });
    const mint = minter();
    let at = 0;
    let refused: Outcome | null = null;
    for (let i = 0; i < 12 && refused === null; i++) {
      at += 100;
      const out = tap(jar, at, jar.token, mint);
      jar = out.jar;
      if (!out.ok) {
        refused = out;
      }
    }
    expect(refused?.ok).toBe(false);
    expect(refused?.ok === false && refused.error).toBe(REFUSALS.even);
    expect(jar.rhythm).toHaveLength(RHYTHM_MIN_SAMPLES);
    expect(jar.rhythm.at(-1)).toBe(100);
  });

  it("takes what is left when the jar holds less than a scoop", () => {
    const out = tap(full({ level: 7, levelAt: 0 }), 0, "t0", minter());
    expect(out.ok && out.paid).toBe(7);
    expect(out.ok && out.jar.level).toBe(0);
  });

  it("refuses a dry jar rather than paying a stream of nothing", () => {
    const out = tap(full({ level: 0, levelAt: 0 }), 0, "t0", minter());
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toBe(REFUSALS.dry);
  });

  it("pays whole chips only", () => {
    // 0.5 in the jar is not half a chip to somebody's balance.
    const out = tap(full({ level: 0, levelAt: 0 }), 500, "t0", minter());
    expect(out.ok).toBe(false);
    const later = tap(full({ level: 0, levelAt: 0 }), 2_000, "t0", minter());
    expect(later.ok && later.paid).toBe(2);
  });

  it("earns favours from chips collected", () => {
    // A 25-chip scoop crosses one 20-chip boundary. Written as the literal it
    // is: an expectation computed from the same constants as the code is a
    // test that agrees with a bug in them.
    const out = tap(full(), 0, "t0", minter());
    expect(out.ok && out.jar.favours).toBe(1);
    expect(out.ok && out.jar.paidThisNight).toBe(25);
    expect(BASE.scoop).toBe(25);
    expect(FAVOUR_PER_CHIPS).toBe(20);
  });

  it("records the gap it accepted, for the next rhythm judgement", () => {
    const first = tap(full(), 1_000, "t0", minter());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = tap(first.jar, 1_400, first.jar.token, minter());
    expect(second.ok && second.jar.rhythm).toEqual([400]);
  });
});

describe("the night turning over", () => {
  it("clears favours and upgrades", () => {
    const jar = full({ favours: 90, bought: ["glass", "spot"], paidThisNight: 4_000 });
    const rolled = rollNight(jar, NIGHT_MS + 1);
    expect(rolled.favours).toBe(0);
    expect(rolled.bought).toEqual([]);
    expect(rolled.paidThisNight).toBe(0);
    expect(rolled.nightStartedAt).toBe(NIGHT_MS + 1);
  });

  it("does not touch the level", () => {
    const jar = full({ level: 2_400, bought: ["stool"] });
    expect(rollNight(jar, NIGHT_MS + 1).level).toBe(2_400);
  });

  it("leaves a carried-over level above the new brim alone", () => {
    const jar = full({ level: MAX.brim, bought: ["glass", "spot", "stool", "name"] });
    const rolled = rollNight(jar, NIGHT_MS + 1);
    expect(rolled.level).toBe(MAX.brim);
    // And the trickle adds nothing to it until it is spent below the brim.
    expect(levelAt(rolled, numbersFor(rolled.bought), NIGHT_MS + 60_000)).toBe(MAX.brim);
  });

  it("does nothing at all before the interval is up", () => {
    const jar = full({ favours: 90, bought: ["glass"] });
    expect(rollNight(jar, NIGHT_MS - 1)).toEqual(jar);
  });

  it("happens on the tap that crosses it, not on a timer", () => {
    const jar = full({ favours: 90, bought: ["glass"], level: MAX.brim });
    const out = tap(jar, NIGHT_MS + 1, "t0", minter());
    expect(out.ok).toBe(true);
    expect(out.jar.bought).toEqual([]);
    // The scoop it paid was the base one, because the upgrade had expired.
    expect(out.ok && out.paid).toBe(BASE.scoop);
  });
});

describe("buying an upgrade", () => {
  it("takes the favours and adds the numbers", () => {
    const jar = full({ favours: 20 });
    const out = buy(jar, 0, "t0", "glass", minter());
    expect(out.ok).toBe(true);
    expect(out.jar.favours).toBe(5);
    expect(out.jar.bought).toEqual(["glass"]);
    expect(numbersFor(out.jar.bought).scoop).toBe(35);
  });

  it("refuses one you cannot afford, and charges nothing", () => {
    const jar = full({ favours: 14 });
    const out = buy(jar, 0, "t0", "glass", minter());
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toBe(REFUSALS.poor);
    expect(out.jar.favours).toBe(14);
    expect(out.jar.bought).toEqual([]);
  });

  it("refuses one already bought", () => {
    const jar = full({ favours: 200, bought: ["glass"] });
    const out = buy(jar, 0, "t0", "glass", minter());
    expect(out.ok === false && out.error).toBe(REFUSALS.owned);
    expect(out.jar.favours).toBe(200);
  });

  it("refuses an id that is not on the ladder", () => {
    const out = buy(full({ favours: 200 }), 0, "t0", "free-money", minter());
    expect(out.ok === false && out.error).toBe(REFUSALS.unknown);
  });

  it("refuses a stale token", () => {
    const out = buy(full({ favours: 200 }), 0, "nope", "glass", minter());
    expect(out.ok === false && out.error).toBe(REFUSALS.stale);
  });

  it("is not subject to the interval floor", () => {
    // A buy may legitimately follow a tap by five milliseconds, because the
    // player had already made up their mind.
    const first = tap(full(), 1_000, "t0", minter());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const bought = buy({ ...first.jar, favours: 20 }, 1_005, first.jar.token, "glass", minter());
    expect(bought.ok).toBe(true);
  });

  it("does not record a rhythm sample", () => {
    const out = buy(full({ favours: 20 }), 0, "t0", "glass", minter());
    expect(out.jar.rhythm).toEqual([]);
  });

  it("does not make the next tap look too fast, even a few ms after the buy", () => {
    // Finding 2: buy moves levelAt (to carry the level across at the old
    // numbers) but must not move lastTapAt. The real last tap here is at
    // 1_000; the buy at 1_060 is not a tap and must not reset the clock the
    // interval floor reads from.
    const mint = minter();
    const first = tap(full({ favours: 20 }), 1_000, "t0", mint);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const bought = buy(first.jar, 1_060, first.jar.token, "glass", mint);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    const second = tap(bought.jar, 1_065, bought.jar.token, mint);
    expect(second.ok).toBe(true);
  });
});

describe("the guard, from the outside", () => {
  it("refuses a payout past the ceiling however the level got that high", () => {
    // A jar with a corrupt level, as a bug in the arithmetic would leave it.
    const jar = full({ level: 999_999, paidThisNight: MAX.brim });
    const out = tap(jar, 0, "t0", minter());
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toBe(REFUSALS.guard);
  });
});
