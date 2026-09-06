# The Back Room

A small card room and dice room you open in a browser. Sign in with Discord, get
a pile of chips, and share a five-character code with whoever you want to play
against.

**Chips only.** There is no real money anywhere in this, in either direction: no
purchase path, no cash-out, no wagering. Chips arrive as a daily top-up or as a
redeemable code an admin hands out, and that is the whole economy.

## What is in it

| | |
|---|---|
| **Greed** | Six-dice press-your-luck, also called Farkle or 10,000. Two editions, house rules, bots. |
| **Blackjack** | Up to six seats, all playing the dealer. Blackjack pays three to two. |
| **Slots** | Listed, not built. |
| **Accounts** | Discord sign-in, chips, a daily top-up, stats per game and across all of them. |
| **Redeemable codes** | Minted, revoked and audited by an admin; one redemption per player. |
| **Deployment** | Docker image and a compose stack, with or without a bundled database. |

```bash
npm install
npm run dev
```

That starts the server on `:3001` and the client on `:5173`. Open
<http://localhost:5173> and pick a game.

The dev server listens on every interface, so anyone on the same network can
open `http://<your-address>:5173` and sit down. Vite prints the address when it
starts. Signing in from another device needs a little more: see the note by
`CLIENT_ORIGIN` in [`.env.example`](.env.example).

`npm test` runs 456 tests, `npm run lint` and `npm run typecheck` check the rest,
and `npm run dev` also serves the design gallery at `/style`.

### Running the whole thing

```bash
docker compose up --build
```

Then <http://localhost:3001>, where the server serves the built client itself.
The container is configured entirely from `.env` — the port it publishes, the
database, and where people land after signing in. One warning about that last
one: `CLIENT_ORIGIN` is not the same in both ways of running, because Vite
serves the client in development and the server serves it here, so keep a second
file and pass `--env-file .env.production` when deploying.

This points at whatever database `MONGO_URL` names, on the assumption that you
run one already. Note that `localhost` inside a container is the container: to
reach a mongod on the same machine, the URL is `host.docker.internal:27017`.

If there is no database to point at, the second file brings one:

```bash
docker compose -f docker-compose.yml -f docker-compose.bundled-db.yml up --build
```

### What is optional

Everything in [`.env.example`](.env.example). With none of it set the building
still opens: guests can play Greed under a typed name, nothing is kept between
restarts, and the sign-in button is hidden rather than offered and broken. Add
Discord credentials to get profiles, and a `MONGO_URL` to keep them. Blackjack
needs both, because every hand there is played for chips.

## Addresses

A table's code is unique across the whole building, so a link never has to name
the game being played at it — `/X7KQ3` asks the server which game that is and
rewrites itself. That is what makes a shared link survive a game being added.

The friendly form is a subdomain per game: `greed.horizons.gg` and
`blackjack.horizons.gg` land on `/greed` and `/blackjack` of the same server.

## Layout

```
packages/core/      seating, table codes, and the GameAdapter interface
                    every game is played through
packages/rules/     Greed's scoring engine — pure, zero dependencies, shared
                    by server, client and bot
packages/economy/   chips, profiles, stats, history, redeemable codes
packages/shared/    the socket protocol and its validation schemas
packages/ui/        design tokens and procedural texture generators
games/greed/        the dice game: table, bot, adapter, its own palette
games/blackjack/    the card game: shoe, hand values, table, adapter
apps/server/        sockets, auth, HTTP routes — knows no game's rules
apps/web/           the browser client
docs/               specs, implementation plans, approved mockups
assets/audio/raw/   source sound effects
```

The shape worth knowing: `apps/server` hosts tables without knowing what is
played at them. A game supplies a `GameAdapter` — how to deal a table, what an
action means, when it is finished and where the chips go — and the server carries
one `game:action` event whose contents it never reads. That interface was written
after the second game existed rather than before, which is the only way it could
have been honest about what two games actually share.

Table state is sent per seat, not broadcast. Greed has nothing to hide, but
blackjack has a hole card, and a card that reaches the browser has been dealt to
everybody whatever the markup says.

## How Greed works

Roll six dice. Set aside the ones that score, then choose: bank what you have, or
reroll the rest for more. Roll nothing scoring and you lose everything you
accumulated that turn — that's a *farkle*. First to 10,000 wins.

Set aside all six dice and you get **hot dice**: reroll all six and keep building
on the same turn.

| Combination | Points |
|---|---:|
| Single 1 | 100 |
| Single 5 | 50 |
| Three 1s | 1,000 |
| Three of a kind (2–6) | face × 100 |
| Four / five / six of a kind | triple × 2 / × 4 / × 8 |
| Straight 1-2-3-4-5-6 | 1,500 |
| Three pairs | 750 |
| Two triplets | 2,500 |

Every one of those is a per-lobby setting, which is why the scoring engine searches
for the maximum-value partition of your selection rather than applying rules in a
fixed order — with two-triplets enabled, `1,1,1,5,5,5` is worth 2,500 as two
triplets, not 1,500 as two triples, and no fixed ordering gets every configuration
right.

### The letter edition

The host can instead pick the retail version, whose faces read **`$ G R E E D`**
with the two E dice in different colours. `D` scores 100 alone and 1,000 for four
of a kind; `G` scores 50; the triples run 600 / 500 / 400 / 300 / 300 down the
other faces; six of a kind is 5,000, and so is the target.

Scoring is a per-face table — for each face, what N of that face is worth — so the
colour rules need no special handling at all. A die is one of six *distinct* faces,
which makes `$GREED` simply the straight (one of every face, hence one E of each
colour), and an of-a-kind already requires the same face, which is the same thing
as requiring the E's to match. See
[docs/reference/letter-dice-edition.md](docs/reference/letter-dice-edition.md).

## How blackjack works

Four decks in a shoe, reshuffled when it drops below a quarter. Everyone bets,
the host deals, and each seat plays the dealer rather than the other players.
Hit, stand, or double on your first two cards. The dealer stands on seventeen,
soft or hard, and does not draw at all when everybody has already bust.

## Design

The look is a dark room with one lit sign. Two colours carry meaning rather than
mood and the palette depends on them staying rationed: anything **glowing** is
happening now, and anything **gold** is money. Everything else is surfaces.

A game owns its materials; the building owns its interface. Greed repaints the
room walnut and worn baize, blackjack repaints it green, and neither touches the
neon, the chip gold, or the good/bad colours — so a balance looks like a balance
at every table and a win looks like a win in every room.

Textures are **generated in code** — SVG `feTurbulence` layered over gradients —
rather than shipped as images, so they are a few hundred bytes each,
resolution-independent, and re-tint from the token palette. `npm run dev` shows
every colour, typeface and surface at `/style`.

The full design is in [`docs/superpowers/specs/`](docs/superpowers/specs/), and the
client-approved screen mockups are in
[`docs/design/`](docs/design/2026-09-05-approved-mockups.html).

## A note on the odds

Bust probability in Greed is computed from the active ruleset rather than
hardcoded, because the ruleset genuinely changes it. Under the default rules
exactly 1,080 of the 46,656 possible six-dice rolls score nothing (2.31%); with
only 1s, 5s and three-of-a-kind it is 1,440 (3.09%) — three pairs rescues
precisely the 360 rolls shaped two-two-two. Both figures are pinned as tests.

The game shows you the bust chance before you choose to reroll. It does not hide
the odds from the player.
