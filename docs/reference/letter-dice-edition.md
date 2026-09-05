# The letter-dice edition

The retail version of Greed sold with letters on the faces instead of pips:
`$ G R E E D`, where the two E dice are different colours — one black (ebony),
one green (emerald). Photo of the scoring card supplied by the project owner;
rules text cross-checked against ultraboardgames.com.

## Confirmed

- **500** in a single round to get on the board.
- **5,000** to win. Note this is *half* the pip version's 10,000.
- A roll that scores nothing forfeits everything accumulated that round.
- The colour rule: `$GREED` requires **one black E and one green E**; three- and
  six-of-a-kind require the E's to be the **same** colour.

## Scoring, as read from the card

| Combination | Points |
|---|---:|
| `$GREED` — all six, one E of each colour | 1,000 |
| `$ $ $` | 600 |
| `G G G` | 500 |
| `R R R` | 400 |
| `E E E` (black) | 300 |
| `E E E` (green) | 300 |
| `D D D D` — **four**, confirmed by the owner | 1,000 |
| Six of a kind | 5,000 |
| Single `D` | 100 |
| Single `G` | 50 |

## Still unknown

- Three `D`s. Not on the card. Probably just 300 as three singles, unconfirmed.
- Four of a kind of any letter other than `D`.
- Five of a kind of anything.

## What this costs us

The colour rule is free: the engine already models a die as one of six distinct
faces, so `$GREED` is exactly our existing `straight` (one of each face), and
"three of a kind" already means three of the *same* face, which is the same
thing as requiring matching E colours.

The **scoring shape** is not free. The engine currently hardcodes two pip-version
assumptions:

- only faces 1 and 5 score as singles (`singleOne`, `singleFive`)
- a triple is worth `face x tripleMultiplier`, with face 1 special-cased

Both break here. The two E's must both score 300 as triples while necessarily
being different faces, which no `face x multiplier` formula allows. And `D`'s
jackpot sits at *four* of a kind, which the engine expresses only as a
face-independent double-or-flat rule.

The fix is to generalise to a per-face table — for each face, what N of that
face is worth — of which the pip ruleset becomes one configuration:

```
pip      singles [100, 0, 0, 0, 50, 0]     triples [1000, 200, 300, 400, 500, 600]
letters  singles [  0, 50, 0, 0, 0, 100]   triples [ 600, 500, 400, 300, 300, ?]
```

That is a rewrite of `applicableCombos` and of every test asserting
`tripleOne` / `tripleMultiplier`, plus re-verification of the 1,080 / 1,440
farkle invariants against the new code.
