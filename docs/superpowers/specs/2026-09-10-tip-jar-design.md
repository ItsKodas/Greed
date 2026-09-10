# The Tip Jar — design

A glass jar on the bar. The bar keeps dripping tips into it; you tap it to
take a scoop out. It is where chips come from now.

## Why this one is delicate

Every other game in the building moves chips between people. This one makes
them. `CLAUDE.md` names that exact hazard — the whole no-bots, no-solo rule
exists to stop the economy becoming "a button somebody holds down" — and a
clicker is, unavoidably, a button somebody holds down.

What makes it allowable is that the building already has faucets: the daily
top-up and admin-minted codes. A faucet is not forbidden. An *unmetered* one
is.

So the tip jar is metered. Not by a total — a player may sit at it all evening
if they want to — but by two numbers that bound how fast chips can arrive:

**A burst is bounded by the brim. A long run is bounded by the trickle.**

Neither bounds the lifetime total, and that is a deliberate decision taken in
brainstorming: how long somebody plays is their business. What the design
refuses is a way to get a lot *quickly*.

## The jar

Three numbers, and they are the whole game.

| | Base | Fully upgraded |
|---|---:|---:|
| **Brim** — most the jar can hold | 1,500 | 3,000 |
| **Trickle** — what the bar puts in | 60/min | 100/min |
| **Scoop** — what one tap takes | 25 | 50 |

A tap pays `min(scoop, level)` and takes that out of the jar. Tap a full jar
and you get a good run — sixty taps at base rate — and then you are down to the
trickle, where each tap collects whatever has dripped in since the last one.
The jar is glass, so you can see which of those two situations you are in
without being told.

**The trickle accrues while you are away**, capped at the brim. Twenty-five
minutes away and a week away both give you a full jar. This is what stops the
jar being a reason to leave a tab open overnight: being offline is never worse
than being present, so there is nothing to gain by pretending to be there.

An hour of attentive play is worth about 3,600 chips at base rate and 6,000
fully upgraded. **An unattended eight-hour run is worth about 48,000 — roughly
five starting balances.** That is the honest consequence of the rate chosen in
brainstorming, and the trickle is the one constant to move if it ever looks
wrong. Nothing else in the design depends on its value.

## The night, which is only the upgrade clock

`NIGHT_MS = 20h`, the same rolling interval the daily used and for the same
reason: it drifts earlier each day, so nobody is locked out at the hour they
happen to play.

The night does nothing to the jar's level. It exists solely to expire
**upgrades and favours** — at the turnover both are cleared and you rebuild
from the base numbers. Nobody remembers a favour the next night.

That leaves one edge worth naming, because it is exactly the kind that becomes
a bug: a player can end a night fully upgraded with 3,000 in a jar whose brim
is about to drop back to 1,500. **The level is never clamped down.** The brim
caps what the trickle may *add*, not what the jar may hold, so a carried-over
level above the brim simply sits there and is spent down; it does not evaporate
at the stroke of the turnover. Chips the player earned are not taken back for a
tidier invariant. The guard still holds — it is written against `MAX_BRIM`, so a
carried-over full jar is inside it.

State held per player, on the profile, because it has to survive a restart:

```ts
interface Jar {
  /** Chips sitting in the jar, as of `levelAt`. */
  level: number;
  /** When `level` was last true. The trickle since then is computed, never ticked. */
  levelAt: number;
  favours: number;
  bought: string[];
  /** When the current upgrade night began. */
  nightStartedAt: number;
  /** Everything this jar has paid this night, for the guard below. */
  paidThisNight: number;
  /** The token the next tap must carry. */
  token: string;
  /** The last dozen accepted gaps between taps, in ms. */
  rhythm: number[];
}
```

The level is **computed, not ticked**. There is no timer per player anywhere on
the server; `level` and `levelAt` are a pair from which the current level
follows by arithmetic. A hundred thousand idle jars cost nothing.

Signing in is required. There is no account to credit otherwise, which is the
same reason Slots refuses a guest.

## The ladder

**Favours come from chips collected, not from taps** — one favour per 20 chips.
This is not a detail. If favours came from taps, an autoclicker on a dry jar
would farm the entire upgrade ladder for free, in silence, having collected
nothing. Tying them to chips means favour income is bounded by the trickle,
exactly as chip income is.

