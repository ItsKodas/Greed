import { bustProbability, enumerateOptions } from "@backroom/rules";
import type { Die, Option, Ruleset } from "@backroom/rules";
import type { BotSkill } from "@backroom/shared";

export type { BotSkill };

export interface BotDecision {
  /** Indices into the roll that the bot wants to set aside. */
  keep: number[];
  action: "roll" | "bank";
}

/** Easy banks the moment it has this much, regardless of the odds. */
const EASY_BANK_AT = 300;

/**
 * Deterministic generator, so a bot's expected-value table is identical on
 * every server and every restart. Sampling with Math.random would make the
 * opponent subtly different each time the process came up.
 */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const expectedCache = new Map<string, readonly number[]>();

/**
 * Average points gained from one roll of k dice, counting a bust as zero.
 *
 * Exact for one to three dice, where the whole space is 216 rolls or fewer.
 * Sampled beyond that, because six dice is 46,656 rolls and enumerating every
 * one would stall the event loop for about a second — long enough for every
 * other table on the server to feel it. Index 0 is one die.
 */
export function expectedGain(rules: Ruleset, key: string): readonly number[] {
  const cached = expectedCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const table: number[] = [];
  for (let count = 1; count <= 6; count += 1) {
    table.push(count <= 3 ? exactMean(count, rules) : sampledMean(count, rules));
  }
  const frozen = Object.freeze(table);
  expectedCache.set(key, frozen);
  return frozen;
}

function bestPoints(dice: Die[], rules: Ruleset): number {
  const options = enumerateOptions(dice, rules);
  return options[0]?.points ?? 0;
}

function exactMean(count: number, rules: Ruleset): number {
  const dice: Die[] = new Array<Die>(count).fill(1);
  const total = 6 ** count;
  let sum = 0;
  for (let roll = 0; roll < total; roll += 1) {
    let remainder = roll;
    for (let position = 0; position < count; position += 1) {
      dice[position] = ((remainder % 6) + 1) as Die;
      remainder = Math.floor(remainder / 6);
    }
    sum += bestPoints(dice, rules);
  }
  return sum / total;
}

function sampledMean(count: number, rules: Ruleset): number {
  const samples = 2000;
  const random = lcg(count * 7919 + 13);
  const dice: Die[] = new Array<Die>(count).fill(1);
  let sum = 0;
  for (let draw = 0; draw < samples; draw += 1) {
    for (let position = 0; position < count; position += 1) {
      dice[position] = (Math.floor(random() * 6) + 1) as Die;
    }
    sum += bestPoints(dice, rules);
  }
  return sum / samples;
}

/** Turn an option's count vector into the indices a player would click. */
function indicesFor(dice: readonly Die[], option: Option): number[] {
  const wanted = [...option.counts];
  const picked: number[] = [];
  dice.forEach((face, index) => {
    const remaining = wanted[face - 1] ?? 0;
    if (remaining > 0) {
      wanted[face - 1] = remaining - 1;
      picked.push(index);
    }
  });
  return picked;
}

export interface BotContext {
  dice: readonly Die[];
  /** Points already set aside this turn. */
  kept: number;
  onBoard: boolean;
  /**
   * How far behind the leader the bot is, when this is the last turn it will
   * get. Null at any other time. Banking a losing score is worth nothing, so
   * a trailing bot on its final turn should keep rolling.
   */
  mustBeat: number | null;
  rules: Ruleset;
  gateKey: string;
  skill: BotSkill;
}

/**
 * What the bot does with the dice in front of it, or null when nothing scores
 * — in which case it has farkled and there is no decision to make.
 */
export function decide(context: BotContext): BotDecision | null {
  const { dice, kept, onBoard, mustBeat, rules, gateKey, skill } = context;
  const options = enumerateOptions(dice, rules);
  const first = options[0];
  if (first === undefined) {
    return null;
  }

  const gains = expectedGain(rules, gateKey);

  let best: { score: number; decision: BotDecision } | null = null;

  for (const option of options) {
    const used = option.diceUsed;
    const left = dice.length - used;
    // Clearing every die is hot dice: the next roll is a fresh six.
    const nextCount = left === 0 ? 6 : left;
    const total = kept + option.points;
    const canBank = onBoard || total >= rules.entryThreshold;

    const bust = bustProbability(nextCount, rules);
    const gain = gains[nextCount - 1] ?? 0;
    const rollValue = (1 - bust) * (total + gain);

    // Banking a score that still loses is worth nothing at all.
    const bankWins = mustBeat === null || total > mustBeat;
    const bankValue = canBank && bankWins ? total : Number.NEGATIVE_INFINITY;

    const keep = indicesFor(dice, option);

    let action: "roll" | "bank";
    if (skill === "easy") {
      // Ignores the odds entirely: bank as soon as it has a cushion.
      action = canBank && bankWins && total >= EASY_BANK_AT ? "bank" : "roll";
    } else {
      action = bankValue >= rollValue ? "bank" : "roll";
    }

    const score = action === "bank" ? bankValue : rollValue;
    if (best === null || score > best.score) {
      best = { score, decision: { keep, action } };
    }
  }

  if (best === null) {
    // Every line was worthless — take the highest-scoring dice and roll on,
    // which is the only move that can still change anything.
    return { keep: indicesFor(dice, first), action: "roll" };
  }
  return best.decision;
}

/** How long the bot appears to think, so the table has a human rhythm. */
export function thinkingTime(skill: BotSkill): number {
  const base = skill === "easy" ? 700 : 900;
  return base + Math.floor(Math.random() * 900);
}
