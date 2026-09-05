# Greed — Multiplayer Dice Game

**Date:** 2026-09-05
**Status:** Approved design, pending implementation plan

## 1. Overview

A browser-based multiplayer implementation of Greed (also known as Farkle,
Zilch, or 10,000): a six-dice press-your-luck game. Players sign in with
Discord, join a room with a five-character code, and play with virtual chips.

Design priorities, in order:

1. **Fairness.** The server owns the dice and the scoring. A modified client
   can misrepresent nothing.
2. **Configurability.** Every optional house rule is a per-lobby setting, not
   a code branch.
3. **Feel.** The game should look and sound like a game, not a form. A
   procedural design system carries the "dim back-room tavern" aesthetic.

### Non-goals

- Real-money wagering. Chips have no purchase path and no cash value.
- Matchmaking, ranked ladders, tournaments, friend lists.
- Native or mobile-app clients. The web client is responsive; that is all.
- Turn-by-turn replay or spectator mode.
- Internationalization.

## 2. The game

### 2.1 Turn structure

1. The active player rolls all six dice.
2. If the roll contains no scoring dice, the player **farkles**: the turn
   score is lost and play passes on.
3. Otherwise the player selects one or more scoring dice to set aside. The
   selection must be *fully scoring* — every selected die must belong to a
   scoring combination.
4. The player then either **banks** (turn score added to game score, play
   passes on) or **rerolls** the remaining dice, continuing from step 2.
5. If all six dice have been set aside, the player has **hot dice**: they
   reroll all six and keep accumulating on the same turn.
6. A player who is not yet "on the board" must bank at least the entry
   threshold in a single turn before any score is recorded.
7. When a player's game score reaches the target, every other player gets one
   final turn. Highest score wins. Ties split the pot and are both recorded as
   winners.

### 2.2 Scoring

The defaults below are the classic set. Every value is a lobby setting.

| Combination | Default | Setting |
|---|---:|---|
| Single 1 | 100 | `singleOne` |
| Single 5 | 50 | `singleFive` |
| Three 1s | 1000 | `tripleOne` |
| Three of a kind (2-6) | face x 100 | `tripleMultiplier` |
| Four of a kind | triple x 2 | `nOfAKind: "double"` |
| Five of a kind | triple x 4 | `nOfAKind: "double"` |
| Six of a kind | triple x 8 | `nOfAKind: "double"` |
| Straight 1-2-3-4-5-6 | 1500 | `straight` |
| Three pairs | 750 | `threePairs` |
| Two triplets | 2500 | `twoTriplets` |
| Four of a kind + a pair | off | `fourPlusPair` |

Alternative `nOfAKind: "flat"` scores four/five/six of a kind as flat
1000 / 2000 / 3000 regardless of face.

### 2.3 Ruleset

```ts
interface Ruleset {
  targetScore: number;             // 10000
  entryThreshold: number;          // 500; 0 disables
  finalRound: boolean;             // true
  turnTimerSeconds: number | null; // 60; null disables

  singleOne: number;               // 100
  singleFive: number;              // 50
  tripleOne: number;               // 1000
  tripleMultiplier: number;        // 100 -> face * 100

  nOfAKind: "double" | "flat";     // "double"
  flatFour: number;                // 1000, used when nOfAKind === "flat"
  flatFive: number;                // 2000
  flatSix: number;                 // 3000

  straight: number | null;         // 1500
  threePairs: number | null;       // 750
  twoTriplets: number | null;      // 2500
  fourPlusPair: number | null;     // null (off)

  farklePenalty: { consecutive: number; points: number } | null; // null (off)
}
```

`farklePenalty` defaults off because it punishes new players harshly; hosts who
want it typically set `{ consecutive: 3, points: 500 }`.

## 3. Architecture

npm workspaces, one Docker image.

