# The Tip Jar — design

A glass jar on the bar. You tap it, the night's tips settle in, and when it is
full that is the night. It is where chips come from now.

## Why this one is delicate

Every other game in the building moves chips between people. This one makes
them. `CLAUDE.md` names that exact hazard — the whole no-bots, no-solo rule
exists to stop the economy becoming "a button somebody holds down" — and a
clicker is, unavoidably, a button somebody holds down.

What makes it allowable is that the building already has faucets: the daily
top-up and admin-minted codes. A faucet is not forbidden. An *unbounded* one
is. So the tip jar is designed as a bounded faucet, and the bound is the whole
design:

**A night is a fixed number of taps, not a fixed number of chips.**

That single decision does the work. Upgrades change what a tap is worth, so
playing well matters; nothing changes how many taps there are, so the ceiling
is arithmetic rather than statistical. It also collapses the anti-cheat
problem: an autoclicker cannot buy you more taps. It can only spend your night
in twenty seconds and buy nothing with it.

Everything below serves that.

## The night

State held per player, on the profile, because it has to survive a restart:

```ts
interface Night {
  /** When the first tap of this night landed. */
  startedAt: number;
  tapsUsed: number;
  favours: number;
  bought: string[];
  chipsTonight: number;
  /** The token the next tap must carry. */
  token: string;
  /** The last dozen accepted gaps between taps, in ms. */
  rhythm: number[];
}
```

- `TAPS_PER_NIGHT = 100`
- `NIGHT_MS = 20h` — the same rolling interval the daily used, and for the same
  reason: it drifts earlier each day, so nobody is locked out at the hour they
  happen to play.

A night begins on the first tap after `startedAt + NIGHT_MS`, at which point
everything above is reset — favours, upgrades and all. Favours do not carry
over, because the upgrades they bought do not either. Nobody remembers a
favour the next night.

A player who taps five times and walks away loses the other ninety-five when
the night turns over. That is deliberate: it is a night, not a balance of taps
accruing in a drawer. An allowance that banked would let somebody sit out a
week and then take seven nights' chips in one sitting, which is the faucet
running unbounded again, just slowly.

Signing in is required. There is no account to credit otherwise, which is the
same reason Slots refuses a guest.

## The ladder

Every tap earns one favour, flat, whatever it pays in chips. Favours buy
upgrades, each once, each adding to what a tap pays.

| Upgrade | Favours | Adds |
|---|---:|---:|
| A cleaner glass | 10 | +5 |
| A spot nearer the door | 25 | +8 |
| The good stool | 45 | +12 |
| Your name behind the bar | 60 | +25 |

Base pay is **10 chips**. A night yields 100 favours; the ladder costs 140. **You
cannot buy everything**, and that is the game. Three routes land within 2% of
each other, and — the part that makes it worth thinking about — **the best one
is not cheapest-first**:

| Route | Bought at taps | Night |
|---|---|---:|
| Glass, then save past the stool for your name, then the spot | 10, 70, 95 | **2,240** |
| The cheap three in order | 10, 35, 80 | 2,210 |
| Glass, then your name, then stop | 10, 70 | 2,200 |
| Tap and buy nothing | — | 1,000 |

Passing on an upgrade you can already afford, to bank for a bigger one, beats
buying up the ladder as you reach each rung. That is the whole decision, it is
worth 30 chips over the obvious line, and a player will find it on about their
fourth night.

So a night played thoughtfully is worth a little over twice a night played
absent-mindedly, and the whole thing takes a minute or two. Quick, low, enough
to get somebody going again.

These numbers are tuneable, and the tests below pin them so that a change
which quietly triples the faucet fails CI rather than shipping.

### The ceiling, which is arithmetic

Two bounds, and they are different on purpose.

**The reachable optimum is 2,240**, pinned by a test that enumerates every
subset of the ladder in every order and simulates the night. That test is not
decoration: the optimum was worked out by hand as 2,210 while this document
was being written, and the enumeration found the better line. A ladder tuned
by hand needs a search to say what it actually pays.

