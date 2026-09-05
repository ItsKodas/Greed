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
  ruleset: z.string().max(40).optional(),
});

export const joinSchema = z.object({ name, code });

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
export type ResumePayload = z.infer<typeof resumeSchema>;
export type SetRulesPayload = z.infer<typeof setRulesSchema>;