```
greed/
  packages/rules/    pure scoring engine - zero runtime dependencies
  packages/shared/   protocol types + zod schemas
  packages/ui/       design system: tokens, textures, components, gallery
  apps/server/       Express + Socket.IO + Mongoose
  apps/web/          React + Vite client
  assets/audio/raw/  source sounds, packed into a sprite at build time
  docs/
```

`packages/rules` having no dependencies is load-bearing. The server scores
authoritatively; the client runs the *same* code to grey out illegal
selections and preview scores without a round trip; the bot runs it to think.
There is exactly one definition of what a roll is worth.

Data flow for a single action:

```
client intent -> socket event -> zod validation -> state machine guard
  -> rules engine -> new room state -> broadcast to room
```

The client never mutates authoritative state. It renders what it is told and
predicts only the score preview, which is derived from the same pure function
the server will use.

## 4. Rules engine (`packages/rules`)

### 4.1 API

```ts
scoreSelection(dice: Die[], rules: Ruleset): ScoreResult
enumerateOptions(dice: Die[], rules: Ruleset): Option[]
hasAnyScore(dice: Die[], rules: Ruleset): boolean
bustProbabilities(rules: Ruleset): Record<1 | 2 | 3 | 4 | 5 | 6, number>

interface ScoreResult {
  valid: boolean;      // every die consumed by a combination
  points: number;      // maximum achievable for this exact selection
  breakdown: Combo[];  // the winning partition, for UI explanation
}
```

### 4.2 Maximum-partition search

Scoring a selection is not a greedy application of rules in priority order.
With `twoTriplets` enabled, `1,1,1,5,5,5` reads either as two triplets (2500)
or as three 1s plus three 5s (1000 + 500 = 1500). Any fixed rule ordering gets
some case wrong.

Instead: **exhaustively search every partition of the selected dice into valid
combinations and take the maximum.** Recursion over the sorted count-vector
with memoization on that vector. The state space is bounded by partitions of
at most six dice — microseconds, and correct by construction rather than by
case analysis.

A selection is `valid: false` if any die cannot be covered by some combination.
This is what stops a player setting aside a dead die to keep more dice in play.

### 4.3 Bust probabilities

Bust chance depends on the active ruleset — enabling three-pairs makes four
dice safer — so the table is *computed*, not hardcoded. At room creation,
enumerate all rolls of n dice for n = 1..6 (46,656 worst case) against
`hasAnyScore` and cache by a hash of the ruleset. Milliseconds, once.

With the base ruleset this reproduces the known figures: 2.31% on six dice
(1080 / 46656), rising to 66.7% on one. These are shown to the player before
they choose to reroll, and drive the bot's expected-value calculation.

## 5. Protocol (`packages/shared`)

Every event has a zod schema, shared by both sides. The server validates on
receipt; the client gets types for free.

**Client to server**

| Event | Payload | Guard |
|---|---|---|
| `lobby:create` | `{ ruleset, buyIn, private }` | authenticated |
| `lobby:join` | `{ code }` | authenticated, room exists, not full |
| `lobby:leave` | — | in a room |
| `lobby:setRules` | `Partial<Ruleset>` | host, lobby state |
| `lobby:setBuyIn` | `{ amount }` | host, lobby state |
| `lobby:setReady` | `{ ready }` | seated |
| `lobby:addBot` | `{ difficulty }` | host, buyIn === 0 |
| `lobby:removeSeat` | `{ seatId }` | host |
| `game:start` | — | host, 2+ seats, all ready |
| `game:roll` | — | active player, phase `awaiting_roll` |
| `game:toggleDie` | `{ index }` | active player, phase `selecting` |
| `game:bank` | — | active player, selection valid, meets threshold |
| `chat:send` | `{ text }` | in room, rate limited |

**Server to client**

| Event | Purpose |
|---|---|
| `room:state` | Full room state. Sent on every change. |
| `game:rolled` | `{ dice }` — triggers the roll animation |
| `game:farkle` | `{ seatId, penalty }` |
| `game:hotDice` | `{ seatId }` |
| `game:banked` | `{ seatId, points, total }` |
| `game:over` | `{ results, pot, winnerIds }` |
| `chat:message` | `{ seatId, text, at }` |
| `error` | `{ code, message }` |

