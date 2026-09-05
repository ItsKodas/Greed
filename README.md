# Greed

A multiplayer implementation of **Greed** — the six-dice press-your-luck game also
known as Farkle, Zilch, or 10,000. Play in the browser with friends via a room code.

Play chips only. No real-money wagering, no purchase path.

## Status

**Playable.** Open a table, share the code, play.

| | |
|---|---|
| **Rules engine** | Complete. 111 tests. |
| **Design system** | Complete. Tokens + procedural textures + a live gallery. |
| **Server** | Rooms, turns, reconnect, turn clock, server-authoritative dice. |
| **Client** | Join, lobby and table screens. |
| **Bots** | Easy, normal and hard, deciding by expected value. |
| **Sound** | Recorded dice, synthesised interface. |
| Discord login, chips, persistence | Not started |
| Chat | Not started |

```bash
npm install
npm run dev
```

That starts the game server on `:3001` and the client on `:5173`. Open
<http://localhost:5173>, put in a name, and open a table — then send the
five-character code to whoever you want to play against. Two to eight players.

`npm run dev` also serves the design-system gallery at `/style`, and `npm test`
runs all 226 tests.

Games live in memory, so restarting the server ends them. There are no accounts
and no chips yet — you type a name and sit down. Refreshing the page keeps your
seat; a table of one is solo practice, and the host can seat bots.

Sound files are read from `assets/audio/raw/`. Drop a `.mp3` into
`assets/audio/raw/dice/` and restart — a build step copies whatever is there and
writes a manifest, so nothing needs renaming and no code needs editing.

## How the game works

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

## Layout

```
packages/rules/     scoring engine — pure, zero dependencies, shared by
                    server, client and bot so there is one definition of
                    what a roll is worth
packages/ui/        design tokens and procedural texture generators
apps/web/           browser client (currently just the /style gallery)
docs/               spec, implementation plans, approved mockups
assets/audio/raw/   source sound effects
```

## Design

The look is a dim back-room tavern: walnut, worn baize, brass, bone. Textures are
**generated in code** — SVG `feTurbulence` layered over gradients — rather than
shipped as images, so they are a few hundred bytes each, resolution-independent,
and re-tint from the token palette. `npm run dev` shows every colour, typeface and
surface at `/style`.

The full design is in [`docs/superpowers/specs/`](docs/superpowers/specs/), and the
client-approved screen mockups are in
[`docs/design/`](docs/design/2026-09-05-approved-mockups.html).

## A note on the odds

Bust probability is computed from the active ruleset rather than hardcoded, because
the ruleset genuinely changes it. Under the default rules exactly 1,080 of the
46,656 possible six-dice rolls score nothing (2.31%); with only 1s, 5s and
three-of-a-kind it is 1,440 (3.09%) — three pairs rescues precisely the 360 rolls
shaped two-two-two. Both figures are pinned as tests.

The game shows you the bust chance before you choose to reroll. It does not hide
the odds from the player.