**The hard guard is `TAPS_PER_NIGHT × (base + every upgrade)` = 100 × 60 =
6,000**, computed rather than written down, enforced server-side per night. It
is deliberately not the reachable optimum: it has to hold even if the favour
accounting is *wrong*. A guard derived from what the game is supposed to allow
would be a guard that agrees with the bug. This one survives it.

In honest play the guard never binds — there is 2.7x of headroom — and a test
asserts that.

## The jar shows the budget

The jar is glass and it fills as you tap. **The fill level is the taps you have
left.** There is no allowance counter, no "83/100", no bar under the button:
you look at the jar and you know. That is one fewer thing on screen, which
matters most at 375px where the jar is nearly all of it.

When it is full, it says when the bar reopens, and the taps stop paying.

## The anti-cheat

In order of how much each one actually does. The first two are the money; the
rest are for the part of cheating that is merely rude.

**1. The server owns the night.** Taps left, favours, upgrades bought, the
clock, the payout — all decided server-side off the persisted `Night`. The
client is told what it has, never asked. `CLAUDE.md`: hiding a control is a
courtesy, refusing the message is the rule.

**2. A tap is one atomic store operation.** Not "read the night, decide, credit
the chips" across three awaits — that is the race where eight sockets each
read *97 left* and each get paid. One `Store` method does the whole thing, the
way `send()` is one method rather than two `adjustChips` calls, and for the
identical reason its comment gives: a debit that lands and a credit that does
not is chips destroyed and nobody knows. Mongo does it as a single conditional
`findOneAndUpdate`, exactly as `claimDaily` already does; the memory store does
it without an intervening `await`.

This is the only layer that protects chips. Everything below protects the
*feel* of the thing.

**3. Each tap carries the token the last one returned.** The night holds a
token; a tap must echo it; a served tap mints a new one. Without this a client
can fire a hundred taps in one batch before any ack returns — the budget still
caps the chips, but the interval and rhythm checks below never get a chance to
look, because there are no intervals. With it, every tap is a genuine round
trip. **A refused tap also returns a fresh token and the current state**, so a
refusal resyncs the client rather than deadlocking it.

**4. A floor on the interval.** A tap landing under 50ms after the last
accepted one is refused. That is twenty a second, past any hand.

**5. Rhythm.** The night keeps its last twelve gaps. A tap is refused when
there are at least eight of them *and* the median gap is under 250ms *and*
their spread — `max - min`, in milliseconds, not a standard deviation — is
under 15ms. An autoclicker is a metronome; a hand is not. Both
conditions are required, so a slow steady tapper is fine and a fast erratic one
is fine — the only thing that trips it is fast *and* inhumanly even.

**A refused tap costs nothing.** No tap is consumed, no favour, no chips. The
server says plainly what happened — "that was too even to be a hand" — and the
player carries on. A false positive costs somebody one tap, which is the right
price for a check that is a heuristic.

## The daily goes away

Replaced, not supplemented. That means deleting:

- `claimDaily` from `Store` and both implementations
- `judgeDaily`, `DAILY_FLOOR`, `DAILY_GRANT`, `DAILY_INTERVAL_MS` from
  `packages/economy` (**not** `DAILY_SEND_CAP` in `transfers.ts` — unrelated,
  it caps what you may send another player)
- `POST /api/daily` and the `dailyDue` field on `/api/me`
- `claimDaily` / `dailyMessage` / `dailyDue` from `useAccount.ts`
- the "Claim daily top-up" buttons in `Navbar.tsx` and `Profile.tsx`

`lastDailyClaim` stays on the profile document. Dropping a column from live
user records to save eight bytes is not worth writing a migration for, and the
field is a record of something that did happen.

Both buttons become a link to the jar. This is a live thing existing players
use every day, so the change is visible by design: the profile should say
where the chips went, not silently lose a button.

## Not a machine

`GameListing.shape` is `"table" | "machine" | "party"`, and the tip jar is none
of them. A machine is documented as *played alone against the house*, paying
from a bank — the jar has no bank, no house and nothing at risk. Filing it as a
machine would make that comment a lie, and the comment is load-bearing.