**Full state on every change, no patches.** A room holds at most eight seats;
the state object is under a kilobyte. Diffing would buy nothing and is a
reliable source of desync bugs. Greed has no hidden information — every die is
face-up — so there is nothing to redact per-recipient either.

The discrete `game:*` events exist only to drive animation and sound; they
carry no authority. A client that ignores them still renders correctly from
`room:state`.

## 6. Server (`apps/server`)

### 6.1 Room lifecycle

Rooms live in memory in a `Map<code, Room>`. Mongo stores profiles, chips and
game archives — never live room state.

A game document is written when the game *starts*, at the same moment buy-ins
are debited, with `status: "in_progress"`. It is updated to `"finished"` on
payout. This makes restart recovery possible: on boot the server finds every
`in_progress` game, refunds its escrowed buy-ins, and marks it `"abandoned"`.
Without the start-time write there would be no record of the escrow and chips
would vanish on a crash.

A room seats **two to eight** players. Codes are five characters from
`ABCDEFGHJKLMNPQRTUVWXY346789` — no `O/0`, `I/1`, `S/5`, `Z/2` — generated
with `nanoid` and regenerated on collision.

Room states: `lobby` -> `in_game` -> `finished`.
Turn phases: `awaiting_roll` -> `selecting` -> (`awaiting_roll` | banked | farkled).

### 6.2 Randomness

`crypto.randomInt(1, 7)` per die, server-side, always. No client input feeds
the roll. Dice values reach the client only after they are decided.

### 6.3 Timers, disconnects, and the host

- **Turn timer** (default 60s, host-configurable, can be disabled): on expiry,
  auto-bank if the turn total meets the entry threshold, otherwise treat as a
  farkle. Players get a visible countdown in the final 15 seconds.
- **Disconnect**: the seat is marked disconnected and held for 90 seconds. The
  turn timer keeps running — a disconnect must not stall the table. Reconnect
  restores the seat via the session cookie.
- **Grace expiry**: the seat is removed. If a game is in progress, the player
  forfeits their buy-in, which stays in the pot. This removes the incentive to
  rage-quit a losing position.
- **Host leaves**: host migrates to the longest-connected remaining player.
- **Empty room**: destroyed after five minutes.

### 6.4 HTTP surface

```
GET  /auth/discord            -> redirect with state + PKCE
GET  /auth/discord/callback   -> exchange, upsert user, set session
POST /auth/logout
GET  /api/me                  -> profile, chips, stats
POST /api/daily               -> claim the top-up
GET  /api/games?limit=20      -> the signed-in user's recent games
GET  /healthz                 -> liveness for Docker
```

Everything else is Socket.IO. The client bundle is served statically from the
same Express app in production.

**Sign-in is required to play**, including solo practice. Chips are attached to
identity; a guest path would need a parallel chipless mode and a second set of
rules for what a lobby means. Not worth the branch.

## 7. Data model

```
users
  discordId      string, unique index
  username       string
  globalName     string | null
  avatar         string | null   // Discord CDN hash
  accentColor    number | null   // from Discord, user-overridable
  chips          number
  lastDailyClaim Date | null
  stats { gamesPlayed, wins, chipsWon, highestTurn, highestGame,
          farkles, hotDice, rollsTotal }
  createdAt, updatedAt

games
  code, ruleset, buyIn, pot
  status         "in_progress" | "finished" | "abandoned"
  players [{ userId, username, seat, finalScore, isBot }]
  winnerIds [ObjectId]
  startedAt, endedAt
  index: { "players.userId": 1, endedAt: -1 }, { status: 1 }

sessions                        // managed by connect-mongo
```

Chip mutations use atomic conditional updates — a single `updateOne` filtered
on the balance being at least the buy-in, with an `$inc` in the update — rather
than multi-document transactions. This keeps a plain single-node Mongo
container viable in development; no replica set required.