Each upgrade is bought once and raises exactly one thing, so what a player is
choosing is legible:

| Upgrade | Favours | Raises |
|---|---:|---|
| A cleaner glass | 15 | Scoop 25 → 35 |
| A spot nearer the door | 40 | Trickle 60 → 80/min |
| The good stool | 80 | Brim 1,500 → 2,250 |
| Your name behind the bar | 140 | Trickle → 100/min, brim → 3,000, scoop → 50 |

Everything is reachable in one night — 275 favours is 5,500 chips collected,
around ninety minutes at base rate and less as the trickle upgrades land. So
the decision is **ordering**, not selection: trickle compounds across the rest
of the session, scoop only makes the next few minutes feel better, and brim
only pays if you intend to walk away. Buying the cheap thing first because it
is cheap is probably wrong.

Probably. The best order is **computed by a test rather than asserted here**,
and that is a lesson rather than a hedge: an earlier draft of this design had
its optimum worked out by hand, and a brute-force enumeration then found a
better line the hand analysis had not considered — one that passed on an
upgrade it could already afford. A hand-tuned ladder needs a search to say
what it actually pays, so the search is the spec.

### The guard, which is arithmetic

The rate is enforced twice, and the second one is the one that matters.

**By the mechanism.** Level never exceeds the brim, and the trickle is the only
thing that raises it. Chips cannot arrive faster than they drip.

**By a guard that does not trust the mechanism.** Every payout checks

```
paidThisNight + pay  ≤  MAX_TRICKLE × (now - nightStartedAt) + MAX_BRIM
```

where `MAX_TRICKLE` and `MAX_BRIM` are the fully-upgraded values, computed from
the ladder rather than written down. It holds even if the level arithmetic is
*wrong*, which is the point: a guard derived from what the game is supposed to
allow is a guard that agrees with the bug. This one is derived from the
fastest the game could conceivably pay, and it survives.

In honest play it never binds — a fully upgraded jar sits exactly on it and
every real jar is below — and a test asserts that.

## The jar shows what there is

There is no number telling you what you have banked, no "1,240 / 1,500", no bar
under the button. **The level in the glass is the state of the game.** Full
means go; low means the next tap is worth a trickle; you look and you know.
That is one fewer thing on screen, which matters most at 375px where the jar is
nearly all of it.

The only figures on screen are what you have earned tonight and your favours,
because those are the two you spend.

## The anti-cheat

In order of how much each one actually does.

**1. The server owns the jar.** Level, trickle, brim, scoop, favours, upgrades,
the clock, the payout — all computed server-side off the persisted `Jar`. The
client is told what it has, never asked. `CLAUDE.md`: hiding a control is a
courtesy, refusing the message is the rule.

**2. A tap is one atomic store operation.** Not "read the jar, decide, credit
the chips" across three awaits — that is the race where eight sockets each read
a full jar and each get paid. One `Store` method does the whole thing, the way
`send()` is one method rather than two `adjustChips` calls, and for the
identical reason its comment gives: a debit that lands and a credit that does
not is chips destroyed and nobody knows. Mongo does it as a single conditional
`findOneAndUpdate`, exactly as `claimDaily` already does; the memory store does
it without an intervening `await`.

Those two protect chips. The three below protect something else, and it is
worth saying plainly what.

**The threat model changed when the daily cap went away.** Under a fixed tap
allowance an autoclicker gained nothing — it could not buy more taps. Under a
trickle it can farm unattended, and the only thing separating a cheat from a
player is that the player had to *be there*. So these three exist to make
farming cost somebody their evening rather than costing them nothing:

**3. Each tap carries the token the last one returned.** The jar holds a token;
a tap must echo it; a served tap mints a new one. Without it a client fires a
hundred taps in one batch before any ack returns, and the two checks below
never get a chance to look, because there are no intervals to look at. With it,
every tap is a genuine round trip. **A refused tap returns a fresh token and
the current jar**, so a refusal resyncs the client rather than deadlocking it.

**4. A floor on the interval.** A tap landing under 50ms after the last accepted
one is refused. That is twenty a second, past any hand.

**5. Rhythm.** The jar keeps its last twelve gaps. A tap is refused when there
are at least eight of them *and* the median gap is under 250ms *and* their
spread — `max - min`, in milliseconds, not a standard deviation — is under
15ms. An autoclicker is a metronome; a hand is not. Both conditions are
required, so a slow steady tapper is fine and a fast erratic one is fine; only
fast *and* inhumanly even trips it.