So the union gains **`"bar"`**, and `Room.tsx` gains a fourth group headed **"At
the bar"**, placed after *Against the wall* and before *In the back*. The page
then reads as a gradient: tables (money, people) → machines (money, alone) →
the bar (no money at risk) → the back (not about money at all). The two
existing bookends keep their positions.

`catalogue.test.ts` asserts the set of drawn shapes and will need `"bar"`
adding.

## Where the code lives

```
games/tips/src/
  ladder.ts       the upgrades, payPerTap(bought), what is affordable
  night.ts        judgeTap(night, now, token) -> accepted | refused, and the reset clock
  rhythm.ts       the metronome test, alone and testable
  ceiling.ts      the computed hard guard
  listing.ts      GameListing
  theme.css
packages/economy/src/
  store.ts        Night on Profile; tapJar() and buyUpgrade() on Store; daily removed
  mongo-store.ts  both as single conditional updates
packages/shared/src/
  protocol.ts     tips:open, tips:tap, tips:buy and their views
  schemas.ts      tapSchema, buySchema
apps/server/src/
  tips.ts         the handlers
apps/web/src/tips/
  Tips.tsx  Jar.tsx  Upgrades.tsx  tips.css
```

`games/tips` is pure: no I/O, no store, no clock of its own — `now` is passed
in. That is what makes the ceiling and the rhythm test cheap to assert
exhaustively.

The handlers go in **`apps/server/src/tips.ts`**, not in `server.ts`. That file
is 2,414 lines and wires Slots inline; a fifth game inline would put it past
2,600. A `wireTips(socket, deps)` called from the connection handler follows
the shape already there without extending the pile.

`tips.css` must be imported by something — `CLAUDE.md` notes this repo has had
orphan stylesheets that nothing loads.

## The protocol

```ts
"tips:open": (payload: Record<string, never>, ack: (state: JarView) => void) => void;
"tips:tap":  (payload: { token: string }, ack: (result: TapResult) => void) => void;
"tips:buy":  (payload: { upgrade: string; token: string }, ack: (result: TapResult) => void) => void;
```

```ts
interface JarView {
  tapsLeft: number;
  tapsPerNight: number;
  favours: number;
  bought: string[];
  payPerTap: number;
  chipsTonight: number;
  /**
   * `startedAt + NIGHT_MS` — when this night turns over and the jar is
   * emptied. Null only before the first tap of a player's first night, when
   * no clock is running yet.
   */
  nextNightAt: number | null;
  /** What the next tap must carry. */
  token: string;
}

type TapResult =
  | { ok: true; paid: number; balance: number; jar: JarView }
  | { ok: false; error: string; jar: JarView };
```

The refusal carries the jar too — that is what makes a refused tap recoverable
rather than terminal.

`buy` takes the token for the same reason a tap does: buying is the other
thing that spends a night's resources, and a batch of concurrent buys is the
same race. A served buy mints a new token too, so the two share one chain and
a buy cannot be slipped between a tap and its successor.

**Buying does not consume a tap**, and it is not subject to the interval or
rhythm checks — those are about how fast a hand can hit a jar, and a buy is a
considered decision that may well follow a tap by five milliseconds because
the player had already made up their mind.

## How a tap feels

`CLAUDE.md` allows showing a fact the client can derive and forbids inventing
one. Pay-per-tap is deterministic and both sides compute it identically, so
**the tap lands instantly**: a chip arcs from where the thumb hit into the jar,
the level rises, the counter ticks. Nothing is guessed. The ack reconciles; a
refusal takes the chip back out and says why.

There is no randomness in the payout, and that is on purpose — a crit would be
a fact only the server knows, which would mean the chip has to arrive face
down and turn over, and a clicker that hesitates a hundred times a night is a
clicker that feels broken on a bad connection.

- The jar wobbles once with a short overshoot and settles. It does not bounce
  twice and it does not loop.
- One motion per element; a chip in flight is not restyled mid-arc.
- Every keyframe respects `prefers-reduced-motion`, and the jar still says
  everything it needs to without them — the level is a level either way.
- A sampled clink, because a chip hitting glass is a physical thing, quiet
  enough to sit under a hundred taps, under the existing volume and mute.