## 8. Chip economy

- New profiles start with **10,000 chips**.
- **Daily top-up**: if a player has under 2,000 chips and has not claimed in
  20 hours, they may claim 5,000. Nobody is ever locked out.
- **Buy-in**: the host sets 0 to the minimum balance across seated players.
  Deducted at game start and escrowed on the room. Pot = buy-in x seats.
- **Payout**: winner takes the pot; ties split it evenly, remainder to the
  earliest-seated winner.
- **Bots are only permitted in zero-buy-in lobbies.** A bot has no balance to
  debit and no account to pay, so allowing them in a pot would either mint
  chips or destroy them. Restricting them to practice games closes the hole
  with one guard instead of a synthetic house account.

## 9. Bot opponent

Three difficulties, all built on `enumerateOptions` and the bust table:

- **Easy** — keeps the highest-scoring option, banks at a flat 300.
- **Normal** — one-ply expected value. For each candidate keep-set leaving *k*
  dice, compare banking now against continuing, weighted by the bust
  probability for *k*, and take the better line.
- **Hard** — two-ply, with hot-dice awareness (a keep-set that clears all six
  dice is worth far more than its face value) and endgame awareness: when
  trailing in a final round, it correctly takes bad odds, because banking a
  losing score is worth nothing.

Bots act on a randomized 800-2000ms delay so the table has a human rhythm.
They run inside the server's room loop and use the same event handlers as
human players, so there is no privileged bot path to keep in sync.

## 10. Client (`apps/web`)

React + Vite + TypeScript, Zustand mirroring the server's `RoomState`.

Routes: `/` (landing + sign in), `/play` (create or join), `/room/:code`
(lobby and table — one component, state-driven), `/profile`, `/style`.

**Dice** are CSS 3D cubes: six real textured faces, `rotateX`/`rotateY`
transforms, a randomized tumble that settles onto the server-decided face.
This avoids a 3D engine and its physics problem — since the server decides the
result, a physics simulation would have to be rigged to land on a
predetermined face, which is a genuinely hard problem for no gain.

**Selection** is click-to-hold with immediate local feedback: the potential
score updates as dice are picked, non-scoring dice render visibly dead, and the
bust probability for the reroll is shown plainly. The game does not hide the
odds from the player.

`prefers-reduced-motion` is respected: dice cross-fade to their result instead
of tumbling, and chip movement is instant.

## 11. Design system and assets (`packages/ui`)

### 11.1 Tokens

CSS custom properties for the full palette (walnut, felt, leather, brass, bone,
plus red for farkle and gold for wins), a type scale, 4px-based spacing, radii,
and elevation. The entire game re-themes from this one file.

Typography pairs a display serif for headings and player names with a UI sans
using tabular numerals for all scores — scores change constantly and must not
reflow.

### 11.2 Textures

Generated procedurally with seeded `simplex-noise`, rendered to canvas, cached
as tileable data-URIs: **wood grain** (banded noise with ring distortion),
**felt** (fine high-frequency noise with fiber streaks), **worn leather**
(cellular noise with edge darkening), **brushed brass** (anisotropic streaks
over a metal gradient), **paper**, and **vignette/dust** overlays.

Seeded means deterministic: the same build produces the same textures. They
are tiny, resolution-independent, and re-tintable from the token palette.

### 11.3 Components

Behavior comes from Radix primitives (focus traps, keyboard navigation, ARIA,
portalling); appearance is ours.

- **Primitives** — Button (brass / wood / ghost x sizes x hover, active,
  disabled, loading), TextField, Select, Toggle, Slider, Checkbox, Modal,
  Panel, Card, Badge, Avatar, Tooltip, Toast, Tabs.
- **Game pieces** — Die (six faces x idle, rolling, held, scoring, dead), Chip
  denominations, PlayerSeat, ScoreCard, TurnBanner, PotDisplay, DiceTray,
  RulesSummary, plus an SVG icon set.

### 11.4 The gallery

