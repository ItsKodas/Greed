import { Resvg } from "@resvg/resvg-js";

/**
 * The picture a link to this place unfurls into.
 *
 * Every unfurler — Discord, Slack, X, iMessage — fetches the page with
 * something that does not run JavaScript, and then fetches one image. So the
 * card is drawn here rather than in the browser, and it leaves as a PNG rather
 * than the SVG this file actually writes, because none of them will render an
 * SVG.
 *
 * Drawn in the room's own language: the chip from the tab icon, the blue of
 * the sign, and gold only ever meaning money.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** What one card has to say. */
export interface CardSpec {
  /** The game on the felt, or null for the room's own banner. */
  game: { id: string; name: string } | null;
  /** Who opened the table. Null when the card is not about one table. */
  host: string | null;
  /** The table's code, which is also how anybody gets to it. */
  code: string | null;
  seats: number;
  maxSeats: number;
  /** The line under the title: a game's blurb, or what a table is doing. */
  note: string | null;
}

const INK = "#f2f6fb";
const INK_DIM = "#8b97a8";
const NEON_HI = "#7ba9ff";
const CHIP = "#e0b048";
const CLAY = "#171b22";

/**
 * Text on its way into an SVG document.
 *
 * Names come from players, so this is the boundary where one of them stops
 * being a string and becomes markup. Everything drawn here goes through it.
 */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A line cut to what will fit.
 *
 * SVG does not wrap, and a name long enough to run off the card would take the
 * seat count with it. The widths are per-face averages rather than real
 * metrics: this only has to decide where to stop, and being a character out
 * costs nothing at these sizes.
 */
export function fit(text: string, size: number, room: number, em = 0.54): string {
  const each = size * em;
  const most = Math.max(1, Math.floor(room / each));
  if (text.length <= most) {
    return text;
  }
  return `${text.slice(0, Math.max(1, most - 1)).trimEnd()}…`;
}

/** A point on a circle, with zero at the top — the convention the chips use. */
function around(cx: number, cy: number, r: number, degrees: number): [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(radians), cy + r * Math.sin(radians)];
}

/** One seat as a chip: gold for taken, a dark ring for one going spare. */
function chip(cx: number, cy: number, r: number, taken: boolean): string {
  const rim = r * 0.82;
  const arcs: string[] = [];
  for (const centre of [0, 90, 180, 270]) {
    const [ax, ay] = around(cx, cy, rim, centre - 34);
    const [bx, by] = around(cx, cy, rim, centre + 34);
    arcs.push(
      `M ${ax.toFixed(2)} ${ay.toFixed(2)} A ${rim.toFixed(2)} ${rim.toFixed(2)} 0 0 1 ${bx.toFixed(2)} ${by.toFixed(2)}`,
    );
  }
  const colour = taken ? CHIP : "#39414d";
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${taken ? CLAY : "#12151b"}"/>`,
    `<g fill="none" stroke="${colour}" stroke-width="${(r * 0.23).toFixed(2)}">`,
    arcs.map((d) => `<path d="${d}"/>`).join(""),
    "</g>",
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.35).toFixed(2)}" fill="${colour}"/>`,
  ].join("");
}

/**
 * A suit, drawn rather than typed.
 *
 * The obvious way to get a heart onto a card is to write one, and the fonts
 * this renders with have no such glyph — a card with a hollow box where its
 * suit should be is worse than a card with none. Paths always draw.
 */
function suit(x: number, y: number, size: number, red: boolean): string {
  const s = size;
  const d = red
    ? `M ${x} ${y + s * 0.78} C ${x - s * 1.15} ${y + s * 0.02}, ${x - s * 0.72} ${y - s * 0.82}, ${x} ${y - s * 0.24} C ${x + s * 0.72} ${y - s * 0.82}, ${x + s * 1.15} ${y + s * 0.02}, ${x} ${y + s * 0.78} Z`
    : `M ${x} ${y - s * 0.86} C ${x + s * 1.0} ${y + s * 0.02}, ${x + s * 0.58} ${y + s * 0.54}, ${x + s * 0.13} ${y + s * 0.3} L ${x + s * 0.32} ${y + s * 0.78} L ${x - s * 0.32} ${y + s * 0.78} L ${x - s * 0.13} ${y + s * 0.3} C ${x - s * 0.58} ${y + s * 0.54}, ${x - s * 1.0} ${y + s * 0.02}, ${x} ${y - s * 0.86} Z`;
  return `<path d="${d}" fill="${red ? "#a8321f" : "#1b2028"}"/>`;
}