**A refused tap costs nothing.** No chips, no favours, and nothing leaves the
jar — the level is untouched, so a refusal is not even a small loss. The server
says plainly what happened — "that was too even to be a hand" — and the player
carries on. A false positive costs somebody one tap, which is the right price
for a heuristic.

Note what layers 3–5 are *not* claimed to do. They do not bound the faucet;
the trickle does that, and it does it whether the tapper is a person or a
script. They make automation tedious rather than impossible, and that is the
honest description of them.

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
use every day, so the change is visible by design: the profile should say where
the chips went, not silently lose a button.

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
  jar.ts          levelAt(jar, now), tap(jar, now), the brim/trickle/scoop arithmetic
  ladder.ts       the upgrades, and what a jar's numbers are given what is bought
  rhythm.ts       the metronome test, alone and testable
  guard.ts        MAX_TRICKLE, MAX_BRIM and the payout guard, computed from the ladder
  listing.ts      GameListing
  theme.css
packages/economy/src/
  store.ts        Jar on Profile; tapJar() and buyUpgrade() on Store; daily removed
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
in. That is what makes the guard and the rhythm test cheap to assert
exhaustively, and it is why the level is computed from a timestamp rather than
ticked by something that owns a timer.

The handlers go in **`apps/server/src/tips.ts`**, not in `server.ts`. That file
is 2,414 lines and wires Slots inline; a fifth game inline would put it past
2,600. A `wireTips(socket, deps)` called from the connection handler follows
the shape already there without extending the pile.

`tips.css` must be imported by something — `CLAUDE.md` notes this repo has had
orphan stylesheets that nothing loads.

## The protocol

```ts
"tips:open": (payload: Record<string, never>, ack: (jar: JarView) => void) => void;
"tips:tap":  (payload: { token: string }, ack: (result: TapResult) => void) => void;
"tips:buy":  (payload: { upgrade: string; token: string }, ack: (result: TapResult) => void) => void;
```

```ts
interface JarView {
  /** Chips in the jar as of `at`. The client fills in from here on its own clock. */
  level: number;
  at: number;
  brim: number;
  /** Chips per minute, so the client can draw the level rising between taps. */
  trickle: number;
  scoop: number;
  favours: number;
  bought: string[];
  chipsTonight: number;
  /** When upgrades and favours expire. */
  nightEndsAt: number;
  /** What the next tap must carry. */
  token: string;
}

type TapResult =
  | { ok: true; paid: number; balance: number; jar: JarView }
  | { ok: false; error: string; jar: JarView };
```

The refusal carries the jar too — that is what makes a refused tap recoverable
rather than terminal.

Sending `level`, `at` and `trickle` rather than just a level lets the client
draw the jar filling smoothly between taps without asking. It is deriving, not
inventing: same arithmetic, same inputs, and every tap's ack replaces it with
the server's answer.

`buy` takes the token for the same reason a tap does: buying is the other thing
that spends a jar's resources, and a batch of concurrent buys is the same race.
A served buy mints a new token, so the two share one chain. **Buying is not
subject to the interval or rhythm checks** — those are about how fast a hand can
hit a jar, and a buy may legitimately follow a tap by five milliseconds because
the player had already made up their mind.

## How a tap feels

`CLAUDE.md` allows showing a fact the client can derive and forbids inventing
one. The scoop is deterministic and both sides compute it from the same
`JarView`, so **the tap lands instantly**: a chip arcs from where the thumb hit
into the… out of the jar, the level drops, the counter ticks. Nothing is
guessed. The ack reconciles; a refusal puts the level back and says why.

There is no randomness in the payout, and that is on purpose — a lucky tap
would be a fact only the server knows, which means it would have to arrive face
down and turn over, and a clicker that hesitates a hundred times an hour is a
clicker that feels broken on a bad connection.

- The jar wobbles once with a short overshoot and settles. It does not bounce
  twice and it does not loop.
- Between taps the level creeps up by the trickle — the one thing on the page
  that is genuinely still happening, and so the one thing allowed to animate
  continuously.
