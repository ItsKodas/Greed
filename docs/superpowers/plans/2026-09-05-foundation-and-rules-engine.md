# Foundation and Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the npm workspace scaffold and a dependency-free, exhaustively tested Greed scoring engine that the server, client and bot will all share.

**Architecture:** All scoring reduces to operations on a six-element count vector (dice tallied by face). Combinations are enumerated as `Combo` values that each declare the counts they consume, and scoring a selection is a memoized search for the maximum-value partition of those counts. This is correct by construction rather than by case analysis, which matters because the ruleset is configurable and no fixed rule ordering scores every configuration correctly.

**Tech Stack:** TypeScript (strict), npm workspaces, Vitest. `packages/rules` has **zero runtime dependencies** — this is a hard constraint, not a preference.

**Spec:** `docs/superpowers/specs/2026-09-05-greed-multiplayer-design.md`

> **Status: executed.** The whole-branch review after Task 7 hardened several
> things this plan's code blocks predate — `readonly` types on everything the
> package returns, a uniform `points > 0` gate on every combination, and a
> bust-cache key derived from the combo gates rather than raw field values.
> Git history is authoritative; read these blocks as the plan of record, not
> as the current source.

## Global Constraints

- `packages/rules` must have **zero runtime dependencies**. Dev dependencies are fine. The server, browser client and bot all import it.
- Every function in `packages/rules` is **pure**: no I/O, no `Date`, no `Math.random`, no mutation of arguments. The one permitted piece of state is the module-level bust-probability cache, which is a pure memo.
- TypeScript `strict: true`. No `any`. No non-null assertions (`!`) — narrow properly.
- ESM throughout (`"type": "module"`). Relative imports carry a `.js` extension, which is what TypeScript requires for ESM resolution even though the source is `.ts`.
- Package names are scoped `@greed/*`.
- Face values are always `Die = 1 | 2 | 3 | 4 | 5 | 6`. Count vectors are always index-0-is-face-1.
- Commit after every task. Conventional-commit prefixes (`chore:`, `feat:`, `test:`, `fix:`).

## Definitions

Three combinations span multiple faces and need exact definitions, because "three pairs" is ambiguous in the wild:

- **three-pairs** — exactly three *distinct* faces each appearing twice. `2,2,3,3,4,4` qualifies. `2,2,2,2,3,3` does not (that is `fourPlusPair`). `2,2,2,2,2,2` does not.
- **two-triplets** — two *distinct* faces each appearing three times. Six of a kind is not two triplets.
- **four-plus-pair** — one face appearing four times plus a different face appearing twice.

---

### Task 1: Workspace scaffold, types, and rulesets

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.editorconfig`
- Create: `packages/rules/package.json`
- Create: `packages/rules/tsconfig.json`
- Create: `packages/rules/src/types.ts`
- Create: `packages/rules/src/rulesets.ts`
- Test: `packages/rules/src/rulesets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Die`, `Counts`, `ComboKind`, `Combo`, `ScoreResult`, `Option`, `NOfAKindMode`, `FarklePenalty`, `Ruleset` from `./types.js`; `DEFAULT_RULESET`, `MINIMAL_RULESET` from `./rulesets.js`.

- [ ] **Step 1: Create the root workspace files**

`package.json`:

```json
{
  "name": "greed",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --build"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  }
}
```

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./packages/rules" }]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
  },
});
```

`.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
```

- [ ] **Step 2: Install the toolchain**

Run from the repo root:

```bash
npm install -D typescript vitest @types/node
```

Do not pin versions by hand — take whatever npm resolves and let it write the lockfile.

- [ ] **Step 3: Create the rules package manifest**

`packages/rules/package.json`. Note there is no `dependencies` key at all, and no build step — the package exports TypeScript source directly, which Vitest and the eventual Vite/server bundlers all consume natively. This keeps the inner loop fast and avoids a build ordering problem between workspaces.

```json
{
  "name": "@greed/rules",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

`packages/rules/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

Now run install again, from the repo root:

```bash
npm install
```

This is not redundant. Step 2's install ran before this workspace existed, so
the lockfile has no record of it and `npm ci` would not link
`node_modules/@greed/rules` — every later package importing the `@greed/rules`
specifier would fail to resolve. No dependency versions change; this only syncs
the lockfile with the workspace graph.

- [ ] **Step 4: Write the failing test**

`packages/rules/src/rulesets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, MINIMAL_RULESET } from "./rulesets.js";

describe("DEFAULT_RULESET", () => {
  it("matches the classic house rules", () => {
    expect(DEFAULT_RULESET.targetScore).toBe(10_000);
    expect(DEFAULT_RULESET.entryThreshold).toBe(500);
    expect(DEFAULT_RULESET.singleOne).toBe(100);
    expect(DEFAULT_RULESET.singleFive).toBe(50);
    expect(DEFAULT_RULESET.tripleOne).toBe(1000);
    expect(DEFAULT_RULESET.tripleMultiplier).toBe(100);
    expect(DEFAULT_RULESET.nOfAKind).toBe("double");
  });

  it("enables straights, three pairs and two triplets", () => {
    expect(DEFAULT_RULESET.straight).toBe(1500);
    expect(DEFAULT_RULESET.threePairs).toBe(750);
    expect(DEFAULT_RULESET.twoTriplets).toBe(2500);
  });

  it("leaves the punishing options off", () => {
    expect(DEFAULT_RULESET.fourPlusPair).toBeNull();
    expect(DEFAULT_RULESET.farklePenalty).toBeNull();
  });

  it("is frozen so a lobby cannot mutate the shared default", () => {
    expect(Object.isFrozen(DEFAULT_RULESET)).toBe(true);
  });
});

describe("MINIMAL_RULESET", () => {
  it("scores only ones, fives and n-of-a-kind", () => {
    expect(MINIMAL_RULESET.straight).toBeNull();
    expect(MINIMAL_RULESET.threePairs).toBeNull();
    expect(MINIMAL_RULESET.twoTriplets).toBeNull();
    expect(MINIMAL_RULESET.fourPlusPair).toBeNull();
  });

  it("keeps the same core values as the default", () => {
    expect(MINIMAL_RULESET.singleOne).toBe(DEFAULT_RULESET.singleOne);
    expect(MINIMAL_RULESET.tripleOne).toBe(DEFAULT_RULESET.tripleOne);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -- rulesets`
Expected: FAIL — cannot resolve `./rulesets.js`.

- [ ] **Step 6: Write the types**

`packages/rules/src/types.ts`:

```ts
/** A single die face. */
export type Die = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Dice tallied by face. Index 0 is face 1, index 5 is face 6.
 * Every scoring operation in this package works on this shape.
 */
export type Counts = [number, number, number, number, number, number];

export type ComboKind =
  | "single-one"
  | "single-five"
  | "triple"
  | "four-kind"
  | "five-kind"
  | "six-kind"
  | "straight"
  | "three-pairs"
  | "two-triplets"
  | "four-plus-pair";

/** One scoring combination, and exactly which dice it consumes. */
export interface Combo {
  kind: ComboKind;
  /** The face this combo is built from, or null when it spans faces. */
  face: Die | null;
  points: number;
  counts: Counts;
}

export interface ScoreResult {
  /** False when some selected die cannot belong to any combination. */
  valid: boolean;
  points: number;
  /** The highest-scoring partition, for explaining the score in the UI. */
  breakdown: Combo[];
}

/** One legal way to set dice aside from a roll. */
export interface Option {
  counts: Counts;
  points: number;
  diceUsed: number;
  breakdown: Combo[];
}

export type NOfAKindMode = "double" | "flat";

export interface FarklePenalty {
  consecutive: number;
  points: number;
}

export interface Ruleset {
  targetScore: number;
  entryThreshold: number;
  finalRound: boolean;
  turnTimerSeconds: number | null;

  singleOne: number;
  singleFive: number;
  tripleOne: number;
  /** Three of a kind of face N scores N * this, except face 1 (see tripleOne). */
  tripleMultiplier: number;

  nOfAKind: NOfAKindMode;
  flatFour: number;
  flatFive: number;
  flatSix: number;

  straight: number | null;
  threePairs: number | null;
  twoTriplets: number | null;
  fourPlusPair: number | null;

  farklePenalty: FarklePenalty | null;
}
```

- [ ] **Step 7: Write the rulesets**

`packages/rules/src/rulesets.ts`:

```ts
import type { Ruleset } from "./types.js";

/** The classic house rules. Frozen: lobbies spread it, they never mutate it. */
export const DEFAULT_RULESET: Ruleset = Object.freeze({
  targetScore: 10_000,
  entryThreshold: 500,
  finalRound: true,
  turnTimerSeconds: 60,

  singleOne: 100,
  singleFive: 50,
  tripleOne: 1000,
  tripleMultiplier: 100,

  nOfAKind: "double",
  flatFour: 1000,
  flatFive: 2000,
  flatSix: 3000,

  straight: 1500,
  threePairs: 750,
  twoTriplets: 2500,
  fourPlusPair: null,

  farklePenalty: null,
});

/**
 * Ones, fives and n-of-a-kind only. The smallest ruleset the game supports,
 * and the baseline the probability invariants are measured against.
 */
export const MINIMAL_RULESET: Ruleset = Object.freeze({
  ...DEFAULT_RULESET,
  straight: null,
  threePairs: null,
  twoTriplets: null,
  fourPlusPair: null,
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- rulesets`
Expected: PASS, 6 tests.

- [ ] **Step 9: Verify typechecking works**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold workspace and add rules types and rulesets"
```

---

### Task 2: Count-vector helpers

**Files:**
- Create: `packages/rules/src/counts.ts`
- Test: `packages/rules/src/counts.test.ts`

**Interfaces:**
- Consumes: `Counts`, `Die` from `./types.js`.
- Produces, all from `./counts.js`:
  - `emptyCounts(): Counts`
  - `toCounts(dice: readonly Die[]): Counts`
  - `fromCounts(counts: Counts): Die[]`
  - `totalDice(counts: Counts): number`
  - `contains(haystack: Counts, needle: Counts): boolean`
  - `subtract(from: Counts, taken: Counts): Counts`
  - `countsKey(counts: Counts): string`
  - `facesWithAtLeast(counts: Counts, n: number): Die[]`
  - `combinations<T>(items: readonly T[], k: number): T[][]`

- [ ] **Step 1: Write the failing test**

`packages/rules/src/counts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  combinations,
  contains,
  countsKey,
  emptyCounts,
  facesWithAtLeast,
  fromCounts,
  subtract,
  toCounts,
  totalDice,
} from "./counts.js";

