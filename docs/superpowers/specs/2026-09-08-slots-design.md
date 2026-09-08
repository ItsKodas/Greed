# Slots — design

A five-reel machine that stands against the wall, played alone, paying from a
bank that only ever holds chips real people put there.

## Why this is the hard one

Every other game in the building satisfies "chips are only won from real
people" by construction: there are opponents in the hand, and the pot is their
money. A slot machine has no opponents. Played the ordinary way it pays from
the house, and the house is a button that mints chips — the one thing this
casino must never contain.

So the machine does not pay from the house. It pays from a **bank** that
players fill and players empty, and nothing else ever adds to it except a
deliberate act by the one role already trusted to create chips. In steady
state the bank neither grows nor shrinks: it circulates. A player who wins at
Slots is being paid by everyone who spun before them.

That is the whole design. Everything below serves it.

## The bank

One shared, persisted number, alongside chips in the economy.

- Every stake enters the bank **in full, before the reels resolve**.
- Every win leaves the bank.
- No other operation adds to it, except an admin float (below).

`Store` gains three methods, implemented in both the in-memory and Mongo
stores:

```ts
bank(): Promise<number>;
bankAdd(delta: number): Promise<void>;
bankTake(amount: number): Promise<boolean>;   // false rather than overdrawing
```

`bankTake` refusing rather than overdrawing is the last line of defence. The
stake cap below means it should never be reachable; a test asserts it is not,
and the method exists so that a bug is a refused payout rather than a bank
that has quietly gone negative and started minting.

### The float, and why an admin has to strike the match

An empty bank permits a stake of zero (see the cap), so the machine cannot
open itself. Someone has to put the first chips in.

That is the existing admin allowlist — the same env-var role that already
mints redemption codes, described in `admin.ts` as "who is allowed to make
chips exist." It fails closed when unset, cannot be escalated into from inside
the product, and is already the only faucet in the building. Adding the bank
to it introduces no new authority.

`POST /api/admin/bank { amount }`, behind the existing `requireAdmin`.
A float of 50,000 permits a 38-chip maximum bet on day one.

This is the one place chips enter the bank from outside. It is a deliberate
act by a named human, not a mechanism, and it is auditable because it is the
only one.

## The machine

Five reels, three rows visible, nine fixed paylines, paying left-to-right from
reel 1 for three, four or five of a kind.

Nine lines rather than twenty because a payline nobody can trace on a phone is
not a feature. Nine draw cleanly across a 375px cabinet, and a line lighting up
across the reels is this game's best animation.

### The strip

One 32-stop strip, shared by all five reels. Sharing it keeps the arithmetic
exact and the tuning legible; five different strips would buy nothing here.

| Symbol | Stops |
|---|---|
| Chip | 9 |
| Dice | 7 |
| Spade | 6 |
| Horseshoe | 4 |
| Bell | 3 |
| Seven | 3 |

### The paytable

Multipliers are on the **line bet**, which is the total stake divided by nine.

| Symbol | 3 of a kind | 4 | 5 |
|---|---|---|---|
| Chip | 4 | 22 | 109 |
| Dice | 7 | 33 | 164 |
| Spade | 11 | 55 | 273 |
| Horseshoe | 18 | 88 | 438 |
| Bell | 33 | 164 | 875 |
| Seven | 55 | 328 | **jackpot** |

### The arithmetic, which is exact

Each payline reads one symbol per reel, and reels are independent and share a
strip. So the chance of exactly *k* matching from reel 1 is a closed form:

```
P(k) = p^k * (1 - p)   for k = 3, 4
P(5) = p^5
```

No simulation, no enumeration of 33.5 million grids. The RTP is a sum of
eighteen terms and a test asserts it exactly.

- **Line RTP: 90.00%**
- **Shortfall: 10.00%** — this is not a house edge. It is the jackpot's funding.
- **Jackpot: five Sevens on a payline, 1 in 15,343 spins** across nine lines.
- **Jackpot pays 40% of the bank**, so it is never short by construction.
- **The jackpot pays once per spin**, however many paylines read five Sevens.
  Not a rounding detail: fifteen Seven cells would light all nine lines, and a
  jackpot paid nine times is 360% of the bank — the one arrangement that could
  make this machine mint chips. It pays once.

At steady state the bank settles near 3,800× the typical stake and the jackpot
pays near 1,535× it — at a 10-chip spin, a bank showing about 38,000 that pays
out about 15,300. Total return to players approaches 100%: the 10% withheld
from every spin is exactly what the jackpot hands back. Nothing is minted and
nothing is burned.