/** A playing card, for the corner of a blackjack banner. */
function pip(x: number, y: number, turn: number, rank: string, red: boolean): string {
  const face = red ? "#a8321f" : "#1b2028";
  return `<g transform="translate(${x} ${y}) rotate(${turn})">
    <rect x="-72" y="-104" width="144" height="208" rx="14" fill="#e8ecf3"/>
    <rect x="-72" y="-104" width="144" height="208" rx="14" fill="none" stroke="#aab4c4" stroke-width="2"/>
    <text x="-50" y="-50" font-family="IBM Plex Sans" font-weight="600" font-size="48" fill="${face}">${rank}</text>
    ${suit(-32, 0, 22, red)}
    ${suit(34, 62, 16, red)}
  </g>`;
}

/** A die, for the corner of a greed banner. */
function die(cx: number, cy: number, turn: number, spots: Array<[number, number]>): string {
  return `<g transform="translate(${cx} ${cy}) rotate(${turn})">
    <rect x="-58" y="-58" width="116" height="116" rx="20" fill="#e8ecf3"/>
    <rect x="-58" y="-58" width="116" height="116" rx="20" fill="none" stroke="#aab4c4" stroke-width="2"/>
    ${spots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="#1b2028"/>`).join("")}
  </g>`;
}

/**
 * The thing on the right that says which game without spending a word on it.
 *
 * Kept behind the type and slightly turned, because it is the furniture in the
 * room rather than a second headline competing with the first.
 */
function motif(game: string | null): string {
  if (game === "blackjack") {
    return `<g opacity="0.92">${pip(944, 322, -13, "A", false)}${pip(1082, 296, 9, "K", true)}</g>`;
  }
  if (game === "greed") {
    return `<g opacity="0.92">
      ${die(958, 240, -12, [[0, 0]])}
      ${die(1092, 330, 8, [
        [-27, -27],
        [27, -27],
        [-27, 27],
        [27, 27],
        [0, 0],
      ])}
      ${die(966, 414, 17, [
        [-27, -27],
        [0, 0],
        [27, 27],
      ])}
    </g>`;
  }
  /*
   * The room itself gets one chip, large. A stack drawn face-on is four discs
   * on top of each other rather than a pile — the pile in the app works
   * because it is seen from the side, and half a pile is worse than one chip
   * drawn properly.
   */
  return `<g opacity="0.92">${chip(1024, 322, 122, true)}</g>`;
}

/**
 * The card, as an SVG document.
 *
 * Pure, and exported, so the layout can be tested without a rasterizer in the
 * way — what a name does to it matters more than what the pixels come out as.
 */
export function cardSvg(spec: CardSpec): string {
  const title = spec.game?.name ?? "The Back Room";
  const line = spec.host === null ? null : `${spec.host}’s table`;
  // Seats mean something at a table and nothing on a banner for a whole game.
  const atTable = spec.game !== null && spec.code !== null;

  const seats: string[] = [];
  if (atTable) {
    for (let index = 0; index < spec.maxSeats; index += 1) {
      seats.push(chip(94 + index * 52, 486, 20, index < spec.seats));
    }
  }

  const noteY = line === null ? 348 : 408;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <radialGradient id="sign" cx="18%" cy="6%" r="78%">
      <stop offset="0%" stop-color="#2e7bff" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#2e7bff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lamp" cx="86%" cy="94%" r="66%">
      <stop offset="0%" stop-color="#e0b048" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#e0b048" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0d1015"/>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#sign)"/>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#lamp)"/>
  ${motif(spec.game?.id ?? null)}
  <rect x="0" y="0" width="${OG_WIDTH}" height="6" fill="#2e7bff" opacity="0.6"/>

  <!-- The sign over the door, kept small: a card is about a table, not a brand. -->
  <text x="72" y="106" font-family="Bevan" font-size="27" letter-spacing="7" fill="${NEON_HI}">THE BACK ROOM</text>

  <!-- What is being played. The one thing anybody reads at thumbnail size. -->
  <text x="72" y="288" font-family="Bevan" font-size="88" fill="${INK}">${esc(fit(title, 88, 780, 0.62))}</text>
  ${
    line === null
      ? ""
      : `<text x="72" y="352" font-family="IBM Plex Sans" font-weight="600" font-size="38" fill="${CHIP}">${esc(fit(line, 38, 760))}</text>`
  }
  ${
    spec.note === null
      ? ""
      : `<text x="72" y="${noteY}" font-family="IBM Plex Sans" font-size="30" fill="${INK_DIM}">${esc(fit(spec.note, 30, atTable ? 740 : 820))}</text>`
  }

  ${seats.join("")}
  ${
    atTable
      ? `<text x="${94 + spec.maxSeats * 52 + 8}" y="496" font-family="IBM Plex Sans" font-size="28" fill="${INK_DIM}">${spec.seats} of ${spec.maxSeats} seats</text>`
      : ""
  }
  ${
    spec.code === null
      ? ""
      : `<g>
    <rect x="72" y="534" width="${64 + spec.code.length * 29}" height="62" rx="10" fill="#12161d" stroke="${CHIP}" stroke-opacity="0.45" stroke-width="2"/>
    <text x="96" y="576" font-family="IBM Plex Mono" font-size="36" letter-spacing="5" fill="${CHIP}">${esc(spec.code)}</text>
  </g>`
  }
</svg>`;
}

