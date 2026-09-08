import type { MAX_SEATS } from "./types.js";

/**
 * What the room needs to know about a game before anyone sits down.
 *
 * Deliberately thin. It is enough to list the games, size their tables and
 * name them, and no more — an interface for playing a game, written while
 * there is only one game, would be a description of that game wearing a
 * disguise. The second game is what earns the right to define that shape, and
 * it will arrive with opinions this one cannot guess.
 */
export interface GameListing {
  /** Stable, lowercase, and used as a URL segment and a stats key. */
  id: string;
  /** What it is called on the sign. */
  name: string;
  /** One line, in the player's language rather than the rules'. */
  blurb: string;
  /**
   * A table game is dealt round a table and shows who is at it. A machine is
   * played alone against the house — no seats, no turns, no opponents. The two
   * share a purse and nothing else, and forcing a machine through a table
   * would bend both out of shape.
   *
   * A party game is a third thing again: everybody plays at once rather than
   * in turn, it wants a crowd rather than a full table, and it is not played
   * for chips at all. Grouping it with the felt would put a game you play with
   * friends on a shelf next to the ones that take your money.
   */
  shape: "table" | "machine" | "party";
  minSeats: number;
  /** Never more than {@link MAX_SEATS}; a game may want fewer. */
  maxSeats: number;
  /** False while it is being built, so it can be listed but not opened. */
  open: boolean;
  /**
   * How the game writes its own name.
   *
   * Greed has been written GRE-E-D since its first screen and it is the whole
   * mark; a game that wants nothing of the sort leaves this out and its name
   * is written plainly.
   */
  mark?: {
    text: string;
    /** Which letter is picked out in the room's own colour, by index. */
    accentAt: number;
  };
  /**
   * The three colours a picture of this game is painted in.
   *
   * The same values its theme.css sets, repeated here because the link cards
   * are drawn on the server where there is no stylesheet to read. They have to
   * agree: change one and change the other.
   */
  theme: {
    /** The room's walls. */
    wall: string;
    /** What the game is played on. */
    felt: string;
    /** The lit colour of the room — Greed's brass, the building's blue. */
    accent: string;
    /** The light inside the tube, a step up from the accent. */
    accentHi: string;
  };
}

/** Every game the room knows about, in the order they should be shown. */
export class Catalogue {
  private readonly games = new Map<string, GameListing>();

  add(listing: GameListing): this {
    this.games.set(listing.id, listing);
    return this;
  }

  get(id: string): GameListing | undefined {
    return this.games.get(id);
  }

  /** Only the ones somebody can actually sit down at. */
  playable(): GameListing[] {
    return [...this.games.values()].filter((game) => game.open);
  }

  all(): GameListing[] {
    return [...this.games.values()];
  }
}