### The stake cap, which makes insolvency structurally impossible

The machine offers only stakes it can certainly pay, so the cap comes from the
worst spin possible — and there are two candidates, because the jackpot is a
share of the bank rather than a multiplier.

**No jackpot.** All nine lines hit the top fixed win, Bell five-of-a-kind, at
875× the line bet. Nine lines at `stake/9` each is 875× the total stake. The
stake is already in the bank, so this needs `bank ≥ 874 × stake`.

**One jackpot line, eight paying.** The jackpot takes 40% of the bank *as it
stands at payout*, which includes the stake that has just gone in, and the
other eight lines take `8 × 875 × stake/9` = 777.8× stake:

```
0.4 × (bank + stake) + 777.8 × stake  ≤  bank + stake
                        777.2 × stake  ≤  0.6 × bank
                                 bank  ≥  1295.3 × stake
```

The mixed case binds, so:

```
maxStake = floor(bank / 1296)
```

The stake appears on both sides of that inequality, and getting it onto only
one is how this was first written. Taking the jackpot's share of the bank as
it stood *before* the pull gives 1295, which is not enough: at a stake of
1,000 that machine owes 176 chips it has not got. The error was caught by the
property test during implementation, not by re-reading the algebra.

A 50,000 float permits a 38-chip maximum bet on day one.

This is deliberately the true worst case, not a percentile. The all-Bell grid
has probability (3/32)^15 — about 1 in 10^15 — and capping against it is
absurdly conservative in exactly the way a chip economy should be. It also
self-regulates: since the bank settles near 3,800× the typical stake, the cap
permits roughly 3× the typical stake and rises as the bank grows.

**A thin bank means a smaller maximum bet — never a short payout, and never a
dark machine.** That is the whole reason this cap exists rather than a refusal.

## The cabinet counts in chips

Every figure on the machine — the stake, the purse, the jackpot sign, what a
spin paid — is chips, the same unit as the rest of the building.

It read in credits at a hundred to the chip for a while, on the argument that a
machine saying 500 feels more like a slot machine than one saying 5. That was
wrong, and worth recording as wrong: the moment any one figure on a cabinet is
a chip, they all have to be, because a player cannot tell what they are playing
for when the stake and the prize are in different units. A jackpot of 19,850
beside a stake of 500 reads as forty times the bet when it is nearer four
hundred.

What stands from that argument is the narrower point it was built on: there is
one ledger in this building and it is in chips. A second stored currency
convertible back to chips would be chips with an extra step, and the name "not
real chips" is an invitation to exactly the looseness these rules exist to
prevent. That part has not changed — what changed is that the display no longer
pretends otherwise either.

**The jackpot is written in full, never shortened.** It is the one number on the
page somebody is there for, and "19.9K" is a rounder answer to "what am I
playing for" than the question deserves. Shortening belongs where a figure is
glanced at rather than read — the balance pill in the navbar — and nowhere on
this cabinet.

## Not a table

Slots has no `PlayTable`, no `GameAdapter`, no seating, no lobby code, no
turn clock and no bots. `catalogue.ts` already says why: forcing a machine
through a table "would bend both out of shape."

`MIN_FOR_CHIPS` and the no-bots rule do not apply, because there is no hand
and no opponent that a bot could fake. The rule those exist to serve — that
winnings come from real people — is served here by the bank instead.

One socket action, one ack:

```ts
// client -> server
slots:spin  { stake: number }

// ack
{ ok: true, grid: Symbol[5][3], lines: WinningLine[], won: number,
  bank: number, balance: number, jackpot: boolean }
{ ok: false, error: string }
```

## Where the code lives

```
games/slots/src/
  strip.ts       the 32 stops, and drawing a grid from a source of randomness
  paytable.ts    multipliers, and evaluating a grid into winning lines
  rtp.ts         the closed-form return, so the test asserts it rather than trusts it
  bank.ts        the stake cap and the jackpot share
  listing.ts     how Slots lists itself
  theme.css      its colours
  index.ts

apps/web/src/slots/
  Slots.tsx      the cabinet
  Reel.tsx       one column, and how it stops
  Symbols.tsx    the six symbols, drawn as SVG on a 60-unit grid
  slots.css
```

The maths is pure functions with no I/O, so the whole paytable is testable
without a server, a socket or a store.

## How a pull feels

The reels are the best fit in this repo for the rule that nothing waits on the
server and nothing is ever invented. **A spinning reel is a face-down card:**
the motion is honest, the symbol is the fact.