describe("toCounts", () => {
  it("tallies dice by face with index 0 as face 1", () => {
    expect(toCounts([1, 1, 3, 6])).toEqual([2, 0, 1, 0, 0, 1]);
  });

  it("returns all zeros for no dice", () => {
    expect(toCounts([])).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("does not mutate its argument", () => {
    const dice = [1, 2, 3] as const;
    toCounts(dice);
    expect(dice).toEqual([1, 2, 3]);
  });
});

describe("fromCounts", () => {
  it("expands counts back into ascending dice", () => {
    expect(fromCounts([2, 0, 1, 0, 0, 1])).toEqual([1, 1, 3, 6]);
  });

  it("round-trips with toCounts", () => {
    expect(fromCounts(toCounts([5, 2, 5, 1]))).toEqual([1, 2, 5, 5]);
  });
});

describe("totalDice", () => {
  it("sums the vector", () => {
    expect(totalDice([1, 2, 0, 0, 3, 0])).toBe(6);
    expect(totalDice(emptyCounts())).toBe(0);
  });
});

describe("contains", () => {
  it("is true when every face has enough dice", () => {
    expect(contains([2, 0, 1, 0, 0, 1], [1, 0, 1, 0, 0, 0])).toBe(true);
  });

  it("is true for an exact match", () => {
    expect(contains([2, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0])).toBe(true);
  });

  it("is false when any face is short", () => {
    expect(contains([1, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0])).toBe(false);
  });
});

describe("subtract", () => {
  it("removes counts face by face", () => {
    expect(subtract([2, 0, 1, 0, 0, 1], [1, 0, 1, 0, 0, 0])).toEqual([1, 0, 0, 0, 0, 1]);
  });

  it("does not mutate either argument", () => {
    const from: [number, number, number, number, number, number] = [2, 0, 0, 0, 0, 0];
    const taken: [number, number, number, number, number, number] = [1, 0, 0, 0, 0, 0];
    subtract(from, taken);
    expect(from).toEqual([2, 0, 0, 0, 0, 0]);
    expect(taken).toEqual([1, 0, 0, 0, 0, 0]);
  });
});

describe("countsKey", () => {
  it("is stable and distinguishes different vectors", () => {
    expect(countsKey([1, 0, 0, 0, 0, 0])).toBe(countsKey([1, 0, 0, 0, 0, 0]));
    expect(countsKey([1, 0, 0, 0, 0, 0])).not.toBe(countsKey([0, 1, 0, 0, 0, 0]));
  });
});

describe("facesWithAtLeast", () => {
  it("returns faces meeting the threshold, ascending", () => {
    expect(facesWithAtLeast([2, 3, 0, 1, 2, 0], 2)).toEqual([1, 2, 5]);
  });

  it("returns nothing when no face qualifies", () => {
    expect(facesWithAtLeast([1, 1, 1, 1, 1, 1], 2)).toEqual([]);
  });
});

describe("combinations", () => {
  it("returns every k-subset in order", () => {
    expect(combinations([1, 2, 3], 2)).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
  });

  it("returns one empty combination for k of 0", () => {
    expect(combinations([1, 2], 0)).toEqual([[]]);
  });

  it("returns nothing when k exceeds the input length", () => {
    expect(combinations([1, 2], 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- counts`
Expected: FAIL — cannot resolve `./counts.js`.

- [ ] **Step 3: Write the implementation**

`packages/rules/src/counts.ts`:

```ts
import type { Counts, Die } from "./types.js";

export function emptyCounts(): Counts {
  return [0, 0, 0, 0, 0, 0];
}

export function toCounts(dice: readonly Die[]): Counts {
  const counts = emptyCounts();
  for (const die of dice) {
    counts[die - 1] += 1;
  }
  return counts;
}

export function fromCounts(counts: Counts): Die[] {
  const dice: Die[] = [];
  for (let index = 0; index < 6; index += 1) {
    for (let n = 0; n < counts[index]; n += 1) {
      dice.push((index + 1) as Die);
    }
  }
  return dice;
}

export function totalDice(counts: Counts): number {
  return counts[0] + counts[1] + counts[2] + counts[3] + counts[4] + counts[5];
}

/** True when `haystack` has at least as many of every face as `needle`. */
export function contains(haystack: Counts, needle: Counts): boolean {
  for (let index = 0; index < 6; index += 1) {
    if (needle[index] > haystack[index]) {
      return false;
    }
  }
  return true;
}

export function subtract(from: Counts, taken: Counts): Counts {
  return [
    from[0] - taken[0],
    from[1] - taken[1],
    from[2] - taken[2],
    from[3] - taken[3],
    from[4] - taken[4],
    from[5] - taken[5],
  ];
}

/** Memoization key. Count vectors are fixed-length, so join is unambiguous. */
export function countsKey(counts: Counts): string {
  return counts.join(",");
}

export function facesWithAtLeast(counts: Counts, n: number): Die[] {
  const faces: Die[] = [];
  for (let index = 0; index < 6; index += 1) {
    if (counts[index] >= n) {
      faces.push((index + 1) as Die);
    }
  }
  return faces;
}

/** Every k-subset of `items`, preserving input order within each subset. */
export function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) {
    return [[]];
  }
  if (k > items.length) {
    return [];
  }
  const result: T[][] = [];
  const build = (start: number, chosen: T[]): void => {
    if (chosen.length === k) {
      result.push([...chosen]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      chosen.push(items[index] as T);
      build(index + 1, chosen);
      chosen.pop();
    }
  };
  build(0, []);
  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- counts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/counts.ts packages/rules/src/counts.test.ts
git commit -m "feat: add count-vector helpers for the rules engine"
```

---

### Task 3: Combination enumeration

This produces every combination that *fits inside* a given count vector. It does not decide which to use — that is Task 4's job.

**Files:**
- Create: `packages/rules/src/combos.ts`
- Test: `packages/rules/src/combos.test.ts`

**Interfaces:**
- Consumes: `contains`, `combinations`, `emptyCounts`, `facesWithAtLeast` from `./counts.js`; `Combo`, `Counts`, `Die`, `Ruleset` from `./types.js`; `DEFAULT_RULESET`, `MINIMAL_RULESET` from `./rulesets.js`.
- Produces: `applicableCombos(counts: Counts, rules: Ruleset): Combo[]` from `./combos.js`.

- [ ] **Step 1: Write the failing test**

`packages/rules/src/combos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applicableCombos } from "./combos.js";
import { toCounts } from "./counts.js";
import { DEFAULT_RULESET, MINIMAL_RULESET } from "./rulesets.js";
import type { ComboKind, Die, Ruleset } from "./types.js";

function kindsFor(dice: Die[], rules: Ruleset = DEFAULT_RULESET): ComboKind[] {
  return applicableCombos(toCounts(dice), rules).map((combo) => combo.kind);
}

function pointsFor(dice: Die[], kind: ComboKind, rules: Ruleset = DEFAULT_RULESET): number {
  const combo = applicableCombos(toCounts(dice), rules).find((c) => c.kind === kind);
  if (combo === undefined) {
    throw new Error(`no ${kind} combo found`);
  }
  return combo.points;
}

describe("singles", () => {
  it("offers a single one", () => {
    expect(kindsFor([1])).toEqual(["single-one"]);
    expect(pointsFor([1], "single-one")).toBe(100);
  });

  it("offers a single five", () => {
    expect(kindsFor([5])).toEqual(["single-five"]);
    expect(pointsFor([5], "single-five")).toBe(50);
  });

  it("offers nothing for a lone non-scoring die", () => {
    expect(kindsFor([3])).toEqual([]);
  });
});

describe("n-of-a-kind", () => {
  it("scores three ones at tripleOne", () => {
    expect(pointsFor([1, 1, 1], "triple")).toBe(1000);
  });

  it("scores three of a non-one at face times the multiplier", () => {
    expect(pointsFor([4, 4, 4], "triple")).toBe(400);
  });

  it("doubles for four, quadruples for five, octuples for six", () => {
    expect(pointsFor([2, 2, 2, 2], "four-kind")).toBe(400);
    expect(pointsFor([2, 2, 2, 2, 2], "five-kind")).toBe(800);
    expect(pointsFor([2, 2, 2, 2, 2, 2], "six-kind")).toBe(1600);
  });

  it("uses flat values when the ruleset says so", () => {
    const flat: Ruleset = { ...DEFAULT_RULESET, nOfAKind: "flat" };
    expect(pointsFor([2, 2, 2, 2], "four-kind", flat)).toBe(1000);
    expect(pointsFor([2, 2, 2, 2, 2], "five-kind", flat)).toBe(2000);
    expect(pointsFor([2, 2, 2, 2, 2, 2], "six-kind", flat)).toBe(3000);
  });

  it("offers every n-of-a-kind up to the count available", () => {
    const kinds = kindsFor([3, 3, 3, 3]);
    expect(kinds).toContain("triple");
    expect(kinds).toContain("four-kind");
  });
});

describe("multi-face combinations", () => {
  it("offers a straight only for one of each face", () => {
    expect(kindsFor([1, 2, 3, 4, 5, 6])).toContain("straight");
    expect(kindsFor([1, 2, 3, 4, 5, 5])).not.toContain("straight");
  });

  it("offers three pairs for three distinct doubled faces", () => {
    expect(kindsFor([2, 2, 3, 3, 4, 4])).toContain("three-pairs");
  });

  it("does not call four of a kind plus a pair three pairs", () => {
    expect(kindsFor([2, 2, 2, 2, 3, 3])).not.toContain("three-pairs");
  });

  it("does not call six of a kind three pairs", () => {
    expect(kindsFor([2, 2, 2, 2, 2, 2])).not.toContain("three-pairs");
  });

  it("offers two triplets for two distinct tripled faces", () => {
    expect(kindsFor([2, 2, 2, 3, 3, 3])).toContain("two-triplets");
  });

  it("does not call six of a kind two triplets", () => {
    expect(kindsFor([2, 2, 2, 2, 2, 2])).not.toContain("two-triplets");
  });

  it("offers four plus a pair only when the rule is enabled", () => {
    expect(kindsFor([2, 2, 2, 2, 3, 3])).not.toContain("four-plus-pair");
    const withRule: Ruleset = { ...DEFAULT_RULESET, fourPlusPair: 1500 };
    expect(kindsFor([2, 2, 2, 2, 3, 3], withRule)).toContain("four-plus-pair");
  });
});

describe("ruleset gating", () => {
  it("omits disabled multi-face combinations", () => {
    const kinds = kindsFor([1, 2, 3, 4, 5, 6], MINIMAL_RULESET);
    expect(kinds).not.toContain("straight");
    expect(kinds).not.toContain("three-pairs");
  });
});

describe("combo shape", () => {
  it("declares exactly the dice it consumes", () => {
    const combos = applicableCombos(toCounts([1, 1, 1]), DEFAULT_RULESET);
    const triple = combos.find((combo) => combo.kind === "triple");
    expect(triple?.counts).toEqual([3, 0, 0, 0, 0, 0]);
  });

  it("names the face for single-face combos and leaves it null otherwise", () => {
    const combos = applicableCombos(toCounts([2, 2, 3, 3, 4, 4]), DEFAULT_RULESET);
    expect(combos.find((combo) => combo.kind === "three-pairs")?.face).toBeNull();
    const triples = applicableCombos(toCounts([4, 4, 4]), DEFAULT_RULESET);
    expect(triples.find((combo) => combo.kind === "triple")?.face).toBe(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- combos`
Expected: FAIL — cannot resolve `./combos.js`.

- [ ] **Step 3: Write the implementation**

`packages/rules/src/combos.ts`:

```ts
import { combinations, contains, emptyCounts, facesWithAtLeast } from "./counts.js";
import type { Combo, ComboKind, Counts, Die, Ruleset } from "./types.js";

const STRAIGHT: Counts = [1, 1, 1, 1, 1, 1];

function singleCombo(face: 1 | 5, points: number): Combo {
  const counts = emptyCounts();
  counts[face - 1] = 1;
  return {
    kind: face === 1 ? "single-one" : "single-five",
    face,
    points,
    counts,
  };
}

function nOfAKindPoints(face: Die, n: number, rules: Ruleset): number {
  const triple = face === 1 ? rules.tripleOne : face * rules.tripleMultiplier;
  if (n === 3) {
    return triple;
  }
  if (rules.nOfAKind === "flat") {
    if (n === 4) return rules.flatFour;
    if (n === 5) return rules.flatFive;
    return rules.flatSix;
  }
  if (n === 4) return triple * 2;
  if (n === 5) return triple * 4;
  return triple * 8;
}

function nOfAKindKind(n: number): ComboKind {
  if (n === 3) return "triple";
  if (n === 4) return "four-kind";
  if (n === 5) return "five-kind";
  return "six-kind";
}

function nOfAKindCombo(face: Die, n: number, rules: Ruleset): Combo {
  const counts = emptyCounts();
  counts[face - 1] = n;
  return {
    kind: nOfAKindKind(n),
    face,
    points: nOfAKindPoints(face, n, rules),
    counts,
  };
}

/**
 * Every combination that fits inside `counts` under `rules`.
 *
 * This deliberately over-produces: for four 2s it offers both the triple and
 * the four-of-a-kind. Choosing between them is the partition search's job,
 * because the best choice depends on what the remaining dice can do.
 */
export function applicableCombos(counts: Counts, rules: Ruleset): Combo[] {
  const combos: Combo[] = [];

  if (rules.singleOne > 0 && counts[0] >= 1) {
    combos.push(singleCombo(1, rules.singleOne));
  }
  if (rules.singleFive > 0 && counts[4] >= 1) {
    combos.push(singleCombo(5, rules.singleFive));
  }

  for (let index = 0; index < 6; index += 1) {
    const face = (index + 1) as Die;
    for (let n = 3; n <= counts[index]; n += 1) {
      combos.push(nOfAKindCombo(face, n, rules));
    }
  }

  const { straight, threePairs, twoTriplets, fourPlusPair } = rules;

  if (straight !== null && contains(counts, STRAIGHT)) {
    combos.push({ kind: "straight", face: null, points: straight, counts: [...STRAIGHT] });
  }

  if (threePairs !== null) {
    // Exactly three distinct faces showing exactly two each. A face showing
    // four or more is not two pairs; that is what fourPlusPair is for.
    const paired = facesWithAtLeast(counts, 2).filter((face) => counts[face - 1] < 4);
    for (const trio of combinations(paired, 3)) {
      const comboCounts = emptyCounts();
      for (const face of trio) {
        comboCounts[face - 1] = 2;
      }
      combos.push({ kind: "three-pairs", face: null, points: threePairs, counts: comboCounts });
    }
  }

  if (twoTriplets !== null) {
    const tripled = facesWithAtLeast(counts, 3);
    for (const pair of combinations(tripled, 2)) {
      const comboCounts = emptyCounts();
      for (const face of pair) {
        comboCounts[face - 1] = 3;
      }
      combos.push({ kind: "two-triplets", face: null, points: twoTriplets, counts: comboCounts });
    }
  }

  if (fourPlusPair !== null) {
    for (const quad of facesWithAtLeast(counts, 4)) {
      for (const pair of facesWithAtLeast(counts, 2)) {
        if (pair === quad) {
          continue;
        }
        const comboCounts = emptyCounts();
        comboCounts[quad - 1] = 4;
        comboCounts[pair - 1] = 2;
        combos.push({
          kind: "four-plus-pair",
          face: null,
          points: fourPlusPair,
          counts: comboCounts,
        });
      }
    }
  }

  return combos;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- combos`
Expected: PASS, 18 tests.

Note the `counts[face - 1] < 4` filter in the three-pairs branch — that is what makes the "four of a kind plus a pair is not three pairs" and "six of a kind is not three pairs" tests pass. If those two tests fail, that filter is the reason.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/combos.ts packages/rules/src/combos.test.ts
git commit -m "feat: enumerate applicable scoring combinations"
```

---

### Task 4: Maximum-partition scoring

**Files:**
- Create: `packages/rules/src/score.ts`
- Test: `packages/rules/src/score.test.ts`

**Interfaces:**
- Consumes: `applicableCombos` from `./combos.js`; `countsKey`, `subtract`, `toCounts`, `totalDice` from `./counts.js`; `Combo`, `Counts`, `Die`, `Ruleset`, `ScoreResult` from `./types.js`.
- Produces from `./score.ts`:
  - `scoreSelection(dice: readonly Die[], rules: Ruleset): ScoreResult` — public.
  - `bestPartition(counts: Counts, rules: Ruleset, memo: Map<string, Partition | null>): Partition | null` — internal, used by Task 6. Not re-exported from the package index.
  - `interface Partition { points: number; breakdown: Combo[] }` — internal.

- [ ] **Step 1: Write the failing test**

`packages/rules/src/score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, MINIMAL_RULESET } from "./rulesets.js";
import { scoreSelection } from "./score.js";
import type { Ruleset } from "./types.js";

describe("validity", () => {
  it("rejects an empty selection", () => {
    const result = scoreSelection([], DEFAULT_RULESET);
    expect(result.valid).toBe(false);
    expect(result.points).toBe(0);
  });

  it("rejects a selection containing a die that cannot score", () => {
    expect(scoreSelection([1, 3], DEFAULT_RULESET).valid).toBe(false);
  });

  it("accepts a selection where every die is consumed", () => {
    expect(scoreSelection([1, 5], DEFAULT_RULESET).valid).toBe(true);
  });

  it("rejects a lone non-scoring die", () => {
    expect(scoreSelection([4], DEFAULT_RULESET).valid).toBe(false);
  });
});

describe("basic scoring", () => {
  it("adds singles", () => {
    expect(scoreSelection([1, 1, 5], DEFAULT_RULESET).points).toBe(250);
  });

  it("scores a triple of ones", () => {
    expect(scoreSelection([1, 1, 1], DEFAULT_RULESET).points).toBe(1000);
  });

  it("scores a straight", () => {
    expect(scoreSelection([1, 2, 3, 4, 5, 6], DEFAULT_RULESET).points).toBe(1500);
  });
});

describe("maximum partition", () => {
  it("prefers two triplets over two separate triples", () => {
    // Two triplets is 2500; three 1s plus three 5s is 1000 + 500 = 1500.
    expect(scoreSelection([1, 1, 1, 5, 5, 5], DEFAULT_RULESET).points).toBe(2500);
  });

  it("falls back to separate triples when two triplets is disabled", () => {
    const rules: Ruleset = { ...DEFAULT_RULESET, twoTriplets: null };
    expect(scoreSelection([1, 1, 1, 5, 5, 5], rules).points).toBe(1500);
  });

  it("prefers four of a kind over a triple plus a single", () => {
    // Four 1s: 1000 * 2 = 2000, versus 1000 + 100 = 1100.
    expect(scoreSelection([1, 1, 1, 1], DEFAULT_RULESET).points).toBe(2000);
  });

  it("prefers a triple plus singles when that scores higher", () => {
    // Three 2s (200) plus two 1s (200) = 400. No larger partition exists.
    expect(scoreSelection([2, 2, 2, 1, 1], DEFAULT_RULESET).points).toBe(400);
  });

  it("prefers three pairs over the singles inside it", () => {
    // Three pairs is 750; the 1s and 5s alone would be 100+100+50+50 = 300,
    // and that partition also leaves the 3s dead, so it is not even valid.
    expect(scoreSelection([1, 1, 3, 3, 5, 5], DEFAULT_RULESET).points).toBe(750);
  });

  it("prefers a straight over the singles inside it", () => {
    const rules: Ruleset = { ...DEFAULT_RULESET, straight: 1500 };
    expect(scoreSelection([1, 2, 3, 4, 5, 6], rules).points).toBe(1500);
  });

  it("prefers six of a kind over two triplets of the same face", () => {
    // Six 2s: triple 200 * 8 = 1600. Two triplets requires distinct faces,
    // so it does not apply here at all.
    expect(scoreSelection([2, 2, 2, 2, 2, 2], DEFAULT_RULESET).points).toBe(1600);
  });

  it("scores five of a kind plus a scoring single", () => {
    // Five 2s (200 * 4 = 800) plus a single 1 (100).
    expect(scoreSelection([2, 2, 2, 2, 2, 1], DEFAULT_RULESET).points).toBe(900);
  });
});

describe("breakdown", () => {
  it("reports the combinations that produced the score", () => {
    const result = scoreSelection([1, 1, 1, 5], DEFAULT_RULESET);
    expect(result.points).toBe(1050);
    const kinds = result.breakdown.map((combo) => combo.kind).sort();
    expect(kinds).toEqual(["single-five", "triple"]);
  });

  it("produces a breakdown consuming exactly the selected dice", () => {
    const result = scoreSelection([1, 1, 5, 5], DEFAULT_RULESET);
    const consumed = result.breakdown.reduce(
      (total, combo) => total + combo.counts.reduce((sum, n) => sum + n, 0),
      0,
    );
    expect(consumed).toBe(4);
  });
});

describe("minimal ruleset", () => {
  it("does not score a straight", () => {
    // 1 and 5 score; 2, 3, 4 and 6 are dead, so the selection is invalid.
    expect(scoreSelection([1, 2, 3, 4, 5, 6], MINIMAL_RULESET).valid).toBe(false);
  });

  it("still scores ones and fives", () => {
    expect(scoreSelection([1, 5], MINIMAL_RULESET).points).toBe(150);
  });
});

describe("purity", () => {
  it("does not mutate the dice passed in", () => {
    const dice = [1, 1, 1, 5, 5, 5] as const;
    scoreSelection(dice, DEFAULT_RULESET);
    expect(dice).toEqual([1, 1, 1, 5, 5, 5]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- score`
Expected: FAIL — cannot resolve `./score.js`.

- [ ] **Step 3: Write the implementation**

`packages/rules/src/score.ts`:

```ts
import { applicableCombos } from "./combos.js";
import { countsKey, subtract, toCounts, totalDice } from "./counts.js";
import type { Combo, Counts, Die, Ruleset, ScoreResult } from "./types.js";

export interface Partition {
  points: number;
  breakdown: Combo[];
}

/**
 * The highest-scoring way to cover `counts` entirely with combinations,
 * or null when no such covering exists (some die cannot score).
 *
 * Every combination consumes at least one die, so the recursion strictly
 * decreases and cannot cycle. The memo is keyed on the count vector, which
 * is why callers may share one across an enumeration.
 */
export function bestPartition(
  counts: Counts,
  rules: Ruleset,
  memo: Map<string, Partition | null>,
): Partition | null {
  if (totalDice(counts) === 0) {
    return { points: 0, breakdown: [] };
  }

  const key = countsKey(counts);
  const cached = memo.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let best: Partition | null = null;
  for (const combo of applicableCombos(counts, rules)) {
    const rest = bestPartition(subtract(counts, combo.counts), rules, memo);
    if (rest === null) {
      continue;
    }
    const points = combo.points + rest.points;
    if (best === null || points > best.points) {
      best = { points, breakdown: [combo, ...rest.breakdown] };
    }
  }

  memo.set(key, best);
  return best;
}

/**
 * Score a set of dice a player wants to set aside.
 *
 * The selection must be fully scoring: every die has to belong to some
 * combination. This is what stops a player keeping a dead die to hold more
 * dice back from the next roll.
 */
export function scoreSelection(dice: readonly Die[], rules: Ruleset): ScoreResult {
  if (dice.length === 0) {
    return { valid: false, points: 0, breakdown: [] };
  }
  const partition = bestPartition(toCounts(dice), rules, new Map());
  if (partition === null) {
    return { valid: false, points: 0, breakdown: [] };
  }
  return { valid: true, points: partition.points, breakdown: partition.breakdown };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- score`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/score.ts packages/rules/src/score.test.ts
git commit -m "feat: score selections by maximum-partition search"
```

---

### Task 5: Farkle detection and bust probabilities

**Files:**
- Create: `packages/rules/src/probability.ts`
- Test: `packages/rules/src/probability.test.ts`

**Interfaces:**
- Consumes: `applicableCombos` from `./combos.js`; `toCounts` from `./counts.js`; `Die`, `Ruleset` from `./types.js`.
- Produces from `./probability.ts`:
  - `hasAnyScore(dice: readonly Die[], rules: Ruleset): boolean`
  - `type BustTable = readonly [number, number, number, number, number, number]` — index 0 is one die remaining, index 5 is six.
  - `bustProbabilities(rules: Ruleset): BustTable`
  - `bustProbability(diceRemaining: number, rules: Ruleset): number`
  - `countBustingRolls(diceCount: number, rules: Ruleset): number`

- [ ] **Step 1: Write the failing test**

`packages/rules/src/probability.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  bustProbabilities,
  bustProbability,
  countBustingRolls,
  hasAnyScore,
} from "./probability.js";
import { DEFAULT_RULESET, MINIMAL_RULESET } from "./rulesets.js";

describe("hasAnyScore", () => {
  it("is true when a one is present", () => {
    expect(hasAnyScore([1, 2, 3], DEFAULT_RULESET)).toBe(true);
  });

  it("is true when a five is present", () => {
    expect(hasAnyScore([5, 2, 3], DEFAULT_RULESET)).toBe(true);
  });

  it("is true for a triple with no ones or fives", () => {
    expect(hasAnyScore([2, 2, 2], DEFAULT_RULESET)).toBe(true);
  });

  it("is false for a roll with nothing scoring", () => {
    expect(hasAnyScore([2, 3, 4], DEFAULT_RULESET)).toBe(false);
  });

  it("is false for no dice", () => {
    expect(hasAnyScore([], DEFAULT_RULESET)).toBe(false);
  });

  it("respects three pairs when enabled", () => {
    expect(hasAnyScore([2, 2, 3, 3, 4, 4], DEFAULT_RULESET)).toBe(true);
    expect(hasAnyScore([2, 2, 3, 3, 4, 4], MINIMAL_RULESET)).toBe(false);
  });
});

describe("countBustingRolls", () => {
  // Faces 2, 3, 4 and 6 are the non-scoring singles. Over six dice there are
  // 4^6 = 4096 rolls using only those, of which the (2,2,2,0) shapes number
  // 4 * 90 = 360 and the (2,2,1,1) shapes number 6 * 180 = 1080. Everything
  // else contains a triple. So 1440 bust without three pairs, and 1080 with
  // it, because three pairs rescues exactly the (2,2,2,0) shapes.
  it("counts 1440 busting six-dice rolls under the minimal ruleset", () => {
    expect(countBustingRolls(6, MINIMAL_RULESET)).toBe(1440);
  });

  it("counts 1080 busting six-dice rolls under the default ruleset", () => {
    expect(countBustingRolls(6, DEFAULT_RULESET)).toBe(1080);
  });

  it("counts four busting one-die rolls", () => {
    expect(countBustingRolls(1, DEFAULT_RULESET)).toBe(4);
  });

  it("counts 16 busting two-dice rolls", () => {
    expect(countBustingRolls(2, DEFAULT_RULESET)).toBe(16);
  });

  it("counts 60 busting three-dice rolls", () => {
    expect(countBustingRolls(3, DEFAULT_RULESET)).toBe(60);
  });

  it("counts 204 busting four-dice rolls", () => {
    expect(countBustingRolls(4, DEFAULT_RULESET)).toBe(204);
  });

  it("counts 600 busting five-dice rolls", () => {
    expect(countBustingRolls(5, DEFAULT_RULESET)).toBe(600);
  });
});

describe("bustProbabilities", () => {
  it("reproduces the classic 2.31% on six dice", () => {
    const table = bustProbabilities(DEFAULT_RULESET);
    expect(table[5]).toBeCloseTo(1080 / 46656, 10);
    expect(table[5]).toBeCloseTo(0.023148, 6);
  });

  it("gives two thirds on a single die", () => {
    expect(bustProbabilities(DEFAULT_RULESET)[0]).toBeCloseTo(2 / 3, 10);
  });

  it("rises monotonically as dice run out", () => {
    const table = bustProbabilities(DEFAULT_RULESET);
    for (let index = 0; index < 5; index += 1) {
      expect(table[index]).toBeGreaterThan(table[index + 1] as number);
    }
  });

  it("returns the same cached table for an equivalent ruleset", () => {
    const first = bustProbabilities(DEFAULT_RULESET);
    const second = bustProbabilities({ ...DEFAULT_RULESET });
    expect(second).toBe(first);
  });

  it("returns a different table when scoring rules differ", () => {
    expect(bustProbabilities(MINIMAL_RULESET)).not.toBe(bustProbabilities(DEFAULT_RULESET));
  });

  it("ignores non-scoring settings when caching", () => {
    const first = bustProbabilities(DEFAULT_RULESET);
    const second = bustProbabilities({ ...DEFAULT_RULESET, targetScore: 5000 });
    expect(second).toBe(first);
  });
});

describe("bustProbability", () => {
  it("indexes the table by dice remaining", () => {
    expect(bustProbability(6, DEFAULT_RULESET)).toBeCloseTo(1080 / 46656, 10);
    expect(bustProbability(1, DEFAULT_RULESET)).toBeCloseTo(2 / 3, 10);
  });

  it("throws for a count outside one to six", () => {
    expect(() => bustProbability(0, DEFAULT_RULESET)).toThrow();
    expect(() => bustProbability(7, DEFAULT_RULESET)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- probability`
Expected: FAIL — cannot resolve `./probability.js`.

- [ ] **Step 3: Write the implementation**

`packages/rules/src/probability.ts`:

```ts
import { applicableCombos } from "./combos.js";
import { toCounts } from "./counts.js";
import type { Die, Ruleset } from "./types.js";

/** Bust chance by dice remaining. Index 0 is one die, index 5 is six. */
export type BustTable = readonly [number, number, number, number, number, number];

/**
 * True when at least one die in the roll can be set aside for points.
 *
 * A roll scores exactly when some combination fits inside it, which is what
 * applicableCombos already answers.
 */
export function hasAnyScore(dice: readonly Die[], rules: Ruleset): boolean {
  if (dice.length === 0) {
    return false;
  }
  return applicableCombos(toCounts(dice), rules).length > 0;
}

/** Exhaustively count the rolls of `diceCount` dice that score nothing. */
export function countBustingRolls(diceCount: number, rules: Ruleset): number {
  const dice: Die[] = new Array<Die>(diceCount).fill(1);
  const total = 6 ** diceCount;
  let busts = 0;
  for (let roll = 0; roll < total; roll += 1) {
    let remainder = roll;
    for (let position = 0; position < diceCount; position += 1) {
      dice[position] = ((remainder % 6) + 1) as Die;
      remainder = Math.floor(remainder / 6);
    }
    if (!hasAnyScore(dice, rules)) {
      busts += 1;
    }
  }
  return busts;
}

/**
 * Only the scoring settings change the odds, so the cache key ignores the
 * rest. Two lobbies with different targets share one computation.
 */
function scoringKey(rules: Ruleset): string {
  return [
    rules.singleOne,
    rules.singleFive,
    rules.tripleOne,
    rules.tripleMultiplier,
    rules.nOfAKind,
    rules.flatFour,
    rules.flatFive,
    rules.flatSix,
    rules.straight,
    rules.threePairs,
    rules.twoTriplets,
    rules.fourPlusPair,
  ].join("|");
}

const tableCache = new Map<string, BustTable>();

/**
 * Bust probability for one through six dice under these rules.
 *
 * Computed rather than hardcoded, because the odds genuinely depend on the
 * ruleset: enabling three pairs makes six dice meaningfully safer. The full
 * enumeration is 46,656 rolls in the worst case and is cached per ruleset.
 */
export function bustProbabilities(rules: Ruleset): BustTable {
  const key = scoringKey(rules);
  const cached = tableCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const table: BustTable = [
    countBustingRolls(1, rules) / 6,
    countBustingRolls(2, rules) / 6 ** 2,
    countBustingRolls(3, rules) / 6 ** 3,
    countBustingRolls(4, rules) / 6 ** 4,
    countBustingRolls(5, rules) / 6 ** 5,
    countBustingRolls(6, rules) / 6 ** 6,
  ];
  tableCache.set(key, table);
  return table;
}

export function bustProbability(diceRemaining: number, rules: Ruleset): number {
  if (!Number.isInteger(diceRemaining) || diceRemaining < 1 || diceRemaining > 6) {
    throw new RangeError(`diceRemaining must be 1 to 6, got ${diceRemaining}`);
  }
  return bustProbabilities(rules)[diceRemaining - 1] as number;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- probability`
Expected: PASS, 21 tests.

If the 1080 and 1440 counts do not both come out exactly, the fault is almost certainly the three-pairs definition in `applicableCombos` — specifically the `counts[face - 1] < 4` filter. The gap between the two numbers is exactly the 360 rolls shaped `(2,2,2,0)`.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/probability.ts packages/rules/src/probability.test.ts
git commit -m "feat: add farkle detection and computed bust probabilities"
```

---

### Task 6: Option enumeration

Every legal way to set dice aside from a roll. The client uses this for hints and to grey out dead dice; the bot uses it to choose a line.

**Files:**
- Create: `packages/rules/src/enumerate.ts`
- Test: `packages/rules/src/enumerate.test.ts`

**Interfaces:**
- Consumes: `emptyCounts`, `toCounts`, `totalDice` from `./counts.js`; `bestPartition`, `Partition` from `./score.js`; `Counts`, `Die`, `Option`, `Ruleset` from `./types.js`.
- Produces: `enumerateOptions(dice: readonly Die[], rules: Ruleset): Option[]` from `./enumerate.js`, sorted by points descending, then by dice used ascending.

- [ ] **Step 1: Write the failing test**

`packages/rules/src/enumerate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { enumerateOptions } from "./enumerate.js";
import { DEFAULT_RULESET } from "./rulesets.js";

describe("enumerateOptions", () => {
  it("returns nothing for a busted roll", () => {
    expect(enumerateOptions([2, 3, 4], DEFAULT_RULESET)).toEqual([]);
  });

  it("returns nothing for no dice", () => {
    expect(enumerateOptions([], DEFAULT_RULESET)).toEqual([]);
  });

  it("finds the single scoring die in a roll", () => {
    const options = enumerateOptions([1, 2, 3], DEFAULT_RULESET);
    expect(options).toHaveLength(1);
    expect(options[0]?.points).toBe(100);
    expect(options[0]?.diceUsed).toBe(1);
    expect(options[0]?.counts).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it("offers each single and the pair of them", () => {
    // 1 alone, 5 alone, and 1+5 together.
    const options = enumerateOptions([1, 5, 2], DEFAULT_RULESET);
    expect(options.map((option) => option.points)).toEqual([150, 100, 50]);
  });

  it("sorts by points descending", () => {
    const options = enumerateOptions([1, 1, 1, 5], DEFAULT_RULESET);
    const points = options.map((option) => option.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it("breaks ties by preferring fewer dice", () => {
    const options = enumerateOptions([1, 1, 5, 5], DEFAULT_RULESET);
    const hundreds = options.filter((option) => option.points === 100);
    // A single 1 (one die) must come before two 5s (two dice).
    expect(hundreds[0]?.diceUsed).toBe(1);
  });

  it("puts the best option first", () => {
    const options = enumerateOptions([1, 1, 1, 5, 5, 5], DEFAULT_RULESET);
    expect(options[0]?.points).toBe(2500);
    expect(options[0]?.diceUsed).toBe(6);
  });

  it("never returns an option using more dice than were rolled", () => {
    const options = enumerateOptions([1, 1, 1, 1, 1, 1], DEFAULT_RULESET);
    for (const option of options) {
      expect(option.diceUsed).toBeLessThanOrEqual(6);
    }
  });

  it("only returns fully scoring selections", () => {
    // The 3 can never be part of any option.
    const options = enumerateOptions([1, 3, 5], DEFAULT_RULESET);
    for (const option of options) {
      expect(option.counts[2]).toBe(0);
    }
  });

  it("includes a breakdown for every option", () => {
    for (const option of enumerateOptions([1, 1, 5], DEFAULT_RULESET)) {
      expect(option.breakdown.length).toBeGreaterThan(0);
    }
  });

  it("does not mutate the dice passed in", () => {
    const dice = [1, 1, 5] as const;
    enumerateOptions(dice, DEFAULT_RULESET);
    expect(dice).toEqual([1, 1, 5]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- enumerate`
Expected: FAIL — cannot resolve `./enumerate.js`.

- [ ] **Step 3: Write the implementation**

`packages/rules/src/enumerate.ts`:

```ts
import { emptyCounts, toCounts, totalDice } from "./counts.js";
import { bestPartition, type Partition } from "./score.js";
import type { Counts, Die, Option, Ruleset } from "./types.js";

/**
 * Every fully-scoring selection a player could make from this roll.
 *
 * Walks all sub-multisets of the roll and keeps the ones that partition
 * cleanly. One memo is shared across the whole walk, so overlapping
 * sub-selections are scored once.
 */
export function enumerateOptions(dice: readonly Die[], rules: Ruleset): Option[] {
  if (dice.length === 0) {
    return [];
  }

  const available = toCounts(dice);
  const memo = new Map<string, Partition | null>();
  const options: Option[] = [];
  const current = emptyCounts();

  const walk = (face: number): void => {
    if (face === 6) {
      if (totalDice(current) === 0) {
        return;
      }
      const partition = bestPartition([...current] as Counts, rules, memo);
      if (partition === null) {
        return;
      }
      options.push({
        counts: [...current] as Counts,
        points: partition.points,
        diceUsed: totalDice(current),
        breakdown: partition.breakdown,
      });
      return;
    }
    for (let n = 0; n <= available[face]; n += 1) {
      current[face] = n;
      walk(face + 1);
    }
    current[face] = 0;
  };

  walk(0);

  options.sort((a, b) => b.points - a.points || a.diceUsed - b.diceUsed);
  return options;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- enumerate`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/enumerate.ts packages/rules/src/enumerate.test.ts
git commit -m "feat: enumerate every legal keep-selection for a roll"
```

---

### Task 7: Public API and cross-cutting invariants

Ties the package together behind one entry point and adds the property tests that span modules.

**Files:**
- Create: `packages/rules/src/index.ts`
- Create: `packages/rules/src/index.test.ts`
- Create: `packages/rules/README.md`

**Interfaces:**
- Consumes: everything built so far.
- Produces: the public surface of `@greed/rules` — `scoreSelection`, `enumerateOptions`, `hasAnyScore`, `bustProbabilities`, `bustProbability`, `DEFAULT_RULESET`, `MINIMAL_RULESET`, and the types. `bestPartition` and `applicableCombos` stay internal.

- [ ] **Step 1: Write the failing test**

`packages/rules/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULESET,
  MINIMAL_RULESET,
  bustProbabilities,
  enumerateOptions,
  hasAnyScore,
  scoreSelection,
} from "./index.js";
import type { Die, Ruleset } from "./index.js";

/** Every roll of n dice, as an array of arrays. */
function allRolls(n: number): Die[][] {
  const rolls: Die[][] = [];
  const total = 6 ** n;
  for (let roll = 0; roll < total; roll += 1) {
    const dice: Die[] = [];
    let remainder = roll;
    for (let position = 0; position < n; position += 1) {
      dice.push(((remainder % 6) + 1) as Die);
      remainder = Math.floor(remainder / 6);
    }
    rolls.push(dice);
  }
  return rolls;
}

describe("public surface", () => {
  it("exports the functions the rest of the app depends on", () => {
    expect(typeof scoreSelection).toBe("function");
    expect(typeof enumerateOptions).toBe("function");
    expect(typeof hasAnyScore).toBe("function");
    expect(typeof bustProbabilities).toBe("function");
  });
});

describe("cross-module invariants over all 46656 six-dice rolls", () => {
  const rolls = allRolls(6);

  it("agrees between hasAnyScore and enumerateOptions", () => {
    for (const dice of rolls) {
      expect(enumerateOptions(dice, DEFAULT_RULESET).length > 0).toBe(
        hasAnyScore(dice, DEFAULT_RULESET),
      );
    }
  });

  it("busts on exactly 1080 rolls under the default ruleset", () => {
    const busts = rolls.filter((dice) => !hasAnyScore(dice, DEFAULT_RULESET));
    expect(busts).toHaveLength(1080);
  });

  it("busts on exactly 1440 rolls under the minimal ruleset", () => {
    const busts = rolls.filter((dice) => !hasAnyScore(dice, MINIMAL_RULESET));
    expect(busts).toHaveLength(1440);
  });

  it("never reports an option that scoreSelection disagrees with", () => {
    for (const dice of rolls) {
      const best = enumerateOptions(dice, DEFAULT_RULESET)[0];
      if (best === undefined) {
        continue;
      }
      const kept: Die[] = [];
      for (let index = 0; index < 6; index += 1) {
        for (let n = 0; n < (best.counts[index] as number); n += 1) {
          kept.push((index + 1) as Die);
        }
      }
      const scored = scoreSelection(kept, DEFAULT_RULESET);
      expect(scored.valid).toBe(true);
      expect(scored.points).toBe(best.points);
    }
  });

  it("never scores a selection above the best enumerated option", () => {
    for (const dice of rolls) {
      const options = enumerateOptions(dice, DEFAULT_RULESET);
      const best = options[0];
      if (best === undefined) {
        continue;
      }
      for (const option of options) {
        expect(option.points).toBeLessThanOrEqual(best.points);
      }
    }
  });
});

describe("enabling a rule never makes a roll bust more often", () => {
  it("holds across all six-dice rolls", () => {
    const generous: Ruleset = { ...DEFAULT_RULESET, fourPlusPair: 1500 };
    for (const dice of allRolls(6)) {
      if (hasAnyScore(dice, DEFAULT_RULESET)) {
        expect(hasAnyScore(dice, generous)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- index`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 3: Write the entry point**

`packages/rules/src/index.ts`:

```ts
export { DEFAULT_RULESET, MINIMAL_RULESET } from "./rulesets.js";
export { scoreSelection } from "./score.js";
export { enumerateOptions } from "./enumerate.js";
export {
  bustProbabilities,
  bustProbability,
  countBustingRolls,
  hasAnyScore,
  type BustTable,
} from "./probability.js";
export type {
  Combo,
  ComboKind,
  Counts,
  Die,
  FarklePenalty,
  NOfAKindMode,
  Option,
  Ruleset,
  ScoreResult,
} from "./types.js";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- index`
Expected: PASS, 7 tests. The full-enumeration tests take a few seconds; that is expected.

- [ ] **Step 5: Write the package README**

`packages/rules/README.md`:

```markdown
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
```

- [ ] **Step 6: Run the whole suite and typecheck**

```bash
npm test
```

Expected: PASS, all 100 tests across seven files.

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 7: Verify the zero-dependency constraint**

```bash
node -e "const p=require('./packages/rules/package.json');if(p.dependencies)throw new Error('rules gained a runtime dependency');console.log('ok: no runtime dependencies')"
```

Expected: `ok: no runtime dependencies`

- [ ] **Step 8: Commit**

```bash
git add packages/rules/src/index.ts packages/rules/src/index.test.ts packages/rules/README.md
git commit -m "feat: expose the rules package public API"
```

---

## Done when

- `npm test` passes, including the 1080 and 1440 farkle invariants.
- `npm run typecheck` exits clean.
- `packages/rules/package.json` has no `dependencies` key.
- `@greed/rules` exports `scoreSelection`, `enumerateOptions`, `hasAnyScore`, `bustProbabilities`, `bustProbability`, both rulesets, and the shared types.

## Next plan

Phase 3 from the spec: the design system, procedural textures, the `/style` gallery, and the published mockup Artifact. It depends on nothing in this plan, so it could equally run first — but the rules engine is what everything else is blocked on.
