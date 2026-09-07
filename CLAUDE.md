# The Back Room

A chips-only casino. Blackjack and Greed today, more later.

## The rules every game is held to

These are not preferences. A game that breaks one of them is wrong, however
well it plays.

### There is no real money here, ever

Players get chips daily and nowhere else, except from redemption codes an
admin mints. Nothing in this building takes payment, and nothing in it ever
should. If a change would create a route from money to chips, it is the wrong
change.

### Chips are only won from real people

A player cannot come out of a hand richer unless real people were in it with
them. This is the line that keeps the economy from being a button somebody
holds down.

It follows that:

- **No bots at a table playing for chips.** Bots exist to make a for-fun table
  worth sitting at on your own. They are dealt in at play-money tables and
  refused at every other kind — enforced on the server, not merely hidden in
  the browser.
- **A chips game does not run for one player.** It waits. A table that cannot
  find a second real player does not deal; one that loses its second player
  mid-evening pauses and says so, rather than quietly carrying on paying out.
- **Play money never touches an account.** A for-fun table's purse lives at
  that table and is gone when it closes.

The client may show these rules, but must never be the thing enforcing them.
Anything a browser decides is something a player can decide instead.

### A table that deals itself

Games run on their own clock. Nobody presses start, a round comes round, and
players sit down and leave whenever they like. A table closes when the last
player leaves it.

## How the work is done

- **Every bug fix gets a test that fails without it.** Not a test that passes
  afterwards — one that has been watched failing against the old code.
- **Flakes are bugs.** A test that fails one run in twenty is hiding something;
  find it rather than re-running.
- **The server is the only authority on money.** A game may ask the economy to
  move chips; it may not reach the store, and it may not decide a balance.
- **Comments say why, not what.** The code already says what.

## Shape of the repo

```
packages/core      seating, table lifecycle, the GameAdapter interface
packages/economy   accounts, balances, the daily, redemption codes
packages/rules     dice scoring
packages/shared    the socket protocol and its zod schemas
packages/ui        design tokens and procedural textures
games/greed        six dice, bank it or lose it
games/blackjack    beat the dealer to twenty-one
apps/server        express + socket.io, one game:action envelope
apps/web           react client
```

## Housekeeping

- `npm test`, `npm run typecheck`, `npm run lint` all have to be clean.
- Use `biome format --write <paths>` on files you touched. **Not**
  `biome check --write` across the repo — it applies an import-ordering assist
  this project deliberately leaves off, and rewrites dozens of untouched files.
- `apps/web/public/audio/` is generated from `assets/audio/raw`; it is ignored.
