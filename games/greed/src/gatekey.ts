import type { Ruleset } from "@greed/rules";

/**
 * A stable key for "which combinations can fire under these rules".
 *
 * The bot caches an expected-value table per ruleset, and two rulesets that
 * gate identically share one table even if their point values differ.
 */
export function comboGateKeyFor(rules: Ruleset): string {
  return [
    rules.faces.map((scores) => scores.map((points) => (points > 0 ? "1" : "0")).join("")).join(","),
    rules.straight !== null && rules.straight > 0,
    rules.threePairs !== null && rules.threePairs > 0,
    rules.twoTriplets !== null && rules.twoTriplets > 0,
    rules.fourPlusPair !== null && rules.fourPlusPair > 0,
    // Point values matter to expected value, unlike to bust chance.
    rules.faces.map((scores) => scores.join("-")).join(","),
    rules.straight,
  ].join("|");
}