/**
 * The fonts the card is drawn with.
 *
 * Handed to the rasterizer as files rather than left to the machine, because a
 * server has no fonts installed worth the name and a container often has none
 * at all — and a card that renders in whatever Debian happened to ship is not
 * a card anybody designed.
 */
const FONT_FILES = [
  "Bevan-Regular.ttf",
  "IBMPlexSans-Regular.ttf",
  "IBMPlexSans-SemiBold.ttf",
  "IBMPlexMono-Medium.ttf",
];

export function fontPaths(root: string): string[] {
  return FONT_FILES.map((name) => `${root}/${name}`);
}

/**
 * One drawn card, kept for a moment.
 *
 * An unfurler is not one request. A link pasted in a busy Discord fans out to
 * every client that renders the embed, and rasterizing the same table four
 * hundred times in a minute is work nobody asked for. Keyed on what the card
 * actually says, so a seat filling produces a new picture and nothing else
 * does.
 */
export class Cards {
  private readonly drawn = new Map<string, Buffer>();
  private readonly fonts: string[];
  /** Small on purpose: this is a cache for a burst, not a store. */
  private readonly most: number;

  constructor(fontRoot: string, most = 64) {
    this.fonts = fontPaths(fontRoot);
    this.most = most;
  }

  png(spec: CardSpec): Buffer {
    const key = JSON.stringify(spec);
    const had = this.drawn.get(key);
    if (had !== undefined) {
      return had;
    }
    const made = Buffer.from(
      new Resvg(cardSvg(spec), {
        font: {
          fontFiles: this.fonts,
          // Nothing from the machine, so a card looks the same everywhere it
          // is rendered — and a missing font file fails here rather than
          // silently becoming whatever was lying about.
          loadSystemFonts: false,
          defaultFontFamily: "IBM Plex Sans",
        },
        fitTo: { mode: "width", value: OG_WIDTH },
      })
        .render()
        .asPng(),
    );
    // Oldest out first. A Map keeps insertion order, which is the whole trick.
    if (this.drawn.size >= this.most) {
      const oldest = this.drawn.keys().next();
      if (!oldest.done) {
        this.drawn.delete(oldest.value);
      }
    }
    this.drawn.set(key, made);
    return made;
  }
}
