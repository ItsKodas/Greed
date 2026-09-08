import type { GameListing } from "./catalogue.js";

/**
 * Games the building intends to have, listed before they exist.
 *
 * They sit in the catalogue with `open: false`, which the room already knows
 * how to draw: a card with no art and "not open yet" where the blurb goes.
 * Nothing can be created at one, because `playable()` filters on the same flag
 * — so this is a sign on a door rather than a door.
 *
 * They live here rather than in `games/` because there is nothing to put in
 * `games/` yet. A package holding a name and a colour is a package pretending
 * to be a game; when one of these grows rules it gets its own, and its listing
 * moves in there beside them, the way the three real ones already have.
 *
 * Every one of them will have to earn the same things Slots and Blackjack did
 * before it can take a chip: a bank players fill, a cap derived from its own
 * worst outcome, and a cryptographic source for whatever it turns over.
 * Roulette and Baccarat and Craps are all house games, so none of them can be
 * built without that argument being made again.
 */
export const COMING: readonly GameListing[] = [
  {
    id: "poker",
    name: "Poker",
    blurb: "Five to a table, and the pot is everybody's chips.",
    shape: "table",
    minSeats: 2,
    maxSeats: 6,
    /*
     * The one on this list that needs no bank. Players bet into a pot and one
     * of them takes it, so the chips never leave the table — the same footing
     * Greed already stands on, and the reason this is the cheapest of the six
     * to make honest.
     */
    open: false,
    mark: { text: "POKER", accentAt: 0 },
    theme: { wall: "#141a17", felt: "#1c3a2c", accent: "#3f9d6a", accentHi: "#7fe0a8" },
  },
  {
    id: "roulette",
    name: "Roulette",
    blurb: "One wheel, and thirty-seven ways to be wrong.",
    shape: "table",
    minSeats: 1,
    maxSeats: 8,
    open: false,
    mark: { text: "ROULETTE", accentAt: 0 },
    theme: { wall: "#1a1113", felt: "#3a1a1c", accent: "#b8323c", accentHi: "#ff7a84" },
  },
  {
    id: "death-roll",
    name: "Death Rolling",
    blurb: "Halve the number or pay. Last one to roll a one loses.",
    shape: "table",
    /*
     * Two, and it cannot be fewer. A death roll is a duel — the whole game is
     * the number coming down between two people — so this is the one here that
     * would refuse a lone player rather than build a bank for them.
     */
    minSeats: 2,
    maxSeats: 2,
    open: false,
    mark: { text: "DEATH ROLL", accentAt: 0 },
    theme: { wall: "#16141c", felt: "#241f33", accent: "#6b4bd6", accentHi: "#b39cff" },
  },
  {
    id: "baccarat",
    name: "Baccarat",
    blurb: "Player or banker. Bet on which side gets closer to nine.",
    shape: "table",
    minSeats: 1,
    maxSeats: 8,
    open: false,
    mark: { text: "BACCARAT", accentAt: 0 },
    theme: { wall: "#12161c", felt: "#1b2a3d", accent: "#3d7ab8", accentHi: "#86c2ff" },
  },
  {
    id: "craps",
    name: "Craps",
    blurb: "Two dice, a point to make, and a rail of people shouting.",
    shape: "table",
    minSeats: 1,
    maxSeats: 8,
    open: false,
    mark: { text: "CRAPS", accentAt: 0 },
    theme: { wall: "#1a1610", felt: "#33280f", accent: "#c08a1e", accentHi: "#ffd166" },
  },
  {
    id: "two-up",
    name: "Two-up",
    blurb: "Two coins in the air. Heads or tails, and nothing in between.",
    shape: "table",
    minSeats: 1,
    maxSeats: 8,
    open: false,
    mark: { text: "TWO-UP", accentAt: 0 },
    theme: { wall: "#141618", felt: "#232a2e", accent: "#8a9299", accentHi: "#dfe6ea" },
  },
];
