# @greed/rules

The scoring engine for Greed. Pure, dependency-free, and shared by the
server, the browser client and the bot — so there is exactly one definition
of what a roll is worth.

## Usage

```ts
import { scoreSelection, enumerateOptions, DEFAULT_RULESET } from "@greed/rules";

scoreSelection([1, 1, 1, 5, 5, 5], DEFAULT_RULESET);
// { valid: true, points: 2500, breakdown: [ { kind: "two-triplets", ... } ] }

enumerateOptions([1, 2, 3, 4, 5, 6], DEFAULT_RULESET)[0];
// { points: 1500, diceUsed: 6, ... }
```

## How scoring works

Scoring is **not** a priority-ordered application of rules. With two-triplets
enabled, `1,1,1,5,5,5` reads either as two triplets (2500) or as three 1s plus
three 5s (1500), and any fixed ordering gets some configuration wrong.

Instead, `applicableCombos` produces every combination that fits inside the
selection, and `bestPartition` searches all ways of covering the dice with
those combinations, taking the maximum. Memoized on the count vector. With at
most six dice this is microseconds, and it is correct by construction rather
than by case analysis.

A selection is invalid when no partition covers every die. That is what stops
a player setting aside a dead die to hold dice back from the next roll.

## Combination definitions

- **three-pairs** — three *distinct* faces showing exactly two each. Four of a
  kind plus a pair is not three pairs, and neither is six of a kind.
- **two-triplets** — two *distinct* faces showing three each. Six of a kind is
  not two triplets.
- **four-plus-pair** — one face showing four, another showing two. Off by
  default.

## Probabilities

Bust probabilities are computed from the active ruleset, not hardcoded —
enabling three-pairs genuinely makes six dice safer. Under the default ruleset
1080 of the 46,656 six-dice rolls bust (2.3148%); under the minimal ruleset,
1440. Both are pinned as tests.
