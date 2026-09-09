# One Window Per Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player has one of each game open at a time — a second window is refused at the socket handshake, and the window already playing is never disturbed.

**Architecture:** A socket declares its game and a per-tab window id in the handshake `auth`. A second `io.use` middleware, behind the one that already resolves identity, holds a `Map` of account+game to the window holding it and refuses a socket that does not hold the claim. The claim is released when its socket disconnects. Underneath and independent of it, `slots:spin` gains a per-account in-flight guard so a free-spin run cannot be raced by two pulls.

**Tech Stack:** TypeScript, socket.io 4.8 (server and client), zod 4, React 18, vitest, @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-10-one-window-per-game-design.md`

## Global Constraints

- `npm test`, `npm run typecheck` and `npm run lint` must all be clean before any commit.
- Format only the files you touched: `biome format --write <paths>`. **Never** `biome check --write` across the repo — it applies an import-ordering assist this project deliberately leaves off.
- Every bug fix gets a test **watched failing** against the old code first. A test that merely passes afterwards has proved nothing.
- Comments say **why**, not what.
- A stylesheet must be imported by something before rules are added to it. `grep` for the filename first — this repo has had orphan `.css` files whose rules were silently dead.
- Any new UI must work at 375px wide, be reachable with a thumb, need no hover, and respect `prefers-reduced-motion`.
- The refusal copy is exactly: `You already have <Game> open in another window.` — `<Game>` is `GameListing.name` from `CATALOGUE`.
- The window-id storage key is exactly `backroom.window`.
- Guests (no account) are never refused. Different games at once are never refused.

---

### Task 1: The claim, server-side

The whole rule, enforced where a refused socket never reaches a room, a lobby or a lever. Everything else in this plan is a client learning to speak to it.

**Files:**
- Modify: `packages/shared/src/schemas.ts` (append; the handshake schema lives beside every other inbound payload schema)
- Modify: `apps/server/src/server.ts:172-176` (add `atGame` to `SocketIdentity`)
- Modify: `apps/server/src/server.ts:46-61` (import the new schema)
- Modify: `apps/server/src/server.ts:1535` (new `io.use`, immediately after the identity middleware)
- Modify: `apps/server/src/server.ts:2238` (release the claim at the top of `disconnect`)
- Test: `apps/server/src/window.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the handshake contract every later task sends against — `auth: { game?: string; window?: string }`, both optional, `game` matched against `CATALOGUE` ids (`"greed"`, `"blackjack"`, `"poker"`, `"slots"`). A refusal arrives at the client as a `connect_error` whose `message` is `You already have <Game> open in another window.`
- Produces: `handshakeSchema` exported from `@backroom/shared/schemas`.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/window.test.ts`. It is modelled on `rejoin.test.ts` — same `start(order)` identity-in-connection-order trick, because two sockets carrying one identity is the only way any of this is checkable.

```ts
import type { AddressInfo } from "node:net";
import { MemoryStore } from "@backroom/economy";
import type { ClientToServer, ServerToClient } from "@backroom/shared";
import { io as connect } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createBackRoomServer } from "./server.js";
import type { BackRoomServer } from "./server.js";

/**
 * One window per game, per account.
 *
 * Only checkable across separate sockets carrying the same identity — which is
 * exactly what a second tab, a second browser and a second device all look
 * like from here. The window id is what tells those apart from a refresh.
 */

type Client = Socket<ServerToClient, ClientToServer>;

let server: BackRoomServer | null = null;
const open: Client[] = [];

afterEach(async () => {
  for (const socket of open.splice(0)) {
    socket.close();
  }
  if (server !== null) {
    await server.close();
    server = null;
  }
});

/** Identities handed out in connection order, so a socket can "be" somebody. */
async function start(order: Array<string | null>): Promise<number> {
  const store = new MemoryStore();
  const ids: Array<string | null> = [];
  for (const name of order) {
    if (name === null) {
      ids.push(null);
      continue;
    }
    const profile = await store.upsertDiscordUser({
      discordId: `discord-${name}`,
      name,
      avatar: null,
      accentColor: null,
    });
    ids.push(profile.id);
  }
  let seen = 0;
  server = createBackRoomServer({
    store,
    auth: null,
    serveClient: false,
    identify: () => {
      const id = ids[seen] ?? null;
      seen += 1;
      return id;
    },
  });
  await new Promise<void>((resolve) => server?.http.listen(0, () => resolve()));
  return (server.http.address() as AddressInfo).port;
}

/**
 * Connects and reports which way it went.
 *
 * Both outcomes are wanted, so neither rejects: a refusal is the result under
 * test as much as an arrival is.
 */
function arrive(
  port: number,
  auth: { game?: string; window?: string },
): Promise<{ ok: true; socket: Client } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const socket: Client = connect(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
      auth,
    });
    open.push(socket);
    socket.on("connect", () => resolve({ ok: true, socket }));
    socket.on("connect_error", (error: Error) =>
      resolve({ ok: false, error: error.message }),
    );
  });
}