`/style` renders every component in every state alongside texture swatches and
the token palette. This is the asset library: browsable, always current,
and impossible to let rot because it is built from the same components the
game uses.

Static mockups of each screen — landing, lobby, room, table, results, profile —
are produced as a published Artifact **before** app code is written, so the
look is settled before it is expensive to change.

## 12. Audio

`howler.js` for sprite playback, per-bus volume, and browser autoplay unlock.
Three buses: master, SFX, ambience. Volumes persist to localStorage and to the
user profile.

Events: `die_throw`, `die_land` (randomized across variations), `die_select`,
`die_deselect`, `die_dead`, `score_tick`, `combo_triple`, `combo_straight`,
`hot_dice`, `bank_chips`, `farkle`, `turn_start`, `turn_warning`,
`player_join`, `player_leave`, `game_start`, `game_win`, `game_lose`,
`ui_click`, `ui_hover`, `ui_toggle`, `ui_error`, `modal_open`, `modal_close`,
`ambience_room`.

UI sounds are synthesized with Web Audio (enveloped filtered noise and tones,
pitch-varied per trigger so repeats never sound machine-gunned). Physical
sounds — dice on wood, chips — use recorded samples from `assets/audio/raw/`,
normalized and packed into a sprite at build time. Every event falls back to
silence if unmapped, so a missing sample is never a crash and the manifest can
be filled in incrementally.

## 13. Testing

Vitest across the workspace.

- **Rules engine** — the deepest coverage, written test-first. Table-driven
  cases per combination, partition cases where greedy ordering would fail, and
  property tests over all 46,656 six-dice rolls. One invariant pins the classic
  figure: exactly 1080 of them farkle under the base ruleset (2.3148%).
- **Server** — in-process Socket.IO clients drive whole games: join, roll,
  select, bank, hot dice, farkle, entry threshold, final round, payout.
  Adversarial tests assert that out-of-turn actions, invalid selections, and
  banking below the threshold are all rejected.
- **Economy** — concurrent buy-in attempts against one balance must not
  overdraw.
- **Client** — component render tests for the gallery; the visual review
  surface is `/style`.

## 14. Security

- Every inbound event is zod-validated before it reaches a handler.
- Every action is guarded by both the state machine and seat ownership.
- Dice come from `crypto.randomInt` on the server, always.
- Per-socket rate limiting; chat additionally throttled and length-capped.
- Session cookies are `httpOnly`, `sameSite=lax`, `secure` in production.
- OAuth state and PKCE verifier are session-bound and single-use.
- Chip balances change only through atomic conditional updates in server code.
- No user-supplied HTML is ever rendered; chat is plain text.

## 15. Deployment

Multi-stage Dockerfile: build all workspaces, then a `node:24-alpine` runtime
stage running as a non-root user, serving the built client from Express.
`docker-compose.yml` provides `mongo:7` plus the app, wired through an env
file. `/healthz` backs the container healthcheck.

Configuration is entirely environment-driven: `DISCORD_CLIENT_ID`,
`DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `MONGO_URL`, `SESSION_SECRET`,
`PORT`, `PUBLIC_URL`. No host-specific code.

## 16. Build order

Each phase ends at something demonstrable.

1. **Scaffold** — workspaces, TypeScript, vitest, lint, Docker skeleton.
2. **Rules engine** — TDD, no UI. Demo: a passing test suite including the
   1080-farkle invariant.
3. **Design system** — tokens, textures, components, `/style` gallery, and the
   published mockup Artifact. Demo: the gallery and the mockups.
4. **Server** — rooms, state machine, protocol, socket tests. Demo: a full
   game played by test clients.
5. **Client** — lobby and table wired to the server. Demo: a real game between
   two browser windows.
6. **Identity and chips** — Discord OAuth, Mongo profiles, buy-ins, payouts,
   daily top-up. Demo: sign in, play for chips, see the balance move.
7. **Bot** — three difficulties. Demo: solo practice.
8. **Audio and ship** — sprite build, event wiring, Docker image, polish.