- The lever drops and all five reels spin **on the press**. The stake leaves
  the purse at once, because a stake is the player's own number.
- The reels stop **left to right as the server's answer lands**, about 120ms
  apart. No symbol is ever guessed, and there is one arrival, not two.
- A refusal or a silence spins them back down onto their previous faces and
  returns the stake.
- Winning lines light in sequence after the last reel stops, and the credit
  counter ticks up rather than jumping — a number that changes because
  something happened.

`prefers-reduced-motion` replaces the spin with a crossfade to the result and
the counter tick with a single step. The cabinet still says everything it
needs to.

At 375px the five reels get about 59px each, three rows tall. Symbols are drawn
as SVG on a 60-unit grid rather than reusing the deck's 100-unit one — the
visual kinship with the playing cards is the price of the fifth reel.

## The theme

Magenta neon over deep violet — distinct from Greed's brass, Blackjack's green
and the building's blue, and the colour a slot machine actually is.

```
wall #1b1220   felt #2a1836   accent #c9439e   accentHi #ff86d4
```

Mark: `SLOTS` with the O picked out, `accentAt: 2` — the O reads as a reel.

The same values go in `listing.ts`, because the link cards are drawn on the
server where there is no stylesheet to read, and `theme.test.ts` already
enforces that a game declares both `:root[data-game="slots"]` and
`[data-game="slots"]`.

## Stats and history

Bumped per spin: spins, chips staked, biggest single win, jackpots hit.

**Not written to game history per spin** — a slot machine would flood it, and
`FinishedGame` wants players, scores and winners that a solo spin does not
have. A jackpot is written, because a jackpot is an event worth a row.

## CLAUDE.md

The file currently says, without qualification:

> A chips game does not run for one player. It waits.

A solo cabinet breaks that as written. The deeper rule it protects — that
nothing is minted, and every chip won came from a real person — the bank
satisfies exactly.

So CLAUDE.md gains a named exception under "Chips are only won from real
people": a machine may run for one player **if and only if** it pays from a
bank that players alone fill, it can never pay more than that bank holds, and
the only outside deposit is an admin's deliberate float. Better a stated
exception with its conditions than a file that silently contradicts a shipped
game.

## Testing

Every claim above that is arithmetic is tested as arithmetic.

1. **The strip is 32 stops.** Weights sum to exactly 32, or the closed form is
   wrong and every other number here is too.
2. **RTP is 90.00%.** Computed in closed form from the strip and the paytable,
   asserted against the constant. Changing a multiplier without retuning fails.
3. **Nothing is minted.** For a large scripted sweep of spins: bank delta plus
   player delta is exactly zero, every time. This is the invariant, tested
   directly.
4. **Insolvency is unreachable.** For any bank and any stake the cap permits,
   the maximum possible payout is proven ≤ bank + stake — across both worst
   cases, the all-fixed grid and the jackpot-plus-eight-lines grid. Property-
   style over a range of banks, not one example.
5. **The jackpot pays once.** An all-Sevens grid lights nine paylines and pays
   40% of the bank exactly one time. This is the arrangement that would mint
   chips, so it is tested with a scripted grid rather than left to chance.
6. **`bankTake` refuses rather than overdraws**, asserted directly, because it
   is the last line of defence and must not be assumed.
7. **Paylines evaluate correctly.** Known grids to known payouts: matches run
   left-to-right, must start at reel 1, and a run broken at reel 3 pays for
   three and not five.
8. **The jackpot pays a share of the bank**, and pays it out of the bank.
9. **The reels stop on the answer, not before it.** Clock-based, on fake
   timers, in the manner of `Cards.test.tsx` — a reply that lands instantly
   must not stop a reel that is still spinning up.
10. **A refused spin returns the stake** and restores the previous faces.
11. **Reduced motion** removes every keyframe, and the result is still readable.
12. **375px** — no sideways scroll, all five reels visible, lever within thumb
    reach.

Tests 3, 4 and 5 are the ones that matter. The rest protect the feel; those
three protect the economy.

## Deliberately not in this version

- **Wilds and scatters.** Real slots have them and they are fun, but each one
  breaks the closed-form RTP into a much harder computation, and a paytable
  whose return cannot be asserted exactly is one this economy should not run.
  Worth adding later, with the maths done properly.
- **Free spins, bonus rounds, gamble.** Same reason, and none of them are the
  machine — they are what gets added once the machine is right.
- **Per-line staking.** One stake covering all nine lines. "Bet per line"
  confuses everyone and complicates the cap for nothing.
- **Multiple machines or denominations.** One cabinet, one bank.