- One motion per element; a chip in flight is not restyled mid-arc.
- Every keyframe respects `prefers-reduced-motion`, and the jar still says
  everything it needs to without them — a level is a level either way, and the
  creep becomes a step on each tap.
- A sampled clink, because a chip leaving glass is a physical thing, quiet
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

`byGame.tips`: `add: { taps, chipsTipped }`, `max: { bestNight }`.

**No shared stats.** `games`, `wins` and `chipsWon` are about playing against
people; counting time at the jar as a game won would inflate every profile in
the building with something nobody played against anybody. Nothing is written
to `recordGame` either — a session at the bar is not a hand.

## CLAUDE.md

| Rule | How this satisfies it |
|---|---|
| No route from money to chips | Nothing here takes payment. |
| Chips only won from real people | It does not claim to. It is a faucet, like the daily it replaces, metered by a rate rather than trusted to be small. |
| No bots at a table for chips | No table, no seats, no opponents. |
| The server is the only authority | Every rule is enforced in one atomic store operation. The client draws the jar; it never decides what a tap paid. |
| A press lands immediately | Deterministic payout, so the chip flies on press and reconciles on ack. |
| Everything is animated, and says what happened | A chip comes out of a jar and the level drops. The creep between taps is the only loop, and it is genuinely still happening. |
| Reduced motion | Every keyframe has an off switch; the level reads without any of them. |
| It works on a phone | The jar is the screen at 375px; nothing scrolls sideways. |
| Every bug fix gets a failing test first | Below. |

## Testing

**`games/tips` — pure, so assert exhaustively**

- The level is `min(brim, level + trickle × elapsed)` and never exceeds the
  brim, over a fuzz of elapsed times including zero, negative (a clock that
  went backwards) and absurdly large.
- No sequence of taps and buys over a simulated night pays more than the
  guard, searched over every buy order.
- The guard does not depend on the ladder being affordable: give every upgrade
  a cost of zero and it is unmoved.
- The best buy order is computed and pinned by name, so a tuning change that
  flattens the decision fails loudly. This test exists because a hand-worked
  optimum in an earlier draft was wrong.
- A metronome trace at 100ms ± 1ms is refused. A recorded human trace is not.
  A slow steady trace (800ms, tight spread) is not — only fast *and* even.
- Upgrades and favours clear at `NIGHT_MS` and not a millisecond before; the
  jar's level is untouched by the turnover.

**`packages/economy` — the race, in both stores**

- A hundred concurrent taps on a jar holding one scoop pay exactly one scoop.
  Run against both `MemoryStore` and `MongoStore`, since they are two different
  atomicity arguments.
- Concurrent buys of the same upgrade charge the favours once.
- A jar left for a week holds exactly a brim, not a week of trickle.
- A level carried over a night turnover is not clamped down to the new brim,
  and the trickle adds nothing to it until it is spent below one.

**`apps/server` — socket tests in the style of `slots.test.ts`**

- A stale token is refused, and the refusal carries a usable jar.
- A guest is refused.
- Chips actually reach the account, and `me:chips` is pushed.
- Buying an upgrade you cannot afford is refused and charges nothing.
- Sustained tapping over a simulated hour credits no more than the trickle
  allows — the end-to-end statement of the whole design.

**`apps/web` — in the style of `Slots.test.tsx`**

- The optimistic scoop and the dropped level appear before the ack.
- A refusal rolls both back and shows the reason.
- A dry jar says so and its taps pay the trickle rather than nothing-with-no-
  explanation.
- No horizontal scroll at 375px.

## Deliberately not in this version

- **A daily or lifetime total cap.** Explicitly rejected in brainstorming: how
  long somebody plays is their business. The meter is a rate.
- **Idle income beyond one brim.** The trickle accrues while away but stops at
  the brim, so absence is never worth more than a full jar. Anything else is
  chips for having been asleep.
- **Randomness in the payout.** Costs the instant press for a novelty; see
  *How a tap feels*.
- **Favours carrying between nights.** Turns an allowance into a bank and lets
  a week's absence become one enormous session.
- **A leaderboard of biggest nights.** It would reward exactly the behaviour
  the anti-cheat is trying to make tedious.
- **Flagging or banning suspected autoclickers.** The server refuses the tap
  and says so, which was the decision taken in brainstorming. Nothing accrues
  on the profile and no admin has to adjudicate.
