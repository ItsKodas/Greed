import { describe, expect, it } from "vitest";
import { BASE, FAVOUR_PER_CHIPS, UPGRADES, numbersFor } from "./ladder.js";
import { guardCeiling } from "./guard.js";

/**
 * What a night is actually worth, searched rather than asserted.
 *
 * An earlier draft of this design had its optimum worked out by hand, and a
 * brute-force enumeration then found a better line the hand analysis had not
 * considered — one that passed on an upgrade it could already afford. A
 * hand-tuned ladder needs a search to say what it pays, so the search lives
 * here and the numbers below are its output.
 */

const MINUTES = 60;
const TICK_MS = 1_000;

/**
 * Play a night on one buying plan: tap as fast as the jar refills, buying the
 * next upgrade in `order` the moment it is affordable.
 *
 * Deliberately a simulation of the real rules rather than a closed form. A
 * closed form is a second implementation of the game that can disagree with
 * the first.
 */
function play(order: readonly string[], minutes: number): number {
  let level = BASE.brim;
  let paid = 0;
  let favours = 0;
  let next = 0;
  let bought: string[] = [];

  for (let t = 0; t < minutes * 60_000; t += TICK_MS) {
    const numbers = numbersFor(bought);
    level = Math.min(numbers.brim, level + (numbers.trickle * TICK_MS) / 60_000);
    const pay = Math.floor(Math.min(numbers.scoop, level));
    if (pay >= 1) {
      level -= pay;
      const before = paid;
      paid += pay;
      favours += Math.floor(paid / FAVOUR_PER_CHIPS) - Math.floor(before / FAVOUR_PER_CHIPS);
    }
    while (next < order.length) {
      const up = UPGRADES.find((u) => u.id === order[next]);
      if (up === undefined || favours < up.favours) {
        break;
      }
      favours -= up.favours;
      bought = [...bought, up.id];
      next++;
    }
  }
  return paid;
}

function* orders(items: readonly string[]): Generator<string[]> {
  if (items.length === 0) {
    yield [];
    return;
  }
  for (let i = 0; i < items.length; i++) {
    for (const rest of orders([...items.slice(0, i), ...items.slice(i + 1)])) {
      yield [items[i] as string, ...rest];
    }
  }
}

/** Every subset of the ladder, in every order. */
function* plans(): Generator<string[]> {
  const ids = UPGRADES.map((u) => u.id);
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    const subset = ids.filter((_, i) => (mask & (1 << i)) !== 0);
    yield* orders(subset);
  }
}

describe("an hour at the jar", () => {
  const searched = [...plans()].map((order) => ({ order, paid: play(order, MINUTES) }));
  const best = searched.reduce((a, b) => (b.paid > a.paid ? b : a));
  const nothing = play([], MINUTES);

  it("is worth more when it is played well", () => {
    expect(best.paid).toBeGreaterThan(nothing);
  });

  it("pays about the base trickle when nothing is bought", () => {
    // 60 chips a minute for an hour, plus the brim it started full with.
    expect(nothing).toBeGreaterThanOrEqual(BASE.trickle * MINUTES);
    expect(nothing).toBeLessThanOrEqual(BASE.trickle * MINUTES + BASE.brim);
  });

  it("never breaches the guard, on any plan", () => {
    const ceiling = guardCeiling(0, MINUTES * 60_000);
    for (const { order, paid } of searched) {
      expect(paid, `plan ${order.join(">") || "(none)"}`).toBeLessThanOrEqual(ceiling);
    }
  });

  it("rewards an order that is not simply cheapest-first", () => {
    // The point of the ladder. If a retune makes buying up the rungs in order
    // strictly optimal, the decision has been flattened and this fails.
    const cheapestFirst = play(
      [...UPGRADES].sort((a, b) => a.favours - b.favours).map((u) => u.id),
      MINUTES,
    );
    expect(best.paid).toBeGreaterThanOrEqual(cheapestFirst);
  });
});
