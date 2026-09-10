# One window per game — design

A player has one of each game open at a time. A second window is turned away
at the door, and the window already playing is never disturbed.

Different games at once are fine — Slots on the desk and Blackjack on the
phone is two games, not two of one. The rule is about a game, not about the
building.

## Why there is a rule at all

The obvious reason is that a person playing themselves is not playing anybody,
and a game is a worse game for it.

The load-bearing reason is that some of what a game knows is kept **by
account**, and a second window is a second hand on it. Slots keeps a free-spin
run that way, and says so at `server.ts:311`:

> Kept in memory and by account rather than by socket, so a reconnect does not
> lose them and a second tab cannot play them twice.

Keying by account does what that comment says: there is one run, not two. What
it does not do is decide who is pulling. `slots:spin` reads `owed.left`, then
awaits the bank, the debit, the payout and the record before writing the
decremented count back. Two pulls in flight both read `8` and both write `7`,
and the run outlasts what was awarded. Two windows is the easy way to arrange
that; one window and two presses is the same arrangement.

So there are two pieces of work here and they are not the same piece. The
window rule is what a player sees and is about the shape of the evening. The
spin guard below is an invariant, and invariants do not get to depend on rules
about windows.

## The rule

- One open window per **account** per **game**.
- The window that got there first keeps it. A second is refused on arrival —
  before it picks a table, before it sees a reel — and told why.
- A claim is released the moment its window's socket disconnects. Closing the
  other tab, or walking out of range, frees the game within seconds.
- **Guests are not covered.** There is no account to key on, and nothing about
  a second visit from a nameless browser says it is the same browser. The same
  fact `reclaimable()` already lives with at `server.ts:823`.
- **Play money rides along.** The claim is on the game, and the Slots page
  switches between the for-fun machine and the chips machine in place. A claim
  that came and went with that switch would be a rule the player could not
  see the edges of.

## Telling a return from a second arrival

This is the part the rule stands or falls on. First-wins is only humane if the
server can tell a refresh from a rival, and it cannot do that from the socket
alone: a page that reloads is a new socket, and a socket that died on a train
is an old one that has not been noticed yet. Socket.io's defaults leave a dead
socket in `io.sockets.sockets` for up to about forty-five seconds. Without
something better, a player who reloads on a bad connection is locked out of
their own machine for the length of that.

So each window carries an id, made once and kept in `sessionStorage`:

```ts
// apps/web/src/net/windowId.ts
const KEY = "backroom.window";
```

`sessionStorage` rather than `localStorage`, because the unit is the window and
not the browser: it survives a refresh in the same tab, is not shared with a
second tab, and is gone when the tab closes. It is also what
`useTableSocket.ts` already reaches for to remember a seat, and for the same
reason.

Storage can throw outright in a private window. It fails the way the seat
readers already fail — a browser that will not remember is not a reason to
refuse to play, so an unreadable store falls back to an id held in memory for
the life of the page. Such a window still claims; it just cannot prove itself
across a refresh, and a refresh on a bad connection may briefly be told the
game is open elsewhere. That is a narrow case and the honest one.

**Known hole, deliberately left:** Chrome copies `sessionStorage` into a
duplicated tab, so *Duplicate tab* produces a second window wearing the first
one's id and is allowed. It is rare, it is not a thing anybody does by
accident, and what it could otherwise buy is closed underneath by the spin
guard rather than by the rule.

## Where the rule lives

A second `io.use` middleware, immediately behind the one that resolves
identity. That one is a middleware for a stated reason — *"it settles before
the client's first message is delivered"* — and the claim wants exactly the
same guarantee. A socket refused here never reaches a room, a lobby or a
lever, so there is no second place to remember to check.

```ts
/** Who has which game open, and from which window. */
const open = new Map<string, { window: string; socket: string }>();

// Joined on a character no id can contain, so no pair of them can be made to
// spell another pair's key.
const SEP = "\u0000";
const key = (userId: string, game: string) => userId + SEP + game;
```

A socket is let in when any of these is true:

1. Nothing holds the claim.
2. The claim's window id is this window's — the same tab coming back.
3. The holding socket is no longer in `io.sockets.sockets`.

The third is belt-and-braces and is not what saves anybody from the timeout —
socket.io drops a socket from that map at the same moment it fires the
`disconnect` that already releases the claim, so the two normally happen
together. It is there so a claim cannot outlive its socket if a release is
ever missed, and the map heals itself rather than holding a game shut for the
life of the process. **The window id is the thing that removes the lockout**,
and it does it by making a refresh not need the claim released at all.

