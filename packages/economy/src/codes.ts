/**
 * Codes that can be redeemed for chips.
 *
 * With the daily top-up, this is the only other way chips come into existence
 * — which is why every redemption is written down. "Where did these chips come
 * from" should always have an answer.
 */

/** A code as minted, with how much of it has been used. */
export interface CodeRecord {
  code: string;
  chips: number;
  /** How many people may use it. Null means as many as turn up. */
  maxRedemptions: number | null;
  redemptions: number;
  /** Epoch ms, or null for a code that does not expire. */
  expiresAt: number | null;
  /** Why it exists, for the person reading the list in six months. */
  note: string;
  createdBy: string;
  createdAt: number;
  revoked: boolean;
}

export type RedeemFailure =
  | "unknown-code"
  | "already-redeemed"
  | "used-up"
  | "expired"
  | "revoked";

export type RedeemResult =
  | { ok: true; chips: number; balance: number }
  | { ok: false; reason: RedeemFailure };

/**
 * The alphabet a code is written in.
 *
 * No O, 0, I, 1, L or U. The first five because a code is read off a screen
 * and typed by somebody who did not write it; U because it is the one letter
 * that turns an innocent random string into a word worth explaining.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** Characters per code. Ten of thirty gives about 5.9 × 10^14 of them. */
export const CODE_LENGTH = 10;

/** Where the dashes go, purely so a human can read one back over a call. */
const GROUP = 4;

/**
 * A code nobody can guess.
 *
 * The redeem endpoint is the one place in the product where guessing pays, so
 * this uses the platform's cryptographic source rather than Math.random, and
 * rejects the bytes that would bias the alphabet rather than taking a modulus
 * of them.
 */
export function mintCodeText(random: (bytes: number) => Uint8Array): string {
  const size = CODE_ALPHABET.length;
  // The largest multiple of the alphabet that fits in a byte; anything above
  // it would make the first few letters fractionally likelier than the rest.
  const ceiling = Math.floor(256 / size) * size;
  const letters: string[] = [];
  while (letters.length < CODE_LENGTH) {
    for (const byte of random(CODE_LENGTH)) {
      if (byte >= ceiling) {
        continue;
      }
      letters.push(CODE_ALPHABET[byte % size] as string);
      if (letters.length === CODE_LENGTH) {
        break;
      }
    }
  }
  const groups: string[] = [];
  for (let at = 0; at < letters.length; at += GROUP) {
    groups.push(letters.slice(at, at + GROUP).join(""));
  }
  return groups.join("-");
}

/** How a typed code is compared: case and dashes are the typist's business. */
export function normaliseCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Why this code cannot be redeemed right now, or null if it can. */
export function judgeCode(record: CodeRecord, now: number): RedeemFailure | null {
  if (record.revoked) {
    return "revoked";
  }
  if (record.expiresAt !== null && record.expiresAt <= now) {
    return "expired";
  }
  if (record.maxRedemptions !== null && record.redemptions >= record.maxRedemptions) {
    return "used-up";
  }
  return null;
}
