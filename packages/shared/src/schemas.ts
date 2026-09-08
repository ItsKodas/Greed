import { z } from "zod";
import { CODE_ALPHABET, CODE_LENGTH } from "./protocol.js";

/**
 * Every inbound socket payload, validated before it reaches a handler.
 *
 * The server is the only thing that runs these — the client imports the types
 * beside them and never the schemas, so zod stays out of the browser bundle.
 * Anything that fails here is answered with a message rather than a stack
 * trace, and a malformed payload can never reach the game state.
 */

const name = z.string().trim().min(1).max(20);

const code = z
  .string()
  .trim()
  .toUpperCase()
  .length(CODE_LENGTH)
  .refine((value) => [...value].every((letter) => CODE_ALPHABET.includes(letter)), {
    message: "not a table code",
  });

export const createSchema = z.object({
  name,
  /** Which game. Absent means Greed, so links made before there were two still work. */
  game: z.string().max(24).optional(),
  ruleset: z.string().max(40).optional(),
  /** Absent means listed: a table nobody can find is one you have to arrange. */
  listed: z.boolean().optional(),
  /** A table played for play money, which anybody may sit at. */
  forFun: z.boolean().optional(),
  /**
   * How many seats the host wants at it.
   *
   * Bounded here as well as clamped on the way in: this is the only number in
   * the payload a client picks freely, and a table with a thousand seats is a
   * table nobody can render. Absent means as many as the game allows.
   */
  maxSeats: z.number().int().min(2).max(10).optional(),
  /**
   * What the host wants it to cost to sit down.
   *
   * Bounded here and snapped to a real level by the game, which is the part
   * that matters: this is the number deciding how much of somebody's balance
   * is at risk at a table they sat down at, so a client naming its own would
   * be a client setting the stakes for other people.
   */
  buyIn: z.number().int().min(1).max(1_000_000).optional(),
});

export const setListedSchema = z.object({ listed: z.boolean() });

export const joinSchema = z.object({ name, code });

/** Watching needs no name — a watcher is nobody at the table. */
export const watchSchema = z.object({ code });

export const resumeSchema = z.object({
  seatId: z.string().min(1).max(64),
  code,
});

export const toggleSchema = z.object({
  index: z.number().int().min(0).max(5),
});

export const addBotSchema = z.object({
  skill: z.enum(["easy", "normal", "hard"]),
});

export const removeSeatSchema = z.object({
  seatId: z.string().min(1).max(64),
});

export const chatSchema = z.object({
  text: z.string().trim().min(1).max(200),
});

/**
 * Throwing an emote at somebody.
 *
 * Both ids are bounded strings and nothing more. What an emote costs is not in
 * here on purpose: a price the client sends is a price the client chooses, and
 * this one debits an account. The server reads the cost off the emote.
 */
export const tauntSchema = z.object({
  /** A UUID as minted by the store, but only ever compared, never parsed. */
  emoteId: z.string().min(1).max(64),
  seatId: z.string().min(1).max(64),
});

/** Only the fields a host is allowed to move, and only within sane bounds. */
export const setRulesSchema = z.object({
  targetScore: z.number().int().min(1000).max(100_000).optional(),
  entryThreshold: z.number().int().min(0).max(5000).optional(),
  finalRound: z.boolean().optional(),
  turnTimerSeconds: z.number().int().min(15).max(600).nullable().optional(),
  straight: z.number().int().min(0).max(10_000).nullable().optional(),
  threePairs: z.number().int().min(0).max(10_000).nullable().optional(),
  twoTriplets: z.number().int().min(0).max(10_000).nullable().optional(),
  fourPlusPair: z.number().int().min(0).max(10_000).nullable().optional(),
});

export type CreatePayload = z.infer<typeof createSchema>;
export type JoinPayload = z.infer<typeof joinSchema>;
export type WatchPayload = z.infer<typeof watchSchema>;
export type ResumePayload = z.infer<typeof resumeSchema>;
export type SetRulesPayload = z.infer<typeof setRulesSchema>;

export const setBuyInSchema = z.object({
  amount: z.number().int().min(0).max(1_000_000),
});

/** Minting a code. Bounded so a slip of the keyboard cannot mint a fortune. */
export const mintCodeSchema = z.object({
  chips: z.number().int().min(1).max(1_000_000),
  /** Null or absent means as many people as turn up, each once. */
  maxRedemptions: z.number().int().min(1).max(100_000).nullable().optional(),
  /** Epoch ms. Absent means it does not expire. */
  expiresAt: z.number().int().positive().nullable().optional(),
  note: z.string().max(120).optional(),
});

export type MintCodePayload = z.infer<typeof mintCodeSchema>;

/**
 * One action at a table.
 *
 * Only the type is checked here. What else the payload carries is the game's
 * to validate, because only the game knows what "double" needs — and a schema
 * in the middle that had to know would be a third place the rules live.
 */
export const actionSchema = z
  .object({ type: z.string().min(1).max(24) })
  .catchall(z.unknown());

export type ActionPayload = z.infer<typeof actionSchema>;

/**
 * One pull of the lever.
 *
 * The upper bound is the house's, not the machine's: what a bank can actually
 * cover is decided by the stake cap at spin time, and this only stops a
 * nonsense number reaching that arithmetic at all.
 */
export const spinSchema = z.object({
  stake: z.number().int().min(1).max(1_000_000),
  /**
   * How many paylines were bought. Absent means all nine, which is what the
   * machine did before anybody could choose — so an old client still plays.
   */
  lines: z.number().int().min(1).max(9).optional(),
  /** Play money. Absent means chips, so nothing plays for free by accident. */
  forFun: z.boolean().optional(),
});

export type SpinPayload = z.infer<typeof spinSchema>;