Otherwise `next(new Error(...))`, carrying the game's name from `CATALOGUE`:
*"You already have Slots open in another window."* On the way in, the claim is
written or overwritten with this socket's id.

On `disconnect`, the claim is deleted **only if it names this socket**. A
window that was refused, or one that has already been replaced by its own
refresh, must not be able to release somebody else's game on its way out.

## The handshake

```ts
io("", { withCredentials: true, auth: { game: "slots", window: windowId() } })
```

Validated with a zod schema in `shared`, alongside the others. A socket that
declares no game — or a game the catalogue does not know — claims nothing and
is let through; there is no such client today, and a handshake is not the place
to start refusing people over a typo.

Three call sites send it, one per socket in the building:

| File | Game |
| --- | --- |
| `apps/web/src/slots/Slots.tsx:541` | `"slots"` |
| `apps/web/src/table/useTableSocket.ts:143` | the hook's `game` argument |
| `apps/web/src/game/useRoom.ts` | `"greed"` |

## What the refused window shows

A middleware refusal reaches the client as `connect_error` with the server's
message, and socket.io leaves `socket.active` false — it will not quietly
reconnect behind the message. That is the behaviour we want: the window is
turned away and stays away until somebody asks again.

It is a state the page is in, not a complaint that fades, so it is a panel and
not the four-second toast that `useTableSocket` clears errors with:

> **You already have Slots open in another window.**
> Close it and try again.
> `[ Try again ]`

The button calls `socket.connect()`. Without it, a player who has just closed
the other tab is left guessing whether the page is stale or the rule is.

It stands in place of the playing area — the felt, or the machine — rather
than over it. A refused window with a lever still drawn behind the message is
a window with something on it that looks pressable and is not.

Held apart from the existing `connected` flag. A lost connection and a refused
one look nothing alike to a player and must not render alike: one says wait,
the other says go and close a tab.

Phone rules apply as everywhere else — legible and reachable at 375px, the
button thumb-sized, nothing that needs hover.

## Underneath: one spin at a time

Separate from the rule above, and not conditional on it.

```ts
/** Accounts with a pull already in flight. */
const spinning = new Set<string>();
```

`slots:spin` refuses re-entry for an account already in it, and clears in a
`finally` so a throw cannot wedge an account out of its own machine. The
for-fun path is untouched: `spinForFun` is synchronous and has nothing to
interleave with.

Per the house rule on bug fixes, **the test comes first and is watched
failing** against the current code. If the race turns out not to be reachable
from a client — the interleaving is plain in the source, but plain is not the
same as demonstrated — the guard is dropped rather than shipped on the
strength of a reading.

## Testing

Server-side, in the style of `rejoin.test.ts`: two sockets carrying one
identity is the only way any of this is checkable.

- Same account, same game, second window → refused, with the game's name in
  the message.
- Same account, same game, **same window id** → allowed. This is the refresh,
  and it is the test that matters most.
- Same account, two different games → both allowed.
- Two guests, same game → both allowed.
- Holder disconnects → the next window is let in.
- A refused window disconnecting → the holder keeps its claim.

Not tested, and named here so its absence is a decision rather than an
oversight: the third allow-condition above. A claim whose socket has left
`io.sockets.sockets` without its `disconnect` having released it is not a
state a client can be made to produce, and a test that reached into the
server's own maps to fake one would be asserting the fake.
- Slots: two pulls in flight on one free-spin run → the run does not outlast
  its award. Watched failing first.

Client-side: the refused panel renders on `connect_error`, and *Try again*
reconnects.

## What this is not

**It is not an anti-cheat.** A window id is sent by the client and a scripted
client can send any id it likes. This is a rule about windows, enforced
honestly for browsers, and it is worth having on those terms — but nothing in
the economy may rest on it. What the economy rests on is unchanged and stands
alone: `adjustChips` and `bankTake` refuse rather than overdraw, every stake
enters the bank before anything is owed, and the spin guard above is a lock
rather than a courtesy.

**It is not cross-process.** The claims live in memory next to `rooms`,
`freeSpins` and `recentSpins`, which are all in memory already. A second server
process would need more than this file, and it would need it for those three
first. A restart clears every claim, which is a few seconds of nothing at the
door and no worse than what a restart already does to a free-spin run.