- Checked at 375px: the jar is the screen, the tap target is under a thumb, and
  the upgrade list scrolls in its own box rather than pushing the jar off.

Timed rather than eyeballed. On a machine talking to itself the ack lands
inside a frame, so a version with no optimism at all would look perfect on
localhost and feel broken from another continent.

## The theme

Warm, low, amber — a lamp over a bar rather than a lit cabinet.

```
wall #1a1410   felt #2b2018   accent #d99a3f   accentHi #ffcf7a
```

Mark: `{ text: "TIP JAR", accentAt: 0 }`. These values live twice — in
`theme.css` and in the listing, because the link cards are drawn server-side
where there is no stylesheet to read — and they have to agree.

## Stats and history

`byGame.tips`: `add: { nights, taps, chipsTipped }`, `max: { bestNight }`.

**No shared stats.** `games`, `wins` and `chipsWon` are about playing against
people; counting a night at the jar as a game won would inflate every profile
in the building with something nobody played against anybody. Nothing is
written to `recordGame` either — a night is not a hand.

## CLAUDE.md

| Rule | How this satisfies it |
|---|---|
| No route from money to chips | Nothing here takes payment. |
| Chips only won from real people | It does not claim to. It is a faucet, like the daily it replaces, and it is bounded in taps rather than trusted to be small. |
| No bots at a table for chips | No table, no seats, no opponents. |
| The server is the only authority | Every rule is enforced in one atomic store operation. The client shows the jar; it never decides what a tap paid. |
| A press lands immediately | Deterministic payout, so the chip flies on press and reconciles on ack. |
| Everything is animated, and says what happened | A chip goes into a jar and the level rises. |
| Reduced motion | Every keyframe has an off switch; the level reads without any of them. |
| It works on a phone | The jar is the screen at 375px; nothing scrolls sideways. |
| Every bug fix gets a failing test first | Below. |

## Testing

**`games/tips` — pure, so assert exhaustively**

- Every subset of the ladder, in every order, simulated; the best is 2,240 and
  the test names it. Buying cheapest-first is not optimal and a test says so,
  so a tuning change that flattens the decision fails loudly.
- No reachable sequence exceeds the computed hard guard.
- The guard is `taps × (base + every upgrade)` and does not depend on
  affordability, proven by giving the ladder a deliberately broken cost of zero
  and checking the guard is unmoved.
- A metronome trace at 100ms ± 1ms is refused. A recorded human trace is not.
  A slow steady trace (800ms, tight spread) is not — only fast *and* even
  trips.
- A night resets after `NIGHT_MS` and not a millisecond before.

**`packages/economy` — the race, in both stores**

- A hundred concurrent taps against a night with ten left credit exactly ten
  taps' worth of chips. Run against both `MemoryStore` and `MongoStore`, since
  they are two different atomicity arguments.
- Concurrent buys of the same upgrade charge the favours once.
- Unused taps do not carry into the next night.

**`apps/server` — socket tests in the style of `slots.test.ts`**

- A stale token is refused, and the refusal carries a usable jar.
- A guest is refused.
- Chips actually reach the account, and `me:chips` is pushed.
- Buying an upgrade you cannot afford is refused and charges nothing.

**`apps/web` — in the style of `Slots.test.tsx`**

- The optimistic chip and the ticked counter appear before the ack.
- A refusal rolls both back and shows the reason.
- The jar renders full and refuses to tap once the night is spent.
- No horizontal scroll at 375px.

## Deliberately not in this version

- **Idle income.** Chips for having been away is the faucet running while
  nobody is looking, and it is the hardest thing to defend against a scripted
  client. Rejected in brainstorming.
- **Crit taps or any randomness in the payout.** Costs the instant press for a
  novelty; see *How a tap feels*.
- **Favours carrying between nights.** Turns an allowance into a bank and lets
  a week's absence become one enormous night.
- **A leaderboard of biggest nights.** It would reward exactly the behaviour
  the anti-cheat is trying to make pointless.
- **Flagging or banning suspected autoclickers.** The server refuses the tap
  and says so, which was the decision taken in brainstorming. Nothing accrues
  on the profile and no admin has to adjudicate.
