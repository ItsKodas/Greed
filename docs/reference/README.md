# Reference material

Rulebooks, scoring tables and anything else authoritative about the game.
Drop files here — photos, PDFs, scans, plain text, whatever you have.

## Wanted: the letter-dice edition

The version with `$ G R E E D` on the faces, where the two E's are different
colours (one ebony, one emerald). We know the shape of it already — 500 to come
in, 10,000 to win, bank or press on, lose everything on a scoreless roll. What
is missing is the scoring table.

Specifically:

- **Single letters.** Which face is worth 100, which 50 — and whether any other
  single scores at all.
- **Three of a kind**, per letter. In the pip version three 1s are special
  (1,000) and the rest are face x 100; the letter version needs its own table.
- **Four, five and six of a kind.** Doubling, or flat values?
- **$GREED** — all six dice spelling the word. One source says 1,000 and that it
  needs one E of each colour. Worth confirming.
- **Anything the `$` face does specially.** It may be wild, or may just be the
  high single.
- **Any combination that has no pip-version equivalent.**

A photo of the scoring table alone is enough for most of that.

## Why the colours do not need special handling

The engine treats a die as one of six distinct faces, so mapping
`$ G R E ` (ebony) ` E ` (emerald) ` D` onto faces 1-6 makes the colour rules
fall out for free: "$GREED" becomes a straight (one of each face), and "three of
a kind" already requires three of the same face, which is the same thing as
requiring the E's to match colour. Only the point values and the on-screen
glyphs need adding.