describe("one window per game", () => {
  it("turns away a second window on the same game", async () => {
    const port = await start(["Ada", "Ada"]);
    const first = await arrive(port, { game: "slots", window: "w1" });
    expect(first.ok).toBe(true);

    const second = await arrive(port, { game: "slots", window: "w2" });
    expect(second.ok).toBe(false);
    expect(!second.ok && second.error).toBe(
      "You already have Slots open in another window.",
    );
  });

  it("lets the same window back in, which is what a refresh is", async () => {
    /*
     * The test that matters most. Without it the rule is first-wins against
     * the player's own refresh, and a socket that died on a train holds their
     * machine shut for the length of socket.io's ping timeout.
     */
    const port = await start(["Ada", "Ada"]);
    const first = await arrive(port, { game: "blackjack", window: "w1" });
    expect(first.ok).toBe(true);

    const again = await arrive(port, { game: "blackjack", window: "w1" });
    expect(again.ok).toBe(true);
  });

  it("lets one person play two different games at once", async () => {
    const port = await start(["Ada", "Ada"]);
    expect((await arrive(port, { game: "slots", window: "w1" })).ok).toBe(true);
    expect((await arrive(port, { game: "blackjack", window: "w2" })).ok).toBe(true);
  });

  it("does not keep one player out of another player's game", async () => {
    const port = await start(["Ada", "Bram"]);
    expect((await arrive(port, { game: "slots", window: "w1" })).ok).toBe(true);
    expect((await arrive(port, { game: "slots", window: "w2" })).ok).toBe(true);
  });

  it("never turns a guest away, having nothing to key one on", async () => {
    /*
     * The same limit `reclaimable` already lives with: there is nothing about
     * a second visit from a nameless browser that says it is the same browser.
     * Pinned so it is a known limit rather than a surprise.
     */
    const port = await start([null, null]);
    expect((await arrive(port, { game: "slots", window: "w1" })).ok).toBe(true);
    expect((await arrive(port, { game: "slots", window: "w2" })).ok).toBe(true);
  });

  it("lets a socket that names no game through", async () => {
    // Every existing client is one of these, and none of them may break.
    const port = await start(["Ada", "Ada"]);
    expect((await arrive(port, {})).ok).toBe(true);
    expect((await arrive(port, {})).ok).toBe(true);
  });

  it("frees the game when the window holding it closes", async () => {
    const port = await start(["Ada", "Ada"]);
    const first = await arrive(port, { game: "slots", window: "w1" });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    first.socket.close();
    // Long enough for the server to see the close, short enough that it is not
    // secretly waiting out a ping timeout — which would mean the release is
    // not the thing under test.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const second = await arrive(port, { game: "slots", window: "w2" });
    expect(second.ok).toBe(true);
  });

  it("does not let a refused window release the one that holds it", async () => {
    const port = await start(["Ada", "Ada", "Ada"]);
    const first = await arrive(port, { game: "slots", window: "w1" });
    expect(first.ok).toBe(true);

    const refused = await arrive(port, { game: "slots", window: "w2" });
    expect(refused.ok).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The holder is still the holder. A refusal that released the claim on its
    // way out would make the rule self-clearing and useless.
    const third = await arrive(port, { game: "slots", window: "w3" });
    expect(third.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -w @backroom/server -- window.test.ts`

Expected: the refusal tests FAIL — every socket connects, so `second.ok` is `true` where `false` is asserted. The permissive tests (guest, no game, two games, two players) already pass, which is the point: they are the regression net for a rule that must not over-reach.

- [ ] **Step 3: Add the handshake schema**

Append to `packages/shared/src/schemas.ts`:

```ts
/**
 * What a window says about itself as it connects.
 *
 * Both optional, and a socket that sends neither is let through: every client
 * that predates this rule is one of those, and a handshake is not the place to
 * start refusing people. The window id is the client's own and is trusted only
 * to tell a refresh from a rival — never as an identity.
 */
export const handshakeSchema = z.object({
  game: z.string().max(24).optional(),
  window: z.string().min(1).max(64).optional(),
});

export type HandshakePayload = z.infer<typeof handshakeSchema>;
```

- [ ] **Step 4: Carry the claim on the socket**

In `apps/server/src/server.ts`, add to `SocketIdentity` (around line 172):

```ts
interface SocketIdentity {
  /** Null for a guest, who has no account to be checked against. */
  identity: SeatIdentity | null;
  name: string | null;
  /**
   * Which account-and-game claim this socket holds, if it holds one. Kept so
   * `disconnect` can release exactly the claim this socket took and no other.
   */
  atGame: string | null;
}
```

Add `handshakeSchema` to the `@backroom/shared/schemas` import block (around line 46), keeping the existing order of that list.

- [ ] **Step 5: Add the middleware**

In `apps/server/src/server.ts`, immediately after the closing `});` of the identity `io.use` (around line 1562):

```ts
/**
 * Who has which game open, and from which window.
 *
 * Keyed by account and game, so one person may have Slots on the desk and
 * Blackjack on the phone — that is two games, not two of one.
 */
const openGames = new Map<string, { window: string; socket: string }>();

// Joined on a character no id can contain, so no pair of them can be made to
// spell another pair's key.
const openKey = (userId: string, game: string) => `${userId}\u0000${game}`;

/**
 * One window per game, per account.
 *
 * A middleware for the same reason the one above it is: it settles before the
 * client's first message is delivered, so a socket refused here never reaches
 * a room, a lobby or a lever, and there is no second place to remember to
 * check.
 *
 * A window id rather than a socket id, because first-wins is only humane if a
 * refresh can be told from a rival. A page that reloads is a new socket, and a
 * socket that died on a train is an old one that has not been noticed yet —
 * socket.io leaves that one in `io.sockets.sockets` for the best part of a
 * minute, which is a long time to be locked out of your own machine.
 *
 * Not an anti-cheat: the id is the client's own and a script may send any it
 * likes. It is a rule about windows, enforced honestly for browsers, and
 * nothing in the economy rests on it.
 */
io.use((socket, next) => {
  socket.data.atGame = null;
  const parsed = handshakeSchema.safeParse(socket.handshake.auth ?? {});
  const declared = parsed.success ? parsed.data : {};
  const userId = socket.data.identity?.userId ?? null;
  const game = declared.game ?? null;
  const listing = game === null ? undefined : CATALOGUE.get(game);
  // A guest has no account to key on, and a socket naming no game — or one the
  // building does not have — is not at a game to be turned away from.
  if (userId === null || game === null || listing === undefined) {
    next();
    return;
  }
  /*
   * A window that cannot name itself gets its socket id, which matches
   * nothing. That is the private-window case: it still claims, it just cannot
   * prove itself across a refresh.
   */
  const windowId = declared.window ?? socket.id;
  const key = openKey(userId, game);
  const held = openGames.get(key);
  const mine =
    held === undefined ||
    held.window === windowId ||
    /*
     * Belt-and-braces, and not what saves anybody from the ping timeout:
     * socket.io drops a socket from this map as it fires the disconnect that
     * already releases the claim. It is here so a claim cannot outlive its
     * socket if a release is ever missed — the map heals rather than holding a
     * game shut for the life of the process.
     */
    !io.sockets.sockets.has(held.socket);
  if (!mine) {
    next(new Error(`You already have ${listing.name} open in another window.`));
    return;
  }
  openGames.set(key, { window: windowId, socket: socket.id });
  socket.data.atGame = key;
  next();
});
```

- [ ] **Step 6: Release the claim on disconnect**

In `apps/server/src/server.ts`, at the **top** of the `socket.on("disconnect", ...)` handler (line 2238), above `const seat = sockets.get(socket.id);`. It must go above the existing `if (seat === undefined) return;` — a player at the machine has no seat and would never reach it otherwise:

```ts
      /*
       * Only if the claim still names this socket. A window that was refused,
       * or one already replaced by its own refresh, must not be able to
       * release somebody else's game on its way out.
       */
      const claimed = socket.data.atGame;
      if (claimed !== null && openGames.get(claimed)?.socket === socket.id) {
        openGames.delete(claimed);
      }
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npm test -w @backroom/server -- window.test.ts`
Expected: PASS, all eight.

Then the whole server suite, because this middleware sits in front of every socket in it:

Run: `npm test -w @backroom/server`
Expected: PASS. Existing tests connect with no `auth`, so they declare no game and claim nothing.

- [ ] **Step 8: Typecheck, lint and format**

```bash
npm run typecheck && npm run lint && npx biome format --write apps/server/src/server.ts apps/server/src/window.test.ts packages/shared/src/schemas.ts
```

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/server.ts apps/server/src/window.test.ts packages/shared/src/schemas.ts
git commit -m "feat(server): one window per game, per account"
```

---

### Task 2: One spin at a time

Independent of Task 1 and not conditional on it. The window rule is what a player sees; this is an invariant, and invariants do not get to depend on rules about windows — two tabs is the easy way to race a free-spin run, but one tab and two presses is the same race.

**Files:**
- Modify: `apps/server/src/server.ts:316` (beside `freeSpins`)
- Modify: `apps/server/src/server.ts:2073` (the `slots:spin` handler)
- Test: `apps/server/src/slots.test.ts` (append to the existing `describe("the free spins")`, which ends around line 860)

Line numbers above are as the file stood before Task 1, which lands about seventy lines in `server.ts`. Both anchors quote the code they sit beside — search for the quoted line rather than jumping to the number.

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: a new refusal from `slots:spin` — `{ ok: false, error: "One spin at a time." }`.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("the free spins", ...)` block in `apps/server/src/slots.test.ts`, which already has the `scatters(count)` helper in scope:

```ts
  it("does not let two pulls at once stretch the run", async () => {
    /*
     * `freeSpins` is keyed by account so there is one run rather than two —
     * which is what its comment claims and is true. What keying by account
     * does not do is decide who is pulling: the handler reads `owed.left`,
     * then awaits the bank, the debit, the payout and the record before
     * writing the decremented count back. Two pulls in flight both read the
     * same number and both write the same one, and the run outlives its award.
     *
     * Two windows is the easy way to arrange that. One window and two presses
     * is the same arrangement, which is why closing it is a lock rather than a
     * rule about windows.
     */
    const { client } = await openMachine({
      bank: 5_000_000,
      chips: 100_000,
      spinRandom: scatters(3),
    });
    const trigger = await spin(client, 10);
    expect(trigger.ok).toBe(true);
    if (!trigger.ok) {
      return;
    }
    const owed = trigger.freeLeft;
    expect(owed).toBeGreaterThan(1);

    // Both emitted before either is answered, which is the whole point.
    const [a, b] = await Promise.all([spin(client, 10), spin(client, 10)]);

    /*
     * One of them is a spin and the other is refused, or they are answered in
     * turn — either is fine. What is not fine is two free spins that between
     * them cost the run one.
     */
    const counts = [a, b]
      .filter((result) => result.ok && result.wasFree)
      .map((result) => (result.ok ? result.freeLeft : -1))
      .sort((one, two) => one - two);
    if (counts.length === 2) {
      expect(counts).toEqual([owed - 2, owed - 1]);
    } else {
      expect(counts).toEqual([owed - 1]);
    }
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -w @backroom/server -- slots.test.ts -t "two pulls at once"`

Expected: FAIL — both results come back `wasFree: true` with the same `freeLeft` of `owed - 1`, so the assertion sees `[owed - 1, owed - 1]`.

**If it passes**, the race is not reachable from a client and the guard is not shipped on the strength of a reading: stop, delete the test, and report that to the reviewer rather than adding a lock nothing needs.

- [ ] **Step 3: Add the guard**

In `apps/server/src/server.ts`, immediately after `const freeSpins = new Map<string, FreeSpins>();` (line 316):

```ts
  /**
   * Accounts with a pull already in flight.
   *
   * The handler above awaits the bank, the debit and the payout between
   * reading the free-spin count and writing it back, so two pulls that overlap
   * both read the same number. By account rather than by socket, because two
   * windows is only the easiest way to overlap them and not the only one.
   */
  const spinning = new Set<string>();
```

- [ ] **Step 4: Take and release it around the chips path**

In the `slots:spin` handler, immediately after the sign-in check (the block ending `ack({ ok: false, error: "Sign in to play for chips." }); return; }`, around line 2097) — after the `forFun` branch has already returned, so the for-fun machine is untouched. `spinForFun` is synchronous and has nothing to interleave with:

```ts
        if (spinning.has(userId)) {
          ack({ ok: false, error: "One spin at a time." });
          return;
        }
        spinning.add(userId);
        try {
```

…and wrap the remainder of the handler body in that `try`, closing before the end of the async arrow:

```ts
        } finally {
          // In a finally so a throw cannot wedge an account out of its own
          // machine for the life of the process.
          spinning.delete(userId);
        }
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npm test -w @backroom/server -- slots.test.ts`
Expected: PASS, including the long bank-conservation runs that spin in sequence.

- [ ] **Step 6: Typecheck, lint and format**

```bash
npm run typecheck && npm run lint && npx biome format --write apps/server/src/server.ts apps/server/src/slots.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/server.ts apps/server/src/slots.test.ts
git commit -m "fix(slots): a free-spin run cannot be stretched by two pulls at once"
```

---

### Task 3: The window id

A tab's name for itself. No behaviour change on its own — nothing sends it yet.

**Files:**
- Create: `apps/web/src/net/windowId.ts`
- Test: `apps/web/src/net/windowId.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `windowId(): string` — stable for the life of a tab, stable across a refresh of that tab, never shared with another tab. Imported by Tasks 5 and 6.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/net/windowId.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Imported fresh in every test, never at the top of the file.
 *
 * The module holds the id in memory as well as in the store, so a test that
 * imported once would be answered from that memory and would never reach the
 * store it is trying to say something about — including, silently, the two
 * below that mock it. A fresh module per test is what a fresh page load is.
 */
async function load() {
  vi.resetModules();
  return await import("./windowId.js");
}

describe("a window's name for itself", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("is the same one twice", async () => {
    const { windowId } = await load();
    expect(windowId()).toBe(windowId());
  });

  it("survives a refresh, which is what sessionStorage buys", async () => {
    const first = (await load()).windowId();
    // A refresh is a fresh module against the same store. That is the whole
    // claim, so it is made with a genuinely fresh module rather than a reread.
    const { WINDOW_KEY, windowId } = await load();
    expect(window.sessionStorage.getItem(WINDOW_KEY)).toBe(first);
    expect(windowId()).toBe(first);
  });

  it("does not hand a second tab the first one's name", async () => {
    /*
     * sessionStorage is per tab, which a single jsdom cannot have two of. What
     * is checkable here is the half that matters: an empty store yields a new
     * id rather than a constant.
     */
    const first = (await load()).windowId();
    window.sessionStorage.clear();
    const second = (await load()).windowId();
    expect(second).not.toBe(first);
  });

  it("still answers when the store will not have it", async () => {
    /*
     * A private window can throw outright on both reads and writes. A browser
     * that will not remember is not a reason to refuse to play — such a window
     * still claims its game, it just cannot prove itself across a refresh.
     */
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("nope");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("nope");
    });
    const { windowId } = await load();
    const id = windowId();
    expect(id.length).toBeGreaterThan(0);
    // Still stable within the page, because it is held in memory too.
    expect(windowId()).toBe(id);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -w @backroom/web -- windowId`
Expected: FAIL — `Failed to resolve import "./windowId.js"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/net/windowId.ts`:

```ts
/**
 * What this window calls itself when it connects.
 *
 * `sessionStorage` rather than `localStorage`, because the unit is the window
 * and not the browser: it survives a refresh in the same tab, is not shared
 * with a second tab, and is gone when the tab closes. That is exactly the line
 * the server needs, which is between a player coming back and a second window
 * of theirs arriving.
 *
 * Not an identity and never trusted as one — the server uses it only to tell a
 * refresh from a rival.
 */
export const WINDOW_KEY = "backroom.window";

/** Held here as well, so a store that will not answer still gets a stable id. */
let here: string | null = null;

function fresh(): string {
  return `w${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function windowId(): string {
  if (here !== null) {
    return here;
  }
  try {
    const stored = window.sessionStorage.getItem(WINDOW_KEY);
    if (stored !== null && stored.length > 0) {
      here = stored;
      return here;
    }
  } catch {
    // A browser that will not remember is not a reason to refuse to play.
  }
  here = fresh();
  try {
    window.sessionStorage.setItem(WINDOW_KEY, here);
  } catch {
    // Same again: the id above still stands for the life of this page.
  }
  return here;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -w @backroom/web -- windowId`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint and format**

```bash
npm run typecheck && npm run lint && npx biome format --write apps/web/src/net/windowId.ts apps/web/src/net/windowId.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/net/windowId.ts apps/web/src/net/windowId.test.ts
git commit -m "feat(web): a window's own name, for telling a refresh from a rival"
```

---

### Task 4: The refused panel

What a turned-away window shows. A component and its stylesheet, wired to nothing yet.

**Files:**
- Create: `apps/web/src/net/Taken.tsx`
- Create: `apps/web/src/net/net.css`
- Modify: `apps/web/src/main.tsx` (import the stylesheet — building furniture, like `taunt.css` above it)
- Test: `apps/web/src/net/Taken.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `<Taken message={string} onRetry={() => void} />`. Rendered by Tasks 5 and 6 **in place of** the playing area, never over it.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/net/Taken.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Taken } from "./Taken.js";

describe("a window that has been turned away", () => {
  it("says which game and what to do about it", () => {
    render(
      <Taken message="You already have Slots open in another window." onRetry={() => {}} />,
    );
    expect(
      screen.getByText("You already have Slots open in another window."),
    ).toBeTruthy();
  });

  it("offers a way back in, so nobody has to guess", () => {
    const retry = vi.fn();
    render(<Taken message="You already have Slots open in another window." onRetry={retry} />);
    screen.getByRole("button", { name: /try again/i }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -w @backroom/web -- Taken`
Expected: FAIL — `Failed to resolve import "./Taken.js"`.

- [ ] **Step 3: Write the component**

Create `apps/web/src/net/Taken.tsx`:

```tsx
/**
 * The window that came second.
 *
 * A state the page is in rather than a complaint that fades, so it is a panel
 * and not the four-second error toast — and it stands *in place of* the
 * playing area rather than over it. A refused window with a lever still drawn
 * behind the message is a window with something on it that looks pressable and
 * is not.
 */
export function Taken({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="taken" role="status">
      <p className="taken__what">{message}</p>
      <p className="taken__how">Close it and try again.</p>
      <button type="button" className="taken__retry" onClick={onRetry}>
        Try again
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Write the stylesheet and import it**

Create `apps/web/src/net/net.css`:

```css
/*
 * The turned-away panel. Sized for a thumb and legible at 375px, because a
 * player told to go and close a tab is often the one holding the phone.
 */
.taken {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  max-width: 28rem;
  margin: 3rem auto;
  padding: 1.5rem;
  text-align: center;
}

.taken__what {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.taken__how {
  margin: 0;
  opacity: 0.75;
}

.taken__retry {
  min-height: 44px;
  padding: 0 1.5rem;
  border-radius: 999px;
  cursor: pointer;
}
```

In `apps/web/src/main.tsx`, below the `taunt.css` import:

```ts
/*
 * Here for the same reason as the two above: a window turned away from one
 * game is turned away on every game's page, so its panel is the building's
 * furniture rather than any one game's.
 */
import "./net/net.css";
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npm test -w @backroom/web -- Taken`
Expected: PASS.

- [ ] **Step 6: Confirm the stylesheet is not an orphan**

Run: `grep -rn "net.css" apps/web/src`
Expected: the `main.tsx` import. This repo has had `.css` files nothing loaded, whose rules were silently dead.

- [ ] **Step 7: Typecheck, lint and format**

```bash
npm run typecheck && npm run lint && npx biome format --write apps/web/src/net/Taken.tsx apps/web/src/net/Taken.test.tsx apps/web/src/net/net.css apps/web/src/main.tsx
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/net/Taken.tsx apps/web/src/net/Taken.test.tsx apps/web/src/net/net.css apps/web/src/main.tsx
git commit -m "feat(web): the panel a turned-away window shows"
```

---

### Task 5: Blackjack and Poker speak the rule

The shared table hook declares its game, carries the window id, and reports a refusal apart from a disconnection.

**Files:**
- Modify: `apps/web/src/table/useTableSocket.ts:143` (the `io()` call), `:66-105` (the hook's returned interface), and its `connect_error` handling
- Modify: `apps/web/src/blackjack/Blackjack.tsx:96-120` (render site)
- Modify: `apps/web/src/poker/Poker.tsx` (the same render site, around line 187)
- Test: `apps/web/src/table/useTableSocket.test.ts` (create)

**Interfaces:**
- Consumes: `windowId()` from `../net/windowId.js` (Task 3); `<Taken>` from `../net/Taken.js` (Task 4); the handshake contract from Task 1.
- Produces: two new fields on `TableSocketHook<TView>` — `taken: string | null` (the server's message, or null) and `retry: () => void`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/table/useTableSocket.test.ts`. It asserts what the hook hands the socket, which is the part a component test cannot see:

```ts
// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (arg: unknown) => void>();
const fake = {
  on: (event: string, run: (arg: unknown) => void) => {
    handlers.set(event, run);
  },
  emit: vi.fn(),
  close: vi.fn(),
  connect: vi.fn(),
};
const made = vi.fn(() => fake);

vi.mock("socket.io-client", () => ({ io: (...args: unknown[]) => made(...args) }));

import { useTableSocket } from "./useTableSocket.js";

describe("what a table window tells the server about itself", () => {
  beforeEach(() => {
    handlers.clear();
    made.mockClear();
    window.sessionStorage.clear();
  });

  it("names its game and its window in the handshake", () => {
    renderHook(() => useTableSocket("blackjack", () => {}));
    const options = made.mock.calls[0]?.[1] as {
      auth?: { game?: string; window?: string };
    };
    expect(options.auth?.game).toBe("blackjack");
    expect(options.auth?.window).toBe(window.sessionStorage.getItem("backroom.window"));
  });

  it("holds a refusal apart from a disconnection", async () => {
    /*
     * They look nothing alike to a player and must not render alike: one says
     * wait, the other says go and close a tab.
     */
    const { result } = renderHook(() => useTableSocket("blackjack", () => {}));
    handlers.get("connect_error")?.(
      new Error("You already have Blackjack open in another window."),
    );
    await waitFor(() =>
      expect(result.current.taken).toBe(
        "You already have Blackjack open in another window.",
      ),
    );
    expect(result.current.connected).toBe(false);
  });

  it("asks again when told to, because socket.io will not on its own", async () => {
    const { result } = renderHook(() => useTableSocket("blackjack", () => {}));
    handlers.get("connect_error")?.(new Error("You already have Blackjack open in another window."));
    await waitFor(() => expect(result.current.taken).not.toBeNull());
    result.current.retry();
    expect(fake.connect).toHaveBeenCalled();
    await waitFor(() => expect(result.current.taken).toBeNull());
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -w @backroom/web -- useTableSocket`
Expected: FAIL — `options.auth` is `undefined`, and `result.current.taken` does not exist.

- [ ] **Step 3: Send the handshake and catch the refusal**

In `apps/web/src/table/useTableSocket.ts`, add the import beside the others:

```ts
import { windowId } from "../net/windowId.js";
```

Add to the `TableSocketHook<TView>` interface (after `connected: boolean;`):

```ts
  /**
   * The server's reason for turning this window away, or null.
   *
   * Held apart from `connected` on purpose: a lost connection and a refused
   * one look nothing alike to a player. One says wait, the other says go and
   * close a tab.
   */
  taken: string | null;
  /** Asks again. socket.io will not retry a refusal from the middleware. */
  retry: () => void;
```

Add the state beside the others:

```ts
  const [taken, setTaken] = useState<string | null>(null);
```

Change the `io()` call (line 143):

```ts
    const socket: TableSocket = io("", {
      withCredentials: true,
      // Which game this window has open, and which window it is. The server
      // allows one window per game per account and needs both to say so.
      auth: { game, window: windowId() },
    });
```

Add `setTaken(null);` as the **first line inside the existing** `socket.on("connect", ...)` at line 147 — not a second registration of the same event:

```ts
    socket.on("connect", () => {
      setTaken(null);
      setConnected(true);
      const stored = readSeat(game);
      // …the rest of the existing handler, unchanged…
```

And add one new listener beside `socket.on("disconnect", ...)`:

```ts
    socket.on("connect_error", (error: Error) => setTaken(error.message));
```

Add the callback and return both fields:

```ts
  const retry = useCallback(() => {
    setTaken(null);
    socketRef.current?.connect();
  }, []);
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -w @backroom/web -- useTableSocket`
Expected: PASS.

- [ ] **Step 5: Render it on both pages**

In `apps/web/src/blackjack/Blackjack.tsx`, replace the `{state === null ? ... : ...}` block (around line 116) so the panel stands in place of the playing area:

```tsx
      {table.taken !== null ? (
        <Taken message={table.taken} onRetry={table.retry} />
      ) : state === null ? (
        <Sit table={table} invited={urlCode} account={account} />
      ) : (
```

…leaving the existing `<>...</>` branch and its closing `)}` as they are. Import it:

```tsx
import { Taken } from "../net/Taken.js";
```

In `apps/web/src/poker/Poker.tsx`, add the same import and replace the branch at line 193:

```tsx
      {table.taken !== null ? (
        <Taken message={table.taken} onRetry={table.retry} />
      ) : state === null ? (
        <Sit table={table} invited={urlCode} account={account} />
      ) : (
        <>
          <Felt table={table} state={state} seatId={seatId} />
          <Chat log={table.chat} seatId={seatId} onSay={table.say} />
        </>
      )}
```

- [ ] **Step 6: Run the whole web suite**

Run: `npm test -w @backroom/web`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint and format**

```bash
npm run typecheck && npm run lint && npx biome format --write apps/web/src/table/useTableSocket.ts apps/web/src/table/useTableSocket.test.ts apps/web/src/blackjack/Blackjack.tsx apps/web/src/poker/Poker.tsx
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/table/useTableSocket.ts apps/web/src/table/useTableSocket.test.ts apps/web/src/blackjack/Blackjack.tsx apps/web/src/poker/Poker.tsx
git commit -m "feat(web): blackjack and poker declare their window"
```

---

### Task 6: Greed and Slots speak the rule

The two sockets that are not the shared table hook. Greed has its own hook; Slots builds its socket inline.

**Files:**
- Modify: `apps/web/src/game/useRoom.ts` (the `io()` call and its returned shape)
- Modify: `apps/web/src/game/Play.tsx:42-47` and its render site around line 97
- Modify: `apps/web/src/slots/Slots.tsx:512` (state), `:541` (the `io()` call), `:1044` (render site)
- Test: `apps/web/src/slots/Slots.taken.test.tsx` (create)

**Interfaces:**
- Consumes: `windowId()` (Task 3), `<Taken>` (Task 4), the handshake contract (Task 1).
- Produces: nothing later tasks rely on. This is the last task.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/slots/Slots.taken.test.tsx`. A file of its own rather than an addition to `Slots.test.tsx`, which tests exported pieces and mocks nothing:

```tsx
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (arg: unknown) => void>();
const fake = {
  on: (event: string, run: (arg: unknown) => void) => {
    handlers.set(event, run);
  },
  emit: vi.fn(),
  close: vi.fn(),
  connect: vi.fn(),
};
const made = vi.fn(() => fake);

vi.mock("socket.io-client", () => ({ io: (...args: unknown[]) => made(...args) }));

import { MemoryRouter } from "react-router-dom";
import Slots from "./Slots.js";

/*
 * The Navbar reaches for a Link, and useAccount reaches for /api/me. Neither
 * is what this file is about, so both are stood up rather than worked around.
 */
function show() {
  return render(
    <MemoryRouter>
      <Slots />
    </MemoryRouter>,
  );
}

describe("a slots window that came second", () => {
  beforeEach(() => {
    handlers.clear();
    made.mockClear();
    window.sessionStorage.clear();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );
  });

  it("names slots and its window in the handshake", () => {
    show();
    const options = made.mock.calls[0]?.[1] as {
      auth?: { game?: string; window?: string };
    };
    expect(options.auth?.game).toBe("slots");
    expect(options.auth?.window).toBe(window.sessionStorage.getItem("backroom.window"));
  });

  it("shows the panel in place of the machine, not over it", async () => {
    show();
    handlers.get("connect_error")?.(
      new Error("You already have Slots open in another window."),
    );
    await waitFor(() =>
      expect(
        screen.getByText("You already have Slots open in another window."),
      ).toBeTruthy(),
    );
    // A lever still drawn behind the message is something that looks pressable
    // and is not.
    expect(document.querySelector(".slots__floor")).toBeNull();
  });
});
```

`App.test.tsx` uses the same `MemoryRouter` wrapper, which is where `show()` comes from.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -w @backroom/web -- Slots.taken`
Expected: FAIL — `options.auth` is `undefined`, and no panel renders.

- [ ] **Step 3: Wire Slots**

In `apps/web/src/slots/Slots.tsx`, add the imports:

```tsx
import { Taken } from "../net/Taken.js";
import { windowId } from "../net/windowId.js";
```

Beside `const [connected, setConnected] = useState(false);` (line 512):

```tsx
  /**
   * The server's reason for turning this window away, or null. Apart from
   * `connected` on purpose: one says wait, the other says go and close a tab.
   */
  const [taken, setTaken] = useState<string | null>(null);
```

Change the socket (line 541):

```tsx
    const socket = io("", {
      withCredentials: true,
      // One machine per account. The server needs the game and the window to
      // tell a refresh from a second one of these.
      auth: { game: "slots", window: windowId() },
    }) as SpinSocket;
```

Add `setTaken(null);` at the top of the existing `socket.on("connect", ...)`, and beside the `disconnect` listener:

```tsx
    socket.on("connect_error", (error: Error) => setTaken(error.message));
```

At the render site (line 1044), the panel takes the place of `<div className="slots__floor">`, leaving the `<Navbar>` above it:

```tsx
      {taken !== null ? (
        <Taken
          message={taken}
          onRetry={() => {
            setTaken(null);
            socketRef.current?.connect();
          }}
        />
      ) : (
        <div className="slots__floor">
          {/* …everything already here, unchanged… */}
        </div>
      )}
```

- [ ] **Step 4: Wire Greed**

In `apps/web/src/game/useRoom.ts`, add the import beside the others:

```ts
import { windowId } from "../net/windowId.js";
```

Beside `const [connected, setConnected] = useState(false);` (line 141):

```ts
  /**
   * The server's reason for turning this window away, or null. Apart from
   * `connected` on purpose: one says wait, the other says go and close a tab.
   */
  const [taken, setTaken] = useState<string | null>(null);
```

Change the socket (line 178), keeping the comment already above it about transports:

```ts
    const socket: GameSocket = io(SERVER_URL, {
      withCredentials: true,
      // One window per game per account, and the server needs both to say so.
      auth: { game: "greed", window: windowId() },
    });
```

Add `setTaken(null);` as the first line inside the existing `socket.on("connect", ...)` at line 181, and beside the `disconnect` listener at line 196:

```ts
    socket.on("connect_error", (error: Error) => setTaken(error.message));
```

Add the callback beside the other `useCallback`s:

```ts
  const retry = useCallback(() => {
    setTaken(null);
    socketRef.current?.connect();
  }, []);
```

And add both to the returned object at line 411, beside `connected`:

```ts
    connected,
    taken,
    retry,
```

In `apps/web/src/game/Play.tsx`, add `taken` and `retry` to the destructuring at lines 35-47 (beside `connected`), import `import { Taken } from "../net/Taken.js";`, and replace the branch at line 108:

```tsx
      {taken !== null ? (
        <Taken message={taken} onRetry={retry} />
      ) : room === null ? (
        <Join
          actions={actions}
          busy={busy}
          connected={connected}
          invited={urlCode}
          account={account}
        />
```

…leaving the existing `) : (` branch and everything below it unchanged.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npm test -w @backroom/web`
Expected: PASS.

- [ ] **Step 6: Typecheck, lint and format**

```bash
npm run typecheck && npm run lint && npx biome format --write apps/web/src/slots/Slots.tsx apps/web/src/slots/Slots.taken.test.tsx apps/web/src/game/useRoom.ts apps/web/src/game/Play.tsx
```

- [ ] **Step 7: Check it at 375px**

Start the dev server and look at `/slots` in two windows of the same browser, signed in as one account, at 375px wide. The second must show the panel in place of the machine, the button must be thumb-sized, and closing the first must let *Try again* back in. Then confirm a refresh of the surviving window is **not** refused — that is the case the whole window id exists for, and the one a unit test cannot really prove.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/slots/Slots.tsx apps/web/src/slots/Slots.taken.test.tsx apps/web/src/game/useRoom.ts apps/web/src/game/Play.tsx
git commit -m "feat(web): greed and slots declare their window"
```

---

## Notes for the reviewer

Two things the spec calls out that no task closes, both deliberate:

- **Duplicate tab.** Chrome copies `sessionStorage` into a duplicated tab, so that one window wears the first one's id and is allowed. What it could otherwise buy at the machine is closed by Task 2 rather than by the rule.
- **This is not an anti-cheat.** The window id is the client's own and a script may send any it likes. Nothing in the economy rests on it: chips and the bank refuse rather than overdraw, every stake enters the bank before anything is owed, and Task 2 is a lock rather than a courtesy.
